import { expect, test } from "@playwright/test";
import {
  advanceRuntime,
  attachConsoleRecorder,
  getDocumentedAgentApiStatus,
  gotoAgentRuntime,
  gotoAgentRuntimeViaUi,
  readDocumentedAgentState,
} from "../scripts/lib/runtimePlaywright.mjs";

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
  expect(state.health).toBeNull();
  expect(state.ammo).toBeNull();
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

  for (let step = 0; step < 120 && deaths < 2; step += 1) {
    const state = await readDocumentedAgentState(page);
    const alive = state.gameplay?.alive === true;
    const gameOverVisible = state.gameplay?.gameOverVisible === true;

    if (!alive || gameOverVisible) {
      if (previousAlive) {
        deaths += 1;
        expect(state.score?.lastRun).not.toBeNull();
        expect(state.lastRunSummary).not.toBeNull();
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
        sprint: true,
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
