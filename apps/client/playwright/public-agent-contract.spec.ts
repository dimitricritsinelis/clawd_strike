import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  advanceRuntime,
  attachConsoleRecorder,
  getDocumentedAgentApiStatus,
  gotoAgentRuntime,
  gotoAgentRuntimeViaUi,
  readDocumentedAgentState,
} from "../scripts/lib/runtimePlaywright.mjs";

function expectSharedChampionShape(sharedChampion: unknown) {
  if (sharedChampion === null) return;

  expect(sharedChampion).toEqual({
    holderName: expect.any(String),
    score: expect.any(Number),
    controlMode: expect.stringMatching(/^(human|agent)$/),
    scope: "sitewide",
    updatedAt: expect.any(String),
  });
}

async function readSelectionState(page: Page) {
  return page.evaluate(() => {
    const selection = window.getSelection();
    return {
      type: selection?.type ?? "None",
      text: selection?.toString() ?? "",
      rangeCount: selection?.rangeCount ?? 0,
    };
  });
}

function isEffectivelyEmptySelection(selection: Awaited<ReturnType<typeof readSelectionState>>) {
  return selection.text === ""
    && selection.rangeCount <= 1
    && (selection.type === "None" || selection.type === "Caret");
}

async function expectNoSelection(page: Page) {
  // Chromium may preserve an empty caret after drag/click without leaving selected text behind.
  await expect
    .poll(async () => isEffectivelyEmptySelection(await readSelectionState(page)))
    .toBe(true);
}

async function readPublicState(page: Page) {
  return page.evaluate(() => {
    const raw = window.agent_observe?.() ?? window.render_game_to_text?.() ?? null;
    if (typeof raw !== "string") {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });
}

async function expectLoadingScreenMode(page: Page) {
  await expect.poll(async () => {
    const state = await readPublicState(page);
    return state?.mode ?? null;
  }).toBe("loading-screen");
}

async function readInputColor(locator: Locator) {
  return locator.evaluate((element) => window.getComputedStyle(element).color);
}

async function readPlaceholderColor(locator: Locator) {
  return locator.evaluate((element) => window.getComputedStyle(element, "::placeholder").color);
}

async function dragAcrossSelector(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) {
    throw new Error(`Unable to drag across missing selector: ${selector}`);
  }

  await page.mouse.move(box.x + 24, box.y + 24);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 24, box.y + box.height - 24, { steps: 18 });
  await page.mouse.up();
}

async function clearBrowserCache(page: Page) {
  try {
    const client = await page.context().newCDPSession(page);
    await client.send("Network.enable");
    await client.send("Network.clearBrowserCache");
    await client.detach();
  } catch {
    // Chromium-only cache clearing; ignore when unavailable.
  }
}

async function readLoadingScreenRevealState(page: Page) {
  return page.evaluate(() => {
    const start = document.querySelector<HTMLElement>("#start");
    const overlay = document.querySelector<HTMLElement>("#loading-screen-overlay");
    const banner = document.querySelector<HTMLElement>("#mode-banner");
    const nameEntry = document.querySelector<HTMLElement>(".name-entry");
    const infoScreenArt = document.querySelector<HTMLImageElement>(".info-screen-art-img");
    const overlayStyle = overlay ? window.getComputedStyle(overlay) : null;
    const images = Array.from(document.querySelectorAll<HTMLImageElement>("#loading-screen-overlay img")).map((image) => ({
      currentSrc: image.currentSrc,
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    }));

    return {
      backgroundReady: start?.dataset.backgroundReady ?? null,
      assetsReady: start?.dataset.assetsReady ?? null,
      nameEntryReady: start?.dataset.nameEntryReady ?? null,
      nameEntryVisible: start?.dataset.nameEntryVisible ?? null,
      infoReady: start?.dataset.infoReady ?? null,
      infoVisible: start?.dataset.infoVisible ?? null,
      overlayOpacity: overlayStyle?.opacity ?? null,
      overlayVisibility: overlayStyle?.visibility ?? null,
      nameEntryBackgroundImage: nameEntry ? window.getComputedStyle(nameEntry).backgroundImage : null,
      infoScreenImageSrc: infoScreenArt?.currentSrc ?? "",
      bannerVisible: banner?.classList.contains("show") ?? false,
      bannerText: banner?.textContent?.trim() ?? "",
      images,
    };
  });
}

