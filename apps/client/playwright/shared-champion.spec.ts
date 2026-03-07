import { expect, test, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";
import {
  advanceRuntime,
  gotoAgentRuntimeViaUi,
  readDocumentedAgentState,
} from "../scripts/lib/runtimePlaywright.mjs";

function formatScoreHalfPoints(scoreHalfPoints: number): string {
  return (scoreHalfPoints / 2).toLocaleString("en-US");
}

function createChampion(
  holderName: string,
  scoreHalfPoints: number,
  controlMode: "human" | "agent",
  updatedAt = "2026-03-07T12:00:00.000Z",
) {
  return {
    holderName,
    score: scoreHalfPoints / 2,
    scoreHalfPoints,
    controlMode,
    scope: "sitewide" as const,
    updatedAt,
  };
}

function computeFinalScore(kills: number, headshots: number): number {
  return (kills * 10) + (headshots * 2.5);
}

function buildRunSummary(kills: number, headshots: number) {
  const shotsHit = kills;
  const shotsFired = kills;
  const accuracy = shotsFired > 0 ? Math.round(((shotsHit / shotsFired) * 100) * 10) / 10 : 0;
  return {
    survivalTimeS: 0.5,
    kills,
    headshots,
    shotsFired,
    shotsHit,
    accuracy,
    finalScore: computeFinalScore(kills, headshots),
    deathCause: "enemy-fire" as const,
  };
}

function chooseRunAtLeastHalfPoints(minHalfPoints: number): { kills: number; headshots: number; scoreHalfPoints: number } {
  let units = Math.max(0, Math.ceil(minHalfPoints / 5));
  while (true) {
    const kills = Math.ceil(units / 5);
    const headshots = units - (4 * kills);
    if (headshots >= 0 && headshots <= kills) {
      return {
        kills,
        headshots,
        scoreHalfPoints: units * 5,
      };
    }
    units += 1;
  }
}

function chooseRunAtMostHalfPoints(maxHalfPoints: number): { kills: number; headshots: number; scoreHalfPoints: number } {
  let units = Math.max(0, Math.floor(maxHalfPoints / 5));
  while (units >= 0) {
    const kills = Math.ceil(units / 5);
    const headshots = units - (4 * kills);
    if (headshots >= 0 && headshots <= kills) {
      return {
        kills,
        headshots,
        scoreHalfPoints: units * 5,
      };
    }
    units -= 1;
  }

  return {
    kills: 0,
    headshots: 0,
    scoreHalfPoints: 0,
  };
}

function expectChampion(
  champion: unknown,
  expected: { holderName: string; scoreHalfPoints: number; controlMode: "human" | "agent" },
) {
  expect(champion).toEqual({
    holderName: expected.holderName,
    score: expected.scoreHalfPoints / 2,
    scoreHalfPoints: expected.scoreHalfPoints,
    controlMode: expected.controlMode,
    scope: "sitewide",
    updatedAt: expect.any(String),
  });
}

function originHeaders(baseUrl: string) {
  return {
    origin: new URL(baseUrl).origin,
  };
}

async function readSharedChampion(request: APIRequestContext, baseUrl: string) {
  const response = await request.get(new URL("/api/high-score", baseUrl).toString(), {
    failOnStatusCode: false,
  });
  expect(response.ok()).toBe(true);
  return response.json();
}

function buildTelemetryForScore(scoreHalfPoints: number) {
  // Reverse the scoring formula: half_points = kills * 20 + headshots * 5
  // Use all-headshot kills for simplicity: half_points = kills * 25 → kills = half_points / 25
  // If not evenly divisible, use non-headshot kills for remainder
  const killsFromHeadshots = Math.floor(scoreHalfPoints / 25);
  const remainderHalfPoints = scoreHalfPoints - killsFromHeadshots * 25;
  const extraKills = Math.floor(remainderHalfPoints / 20);
  const kills = killsFromHeadshots + extraKills;
  const headshots = killsFromHeadshots;
  return {
    kills,
    headshots,
    shotsFired: Math.max(kills, kills + 5),
    shotsHit: Math.max(kills, kills + 2),
    survivalTimeS: Math.max(1, kills * 2),
  };
}

async function getSessionToken(request: APIRequestContext, baseUrl: string): Promise<string> {
  const response = await request.post(new URL("/api/session", baseUrl).toString(), {
    failOnStatusCode: false,
  });
  expect(response.ok()).toBe(true);
  const data = await response.json();
  expect(typeof data.token).toBe("string");
  return data.token as string;
}

async function startValidatedRun(
  request: APIRequestContext,
  baseUrl: string,
  body: { playerName: string; controlMode: "human" | "agent"; mapId?: string },
) {
  const response = await request.post(new URL("/api/run/start", baseUrl).toString(), {
    failOnStatusCode: false,
    headers: {
      ...originHeaders(baseUrl),
      "content-type": "application/json",
    },
    data: {
      playerName: body.playerName,
      controlMode: body.controlMode,
      mapId: body.mapId ?? "bazaar-map",
    },
  });
  return {
    response,
    body: await response.json().catch(() => null),
  };
}

async function finishValidatedRun(
  request: APIRequestContext,
  baseUrl: string,
  body: { runToken: string; summary: ReturnType<typeof buildRunSummary> },
) {
  const response = await request.post(new URL("/api/run/finish", baseUrl).toString(), {
    failOnStatusCode: false,
    headers: {
      ...originHeaders(baseUrl),
      "content-type": "application/json",
    },
    data: body,
  });
  return {
    response,
    body: await response.json().catch(() => null),
  };
}

async function completeValidatedRun(
  request: APIRequestContext,
  baseUrl: string,
  options: { playerName: string; controlMode: "human" | "agent"; kills: number; headshots: number },
) {
  const started = await startValidatedRun(request, baseUrl, {
    playerName: options.playerName,
    controlMode: options.controlMode,
  });
  expect(started.response.ok()).toBe(true);
  expect(started.body).toEqual({
    runToken: expect.any(String),
    issuedAt: expect.any(String),
    expiresAt: expect.any(String),
    ruleset: "wave-score-v1-k10-hs2_5",
  });

  const summary = buildRunSummary(options.kills, options.headshots);
  const finished = await finishValidatedRun(request, baseUrl, {
    runToken: started.body.runToken,
    summary,
  });

  return {
    started,
    finished,
    summary,
  };
}

async function forcePositiveScoreViaDebug(page: Page): Promise<void> {
  await page.evaluate(() => {
    const debugWindow = window as typeof window & {
      __debug_eliminate_all_bots?: () => number;
    };
    if (typeof debugWindow.__debug_eliminate_all_bots !== "function") {
      throw new Error("Expected __debug_eliminate_all_bots to be available on localhost.");
    }
    debugWindow.__debug_eliminate_all_bots();
  });
  await advanceRuntime(page, 500);
  await expect.poll(async () => {
    const state = await readDocumentedAgentState(page);
    return state.score?.current ?? 0;
  }, { timeout: 10_000 }).toBeGreaterThan(0);
}

async function driveUntilDeath(page: Page): Promise<void> {
  for (let step = 0; step < 180; step += 1) {
    const state = await readDocumentedAgentState(page);
    if (state.gameplay?.alive === false || state.gameplay?.gameOverVisible === true) {
      return;
    }

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

  throw new Error("Timed out waiting for death.");
}

test("api blocks raw writes and only accepts validated run submissions", async ({ request }, testInfo) => {
  const baseUrl = testInfo.project.use.baseURL as string;

  const directWrite = await request.post(new URL("/api/high-score", baseUrl).toString(), {
    failOnStatusCode: false,
    data: {
      playerName: "RawWrite",
      scoreHalfPoints: 500,
      controlMode: "agent",
    },
  });
  expect(directWrite.status()).toBe(403);
  expect(await directWrite.json()).toEqual({
    error: "Direct shared champion writes are internal-only.",
  });

  const forgedFinish = await finishValidatedRun(request, baseUrl, {
    runToken: "forged-token",
    summary: buildRunSummary(1, 0),
  });
  expect(forgedFinish.response.status()).toBe(404);
  expect(forgedFinish.body.accepted).toBe(false);
  expect(forgedFinish.body.updated).toBe(false);
  expect(forgedFinish.body.reason).toBe("missing");

  const replay = await completeValidatedRun(request, baseUrl, {
    playerName: "ReplayProbe",
    controlMode: "agent",
    kills: 1,
    headshots: 0,
  });
  expect(replay.finished.response.ok()).toBe(true);
  expect(replay.finished.body.accepted).toBe(true);

  const replayAttempt = await finishValidatedRun(request, baseUrl, {
    runToken: replay.started.body.runToken,
    summary: replay.summary,
  });
  expect(replayAttempt.response.status()).toBe(409);
  expect(replayAttempt.body.accepted).toBe(false);
  expect(replayAttempt.body.updated).toBe(false);
  expect(replayAttempt.body.reason).toBe("used");

  const hugeRunStart = await startValidatedRun(request, baseUrl, {
    playerName: "HugeScore",
    controlMode: "human",
  });
  expect(hugeRunStart.response.ok()).toBe(true);
  const hugeRun = await finishValidatedRun(request, baseUrl, {
    runToken: hugeRunStart.body.runToken,
    summary: {
      survivalTimeS: 0.5,
      kills: 99_999,
      headshots: 99_999,
      shotsFired: 99_999,
      shotsHit: 99_999,
      accuracy: 100,
      finalScore: computeFinalScore(99_999, 99_999),
      deathCause: "enemy-fire",
    },
  });
  expect(hugeRun.response.status()).toBe(422);
  expect(hugeRun.body.accepted).toBe(false);
  expect(hugeRun.body.reason).toBe("kills-exceed-cap");

  const textPlainStart = await request.fetch(new URL("/api/run/start", baseUrl).toString(), {
    method: "POST",
    failOnStatusCode: false,
    headers: {
      ...originHeaders(baseUrl),
      "content-type": "text/plain",
    },
    data: JSON.stringify({
      playerName: "TextPlain",
      controlMode: "agent",
      mapId: "bazaar-map",
    }),
  });
  expect(textPlainStart.status()).toBe(415);
  expect(await textPlainStart.json()).toEqual({
    error: "Expected application/json request body.",
  });
});

test("validated run submissions keep strict overwrite rules", async ({ request }, testInfo) => {
  const baseUrl = testInfo.project.use.baseURL as string;
  const current = await readSharedChampion(request, baseUrl);
  const baseScore = typeof current.champion?.scoreHalfPoints === "number" ? current.champion.scoreHalfPoints : 0;
  const firstRun = chooseRunAtLeastHalfPoints(baseScore + 5);
  const lowerRun = chooseRunAtMostHalfPoints(Math.max(0, firstRun.scoreHalfPoints - 5));
  const higherRun = chooseRunAtLeastHalfPoints(firstRun.scoreHalfPoints + 5);

  const first = await completeValidatedRun(request, baseUrl, {
    playerName: "AlphaUnit",
    controlMode: "agent",
    kills: firstRun.kills,
    headshots: firstRun.headshots,
  });
  expect(first.finished.response.ok()).toBe(true);
  expect(first.finished.body.accepted).toBe(true);
  expect(first.finished.body.updated).toBe(true);
  expectChampion(first.finished.body.champion, {
    holderName: "AlphaUnit",
    scoreHalfPoints: firstRun.scoreHalfPoints,
    controlMode: "agent",
  });

  const lower = await completeValidatedRun(request, baseUrl, {
    playerName: "BravoUnit",
    controlMode: "human",
    kills: lowerRun.kills,
    headshots: lowerRun.headshots,
  });
  expect(lower.finished.response.ok()).toBe(true);
  expect(lower.finished.body.accepted).toBe(true);
  expect(lower.finished.body.updated).toBe(false);
  expectChampion(lower.finished.body.champion, {
    holderName: "AlphaUnit",
    scoreHalfPoints: firstRun.scoreHalfPoints,
    controlMode: "agent",
  });

  const tie = await completeValidatedRun(request, baseUrl, {
    playerName: "CharlieTie",
    controlMode: "human",
    kills: firstRun.kills,
    headshots: firstRun.headshots,
  });
  expect(tie.finished.response.ok()).toBe(true);
  expect(tie.finished.body.accepted).toBe(true);
  expect(tie.finished.body.updated).toBe(false);
  expectChampion(tie.finished.body.champion, {
    holderName: "AlphaUnit",
    scoreHalfPoints: firstRun.scoreHalfPoints,
    controlMode: "agent",
  });

  const higher = await completeValidatedRun(request, baseUrl, {
    playerName: "DeltaLead",
    controlMode: "human",
    kills: higherRun.kills,
    headshots: higherRun.headshots,
  });
  expect(higher.finished.response.ok()).toBe(true);
  expect(higher.finished.body.accepted).toBe(true);
  expect(higher.finished.body.updated).toBe(true);
  expectChampion(higher.finished.body.champion, {
    holderName: "DeltaLead",
    scoreHalfPoints: higherRun.scoreHalfPoints,
    controlMode: "human",
  });
});

test("shows the same shared champion across loading, HUD, and death surfaces", async ({ browser, request }, testInfo) => {
  const baseUrl = testInfo.project.use.baseURL as string;
  const current = await readSharedChampion(request, baseUrl);
  const currentHalfPoints = typeof current.champion?.scoreHalfPoints === "number" ? current.champion.scoreHalfPoints : 0;
  const nextRun = chooseRunAtLeastHalfPoints(currentHalfPoints + 5);
  const holderName = "SiteChampion";

  const seeded = await completeValidatedRun(request, baseUrl, {
    playerName: holderName,
    controlMode: "agent",
    kills: nextRun.kills,
    headshots: nextRun.headshots,
  });
  expect(seeded.finished.response.ok()).toBe(true);
  expect(seeded.finished.body.accepted).toBe(true);
  expect(seeded.finished.body.updated).toBe(true);

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await pageA.goto(new URL("/", baseUrl).toString(), { waitUntil: "domcontentloaded" });
    await pageB.goto(new URL("/", baseUrl).toString(), { waitUntil: "domcontentloaded" });

    await expect(pageA.getByTestId("loading-world-champion-name")).toHaveText(holderName.toUpperCase());
    await expect(pageB.getByTestId("loading-world-champion-name")).toHaveText(holderName.toUpperCase());
    await expect(pageA.getByTestId("loading-world-champion-score")).toHaveText(formatScoreHalfPoints(nextRun.scoreHalfPoints));
    await expect(pageA.getByTestId("loading-world-champion-mode")).toHaveText("AGENT");
    await expect(pageB.getByTestId("loading-world-champion-score")).toHaveText(formatScoreHalfPoints(nextRun.scoreHalfPoints));

    await gotoAgentRuntimeViaUi(pageA, {
      baseUrl,
      agentName: "ChampionProbe",
    });

    await expect(pageA.getByTestId("hud-world-champion-name")).toHaveText(holderName.toUpperCase());
    await expect(pageA.getByTestId("hud-world-champion-score")).toHaveText(formatScoreHalfPoints(nextRun.scoreHalfPoints));
    await expect(pageA.getByTestId("hud-world-champion-mode")).toHaveText("AGENT");

    for (let step = 0; step < 120; step += 1) {
      const state = await readDocumentedAgentState(pageA);
      if (state.gameplay?.gameOverVisible === true) {
        break;
      }

      await pageA.evaluate(({ stepIndex }) => {
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
      await advanceRuntime(pageA, 500);
    }

    await expect.poll(async () => {
      const state = await readDocumentedAgentState(pageA);
      return state.gameplay?.gameOverVisible === true;
    }, { timeout: 20_000 }).toBe(true);

    await expect(pageA.getByTestId("death-world-champion-name")).toHaveText(holderName.toUpperCase());
    await expect(pageA.getByTestId("death-world-champion-score")).toHaveText(formatScoreHalfPoints(nextRun.scoreHalfPoints));
    await expect(pageA.getByTestId("death-world-champion-mode")).toHaveText("AGENT");
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test("refreshes the death-time champion and skips finish when the remote record is already higher", async ({ page }, testInfo) => {
  const baseUrl = testInfo.project.use.baseURL as string;
  const callSequence: string[] = [];
  let highScoreGetCount = 0;
  let finishCount = 0;
  const championAtBoot = createChampion("BootChampion", 40, "agent", "2026-03-07T12:00:00.000Z");
  const championAtDeath = createChampion("RemoteLeader", 2_000, "human", "2026-03-07T12:05:00.000Z");

  await page.route("**/api/high-score", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    highScoreGetCount += 1;
    callSequence.push(`GET-high-score-${highScoreGetCount}`);
    const champion = highScoreGetCount === 1 ? championAtBoot : championAtDeath;
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ champion }),
    });
  });

  await page.route("**/api/run/start", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        runToken: "death-refresh-no-submit",
        issuedAt: "2026-03-07T12:00:01.000Z",
        expiresAt: "2026-03-07T12:30:01.000Z",
        ruleset: "wave-score-v1-k10-hs2_5",
      }),
    });
  });

  await page.route("**/api/run/finish", async (route) => {
    finishCount += 1;
    callSequence.push("POST-run-finish");
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        accepted: true,
        updated: false,
        champion: championAtDeath,
        reason: null,
      }),
    });
  });

  await gotoAgentRuntimeViaUi(page, {
    baseUrl,
    agentName: "RefreshSkip",
  });

  await expect(page.getByTestId("hud-world-champion-name")).toHaveText("BOOTCHAMPION");
  await forcePositiveScoreViaDebug(page);
  await driveUntilDeath(page);

  await expect(page.getByTestId("death-world-champion-name")).toHaveText("REMOTELEADER");
  await expect(page.getByTestId("death-world-champion-score")).toHaveText(formatScoreHalfPoints(championAtDeath.scoreHalfPoints));
  await expect(page.getByTestId("death-world-champion-mode")).toHaveText("HUMAN");

  const state = await readDocumentedAgentState(page);
  expect(state.gameplay?.gameOverVisible).toBe(true);
  expect(state.sharedChampion).toEqual(championAtDeath);
  expect(highScoreGetCount).toBe(2);
  expect(finishCount).toBe(0);
  expect(callSequence).toEqual(["GET-high-score-1", "GET-high-score-2"]);
});