test("exposes the public agent contract before runtime boot", async ({ page }, testInfo) => {
  const recorder = attachConsoleRecorder(page);

  await page.goto(`${testInfo.project.use.baseURL as string}/`, {
    waitUntil: "domcontentloaded",
  });

  const state = await page.evaluate(() => {
    if (typeof window.agent_observe !== "function") {
      throw new Error("agent_observe is unavailable on the loading screen");
    }
    return JSON.parse(window.agent_observe());
  });

  expect(state.contract).toBe("public-agent-v1");
  expect(state.mode).toBe("loading-screen");
  expect(state.runtimeReady).toBe(false);
  expect(state.score?.scope).toBe("browser-session");
  expect("sharedChampion" in state).toBe(true);
  expectSharedChampionShape(state.sharedChampion ?? null);
  expect(state.health).toBeNull();
  expect(state.ammo).toBeNull();
  expect(recorder.counts().errorCount).toBe(0);
});

test("reveals the loading-screen overlay only after the first-paint art is fully ready", async ({ page }, testInfo) => {
  const recorder = attachConsoleRecorder(page);
  const baseUrl = testInfo.project.use.baseURL as string;
  let delayedButtonRequestCount = 0;

  await page.route("**/loading-screen/assets/*", async (route) => {
    const url = route.request().url();
    if (/\/loading-button-(human|agent|skill-md|enter-agent-mode)-(desktop|mobile)\.(avif|webp)$/.test(url)) {
      delayedButtonRequestCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 4200));
    }
    await route.continue();
  });
  await clearBrowserCache(page);

  await page.goto(`${baseUrl}/`, {
    waitUntil: "domcontentloaded",
  });

  await page.waitForSelector("#start[data-background-ready=\"true\"]");

  await expect.poll(async () => readLoadingScreenRevealState(page)).toMatchObject({
    backgroundReady: "true",
    assetsReady: "false",
    overlayOpacity: "0",
    overlayVisibility: "hidden",
  });

  const stalledOverlayState = await readLoadingScreenRevealState(page);
  expect(
    stalledOverlayState.images.some((image) => image.currentSrc.length === 0 || image.complete === false || image.naturalWidth === 0),
  ).toBe(true);

  await page.waitForSelector("#start[data-assets-ready=\"true\"]", { timeout: 20_000 });

  const readyOverlayState = await readLoadingScreenRevealState(page);
  expect(delayedButtonRequestCount).toBeGreaterThan(0);
  expect(readyOverlayState.backgroundReady).toBe("true");
  expect(readyOverlayState.assetsReady).toBe("true");
  expect(Number(readyOverlayState.overlayOpacity)).toBeGreaterThan(0.99);
  expect(readyOverlayState.overlayVisibility).toBe("visible");
  expect(readyOverlayState.images.length).toBeGreaterThan(0);
  expect(
    readyOverlayState.images.every((image) =>
      image.currentSrc.length > 0
      && image.complete
      && image.naturalWidth > 0
      && image.naturalHeight > 0),
  ).toBe(true);
  expect(readyOverlayState.images.every((image) => /\.(avif|webp)$/.test(image.currentSrc))).toBe(true);

  await page.waitForTimeout(250);
  expect(await readLoadingScreenRevealState(page)).toMatchObject(readyOverlayState);
  expect(recorder.counts().errorCount).toBe(0);
});

test("keeps name-entry hidden until the nameplate art is ready for both human and agent flows", async ({ page }, testInfo) => {
  const recorder = attachConsoleRecorder(page);
  const baseUrl = testInfo.project.use.baseURL as string;
  let delayNameplate = false;
  let delayedNameplateRequestCount = 0;
  let releaseNameplateRequest: (() => void) | null = null;

  await page.route("**/loading-screen/assets/*", async (route) => {
    const url = route.request().url();
    if (delayNameplate && /\/loading-nameplate-callsign-(desktop|mobile)\.webp$/.test(url)) {
      delayedNameplateRequestCount += 1;
      await new Promise<void>((resolve) => {
        releaseNameplateRequest = resolve;
      });
    }
    await route.continue();
  });

  async function runNameEntryDelayScenario(openNameEntry: () => Promise<void>) {
    delayNameplate = true;
    releaseNameplateRequest = null;
    const baselineRequestCount = delayedNameplateRequestCount;

    await clearBrowserCache(page);
    await page.goto(`${baseUrl}/`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("#start[data-assets-ready=\"true\"]");

    await openNameEntry();
    await expect.poll(() => delayedNameplateRequestCount).toBeGreaterThan(baselineRequestCount);
    await expect.poll(async () => readLoadingScreenRevealState(page)).toMatchObject({
      nameEntryReady: "false",
      nameEntryVisible: "false",
    });

    const pendingRelease = releaseNameplateRequest;
    if (!pendingRelease) {
      throw new Error("Expected the delayed nameplate request to be pending");
    }
    pendingRelease();
    delayNameplate = false;

    await page.waitForSelector("#start[data-name-entry-ready=\"true\"][data-name-entry-visible=\"true\"]");
    const readyState = await readLoadingScreenRevealState(page);
    expect(readyState.nameEntryBackgroundImage).toContain("loading-nameplate-callsign");
    expect(readyState.nameEntryBackgroundImage).toContain(".webp");
  }

  await runNameEntryDelayScenario(async () => {
    await page.click("#single-player-btn");
  });

  await expect(page.getByTestId("agent-name")).toBeVisible();
  await page.getByTestId("agent-name").press("Escape");
  await expect(page.getByTestId("agent-name")).not.toBeVisible();

  await runNameEntryDelayScenario(async () => {
    await page.getByTestId("agent-mode").click();
    await page.getByTestId("play").click();
  });

  await expect(page.getByTestId("agent-name")).toBeVisible();
  expect(recorder.counts().errorCount).toBe(0);
});

test("suppresses native loading-screen selection while preserving name-entry flow", async ({ page }, testInfo) => {
  const recorder = attachConsoleRecorder(page);
  const baseUrl = testInfo.project.use.baseURL as string;

  await page.goto(`${baseUrl}/`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector("#start[data-assets-ready=\"true\"]");

  await dragAcrossSelector(page, ".logo-img");
  await expectNoSelection(page);

  await dragAcrossSelector(page, ".option-img");
  await expectNoSelection(page);

  await page.click("#info-btn");
  await expect(page.locator(".info-screen-art-img")).toBeVisible();
  await expect
    .poll(async () => readLoadingScreenRevealState(page))
    .toMatchObject({ infoScreenImageSrc: expect.stringMatching(/\.webp$/) });
  await dragAcrossSelector(page, ".info-screen-art-img");
  await expectNoSelection(page);

  await page.click("#info-btn");
  await page.getByTestId("agent-mode").click();
  await page.getByTestId("play").click();

  const agentNameInput = page.getByTestId("agent-name");
  await expect(agentNameInput).toBeVisible();
  await expect(agentNameInput).toBeFocused();
  await agentNameInput.fill("SelectGuard");
  await expect(agentNameInput).toHaveValue("SelectGuard");
  await agentNameInput.press("Escape");

  await expect(agentNameInput).not.toBeVisible();
  await expect(page.locator("#single-player-btn")).toBeFocused();

  await page.getByTestId("agent-mode").click();
  await page.getByTestId("play").click();
  await expect(agentNameInput).toBeFocused();
  await agentNameInput.fill("SelectGuard");
  await agentNameInput.press("Enter");

  await page.waitForFunction(() => {
    const read = () => {
      if (typeof window.agent_observe === "function") {
        return window.agent_observe();
      }
      if (typeof window.render_game_to_text === "function") {
        return window.render_game_to_text();
      }
      return null;
    };

    const raw = read();
    if (typeof raw !== "string") return false;

    try {
      const state = JSON.parse(raw);
      return state.mode === "runtime" && state.runtimeReady === true;
    } catch {
      return false;
    }
  }, { timeout: 20_000 });

  expect(recorder.counts().errorCount).toBe(0);
});

test("requires a valid agent name before start and marks invalid input in red", async ({ page }, testInfo) => {
  const recorder = attachConsoleRecorder(page);
  const baseUrl = testInfo.project.use.baseURL as string;

  await page.goto(`${baseUrl}/`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector("#start[data-assets-ready=\"true\"]");

  await page.getByTestId("agent-mode").click();
  await page.getByTestId("play").click();

  const agentNameInput = page.getByTestId("agent-name");
  await expect(agentNameInput).toBeVisible();
  await expect(agentNameInput).toHaveAttribute("aria-invalid", "true");
  expect(await readPlaceholderColor(agentNameInput)).toBe("rgba(47, 26, 11, 0.8)");

  await agentNameInput.press("Enter");
  await expectLoadingScreenMode(page);

  await agentNameInput.fill("Bad<Name");
  await expect(agentNameInput).toHaveAttribute("aria-invalid", "true");
  expect(await readInputColor(agentNameInput)).toBe("rgb(156, 51, 43)");
  await agentNameInput.press("Enter");
  await expectLoadingScreenMode(page);

  await agentNameInput.fill("Sh1thead");
  await expect(agentNameInput).toHaveAttribute("aria-invalid", "true");
  await agentNameInput.press("Enter");
  await expectLoadingScreenMode(page);

  await agentNameInput.fill("SelectGuard");
  await expect(agentNameInput).toHaveAttribute("aria-invalid", "false");
  await agentNameInput.press("Enter");

  await page.waitForFunction(() => {
    const raw = window.agent_observe?.() ?? window.render_game_to_text?.() ?? null;
    if (typeof raw !== "string") return false;

    try {
      const state = JSON.parse(raw);
      return state.mode === "runtime" && state.runtimeReady === true;
    } catch {
      return false;
    }
  }, { timeout: 20_000 });

  expect(recorder.counts().errorCount).toBe(0);
});

test("requires a valid human name before start", async ({ page }, testInfo) => {
  const recorder = attachConsoleRecorder(page);
  const baseUrl = testInfo.project.use.baseURL as string;

  await page.goto(`${baseUrl}/`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector("#start[data-assets-ready=\"true\"]");

  await page.click("#single-player-btn");

  const nameInput = page.getByTestId("agent-name");
  await expect(nameInput).toBeVisible();
  await expect(nameInput).toHaveAttribute("aria-invalid", "true");
  expect(await readPlaceholderColor(nameInput)).toBe("rgba(47, 26, 11, 0.8)");

  await nameInput.fill("...");
  await expect(nameInput).toHaveAttribute("aria-invalid", "true");
  await nameInput.press("Enter");
  await expectLoadingScreenMode(page);

  await nameInput.fill("Human-Probe");
  await expect(nameInput).toHaveAttribute("aria-invalid", "false");
  await nameInput.press("Enter");

  await page.waitForFunction(() => {
    const raw = window.agent_observe?.() ?? window.render_game_to_text?.() ?? null;
    if (typeof raw !== "string") return false;

    try {
      const state = JSON.parse(raw);
      return state.mode === "runtime" && state.runtimeReady === true;
    } catch {
      return false;
    }
  }, { timeout: 20_000 });

  expect(recorder.counts().errorCount).toBe(0);
});

test("blocks invalid autostart names and returns to focused name entry", async ({ page }, testInfo) => {
  const recorder = attachConsoleRecorder(page);
  const baseUrl = testInfo.project.use.baseURL as string;

  await page.goto(`${baseUrl}/?autostart=agent`, {
    waitUntil: "domcontentloaded",
  });

  const missingNameInput = page.getByTestId("agent-name");
  await expect(missingNameInput).toBeVisible();
  await expect(missingNameInput).toBeFocused();
  await expect(missingNameInput).toHaveAttribute("aria-invalid", "true");
  expect(await readPlaceholderColor(missingNameInput)).toBe("rgba(47, 26, 11, 0.8)");
  await expectLoadingScreenMode(page);

  await page.goto(`${baseUrl}/?autostart=agent&name=Bad%3CName`, {
    waitUntil: "domcontentloaded",
  });

  const invalidNameInput = page.getByTestId("agent-name");
  await expect(invalidNameInput).toBeVisible();
  await expect(invalidNameInput).toBeFocused();
  await expect(invalidNameInput).toHaveValue("Bad<Name");
  await expect(invalidNameInput).toHaveAttribute("aria-invalid", "true");
  expect(await readInputColor(invalidNameInput)).toBe("rgb(156, 51, 43)");
  await expectLoadingScreenMode(page);

  expect(recorder.counts().errorCount).toBe(0);
});

test("keeps the public agent payload fair and minimal in runtime", async ({ page }, testInfo) => {
  const recorder = attachConsoleRecorder(page);
  await gotoAgentRuntime(page, {
    baseUrl: testInfo.project.use.baseURL as string,
    agentName: "PublicProbe",
    extraSearchParams: {
      floors: "blockout",
      walls: "blockout",
      ao: 0,
    },
  });

  const state = await page.evaluate(() => {
    if (typeof window.agent_observe !== "function") {
      throw new Error("agent_observe is unavailable in runtime");
    }
    return JSON.parse(window.agent_observe());
  });

  expect(state.contract).toBe("public-agent-v1");
  expect(state.mode).toBe("runtime");
  expect(state.runtimeReady).toBe(true);
  expect(state.gameplay?.alive).toBe(true);
  expect(state.health).toBeGreaterThan(0);
  expect(state.ammo).toEqual({
    mag: expect.any(Number),
    reserve: expect.any(Number),
    reloading: expect.any(Boolean),
  });
  expect(state.score).toEqual({
    current: expect.any(Number),
    best: expect.any(Number),
    lastRun: null,
    scope: "browser-session",
  });
  expect("sharedChampion" in state).toBe(true);
  expectSharedChampionShape(state.sharedChampion ?? null);
  expect(state.lastRunSummary).toBeNull();

  for (const forbiddenKey of [
    "agent",
    "anchorsDebug",
    "assets",
    "bots",
    "landmarks",
    "map",
    "perf",
    "player",
    "props",
    "render",
    "shot",
    "view",
    "weapon",
  ]) {
    expect(forbiddenKey in state).toBe(false);
  }

  expect(recorder.counts().errorCount).toBe(0);
});

test("supports the documented no-context death and retry loop", async ({ page }, testInfo) => {
  test.slow();
  const recorder = attachConsoleRecorder(page);
  const baseUrl = testInfo.project.use.baseURL as string;

  await page.goto(`${baseUrl}/skills.md`, { waitUntil: "domcontentloaded" });
  const skillsText = (await page.textContent("body")) ?? "";
  for (const requiredSnippet of [
    "[data-testid=\"agent-mode\"]",
    "[data-testid=\"play\"]",
    "[data-testid=\"agent-name\"]",
    "[data-testid=\"play-again\"]",
    "Contract mismatch",
    "render_game_to_text",
    "agent_observe",
  ]) {
    expect(skillsText).toContain(requiredSnippet);
  }

  await gotoAgentRuntimeViaUi(page, {
    baseUrl,
    agentName: "RetryProbe",
  });

  const apiStatus = await getDocumentedAgentApiStatus(page);
  expect(apiStatus.agentApplyAction).toBe(true);
  expect(apiStatus.advanceTime).toBe(true);
  expect(apiStatus.agentObserve || apiStatus.renderGameToText).toBe(true);

  let deaths = 0;
  let respawns = 0;
  let previousAlive = true;

  for (let step = 0; step < 180 && deaths < 2; step += 1) {
    const state = await readDocumentedAgentState(page);
    const alive = state.gameplay?.alive === true;
    const gameOverVisible = state.gameplay?.gameOverVisible === true;

    if (!alive || gameOverVisible) {
      const deathLastRun = state.score?.lastRun ?? null;
      const deathLastRunSummary = state.lastRunSummary ?? null;
      if (previousAlive) {
        deaths += 1;
        expect(deathLastRun).not.toBeNull();
        expect(deathLastRunSummary).not.toBeNull();
      }

      const playAgainButton = page.getByTestId("play-again");
      if (await playAgainButton.isVisible().catch(() => false)) {
        await playAgainButton.click().catch(() => {});
      }

      await page.waitForFunction(() => {
        const read = () => {
          if (typeof window.agent_observe === "function") {
            return window.agent_observe();
          }
          if (typeof window.render_game_to_text === "function") {
            return window.render_game_to_text();
          }
          return null;
        };

        const raw = read();
        if (typeof raw !== "string") return false;

        try {
          const next = JSON.parse(raw);
          return next.mode === "runtime"
            && next.runtimeReady === true
            && next.gameplay?.alive === true
            && next.gameplay?.gameOverVisible !== true;
        } catch {
          return false;
        }
      }, { timeout: 20_000 });

      const restartedState = await readDocumentedAgentState(page);
      expect(restartedState.health).toBe(100);
      expect(restartedState.score?.current).toBe(0);
      expect(restartedState.score?.lastRun ?? null).toBe(deathLastRun);
      expect(restartedState.lastRunSummary?.finalScore ?? null).toBe(deathLastRunSummary?.finalScore ?? null);

      respawns += 1;
      previousAlive = true;
      continue;
    }

    previousAlive = true;
    await page.evaluate(({ stepIndex }) => {
      const fire = stepIndex % 10 === 0;
      const moveX = stepIndex % 60 < 30 ? 0.25 : -0.2;
      const lookYawDelta = stepIndex % 2 === 0 ? 1.35 : -0.7;
      window.agent_apply_action?.({
        moveX,
        moveZ: 1,
        lookYawDelta,
        fire,
      });
    }, { stepIndex: step });
    await advanceRuntime(page, 500);
  }

  expect(deaths).toBeGreaterThanOrEqual(2);
  expect(respawns).toBeGreaterThanOrEqual(2);
  expect(recorder.counts().errorCount).toBe(0);
});