test("refreshes the death-time champion before finish and overwrites when the final score is higher", async ({ page }, testInfo) => {
  const baseUrl = testInfo.project.use.baseURL as string;
  const callSequence: string[] = [];
  let highScoreGetCount = 0;
  let finishCount = 0;
  const championAtBoot = createChampion("BootChampion", 40, "agent", "2026-03-07T12:00:00.000Z");
  const championAtDeath = createChampion("RemoteLeader", 50, "human", "2026-03-07T12:05:00.000Z");

  await page.route("**/api/high-score", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    highScoreGetCount += 1;
    callSequence.push(`GET-high-score-${highScoreGetCount}`);
    const champion = highScoreGetCount === 1 ? championAtBoot : championAtDeath;
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ champion }),
    });
  });

  await page.route("**/api/run/start", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        runToken: "death-refresh-submit",
        issuedAt: "2026-03-07T12:00:01.000Z",
        expiresAt: "2026-03-07T12:30:01.000Z",
        ruleset: "wave-score-v1-k10-hs2_5",
      }),
    });
  });

  await page.route("**/api/run/finish", async (route) => {
    finishCount += 1;
    callSequence.push("POST-run-finish");
    const payload = route.request().postDataJSON() as {
      runToken: string;
      summary?: { finalScore?: number };
    };
    expect(payload.runToken).toBe("death-refresh-submit");

    const finalScore = Number(payload.summary?.finalScore ?? 0);
    const finalScoreHalfPoints = Math.round(finalScore * 2);
    const submittedChampion = createChampion(
      "RefreshWinner",
      finalScoreHalfPoints,
      "agent",
      "2026-03-07T12:06:00.000Z",
    );

    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        accepted: true,
        updated: true,
        champion: submittedChampion,
        reason: null,
      }),
    });
  });

  await gotoAgentRuntimeViaUi(page, {
    baseUrl,
    agentName: "RefreshWinner",
  });

  await expect(page.getByTestId("hud-world-champion-name")).toHaveText("BOOTCHAMPION");
  await forcePositiveScoreViaDebug(page);
  await driveUntilDeath(page);

  await expect(page.getByTestId("death-world-champion-name")).toHaveText("REFRESHWINNER");
  const state = await readDocumentedAgentState(page);
  expect(state.gameplay?.gameOverVisible).toBe(true);
  expect(state.sharedChampion).toEqual({
    holderName: "RefreshWinner",
    score: expect.any(Number),
    scoreHalfPoints: expect.any(Number),
    controlMode: "agent",
    scope: "sitewide",
    updatedAt: "2026-03-07T12:06:00.000Z",
  });
  expect((state.sharedChampion?.score ?? 0)).toBeGreaterThan(championAtDeath.score);
  expect(highScoreGetCount).toBe(2);
  expect(finishCount).toBe(1);
  expect(callSequence.indexOf("GET-high-score-2")).toBeGreaterThan(-1);
  expect(callSequence.indexOf("POST-run-finish")).toBeGreaterThan(-1);
  expect(callSequence.indexOf("GET-high-score-2")).toBeLessThan(callSequence.indexOf("POST-run-finish"));
});

test("keeps the game bootable when the shared champion API is unavailable", async ({ page }, testInfo) => {
  const baseUrl = testInfo.project.use.baseURL as string;
  await page.route("**/api/high-score", (route) => route.abort());

  await page.goto(new URL("/", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("loading-world-champion-status")).toHaveText("Shared score service could not be reached");

  await gotoAgentRuntimeViaUi(page, {
    baseUrl,
    agentName: "OfflineProbe",
  });

  const state = await readDocumentedAgentState(page);
  expect(state.runtimeReady).toBe(true);
  expect(state.sharedChampion).toBeNull();
  await expect(page.getByTestId("hud-world-champion-name")).toHaveText("Unavailable");
  await expect(page.getByTestId("hud-world-champion-mode")).toHaveText("OFFLINE");
});
