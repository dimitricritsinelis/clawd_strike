import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  advanceRuntime,
  gotoAgentRuntimeViaUi,
  readDocumentedAgentState,
} from "../scripts/lib/runtimePlaywright.mjs";

function formatScoreHalfPoints(scoreHalfPoints: number): string {
  return (scoreHalfPoints / 2).toLocaleString("en-US");
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

async function submitSharedChampion(
  request: APIRequestContext,
  baseUrl: string,
  body: { playerName: string; scoreHalfPoints: number; controlMode: "human" | "agent" },
) {
  const sessionToken = await getSessionToken(request, baseUrl);
  const response = await request.post(new URL("/api/high-score", baseUrl).toString(), {
    failOnStatusCode: false,
    data: {
      ...body,
      telemetry: buildTelemetryForScore(body.scoreHalfPoints),
      sessionToken,
    },
  });
  expect(response.ok()).toBe(true);
  return response.json();
}

test("api stores the sitewide champion with strict overwrite rules", async ({ request }, testInfo) => {
  const baseUrl = testInfo.project.use.baseURL as string;
  const current = await readSharedChampion(request, baseUrl);
  const baseScore = typeof current.champion?.scoreHalfPoints === "number" ? current.champion.scoreHalfPoints : 0;
  const firstScore = baseScore + 20;
  const higherScore = firstScore + 5;

  const first = await submitSharedChampion(request, baseUrl, {
    playerName: "AlphaUnit",
    scoreHalfPoints: firstScore,
    controlMode: "agent",
  });
  expect(first.updated).toBe(true);
  expectChampion(first.champion, {
    holderName: "AlphaUnit",
    scoreHalfPoints: firstScore,
    controlMode: "agent",
  });

  const lower = await submitSharedChampion(request, baseUrl, {
    playerName: "BravoUnit",
    scoreHalfPoints: Math.max(0, firstScore - 5),
    controlMode: "human",
  });
  expect(lower.updated).toBe(false);
  expectChampion(lower.champion, {
    holderName: "AlphaUnit",
    scoreHalfPoints: firstScore,
    controlMode: "agent",
  });

  const tie = await submitSharedChampion(request, baseUrl, {
    playerName: "CharlieTie",
    scoreHalfPoints: firstScore,
    controlMode: "human",
  });
  expect(tie.updated).toBe(false);
  expectChampion(tie.champion, {
    holderName: "AlphaUnit",
    scoreHalfPoints: firstScore,
    controlMode: "agent",
  });

  const higher = await submitSharedChampion(request, baseUrl, {
    playerName: "DeltaLead",
    scoreHalfPoints: higherScore,
    controlMode: "human",
  });
  expect(higher.updated).toBe(true);
  expectChampion(higher.champion, {
    holderName: "DeltaLead",
    scoreHalfPoints: higherScore,
    controlMode: "human",
  });
});

test("shows the same shared champion across loading, HUD, and death surfaces", async ({ browser, request }, testInfo) => {
  const baseUrl = testInfo.project.use.baseURL as string;
  const current = await readSharedChampion(request, baseUrl);
  const currentHalfPoints = typeof current.champion?.scoreHalfPoints === "number" ? current.champion.scoreHalfPoints : 0;
  const nextHalfPoints = currentHalfPoints + 10;
  const holderName = "SiteChampion";

  const seeded = await submitSharedChampion(request, baseUrl, {
    playerName: holderName,
    scoreHalfPoints: nextHalfPoints,
    controlMode: "agent",
  });
  expect(seeded.updated).toBe(true);

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await pageA.goto(new URL("/", baseUrl).toString(), { waitUntil: "domcontentloaded" });
    await pageB.goto(new URL("/", baseUrl).toString(), { waitUntil: "domcontentloaded" });

    await expect(pageA.getByTestId("loading-world-champion-name")).toHaveText(holderName.toUpperCase());
    await expect(pageB.getByTestId("loading-world-champion-name")).toHaveText(holderName.toUpperCase());
    await expect(pageA.getByTestId("loading-world-champion-score")).toHaveText(formatScoreHalfPoints(nextHalfPoints));
    await expect(pageA.getByTestId("loading-world-champion-mode")).toHaveText("AGENT");
    await expect(pageB.getByTestId("loading-world-champion-score")).toHaveText(formatScoreHalfPoints(nextHalfPoints));

    await gotoAgentRuntimeViaUi(pageA, {
      baseUrl,
      agentName: "ChampionProbe",
    });

    await expect(pageA.getByTestId("hud-world-champion-name")).toHaveText(holderName.toUpperCase());
    await expect(pageA.getByTestId("hud-world-champion-score")).toHaveText(formatScoreHalfPoints(nextHalfPoints));
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
    await expect(pageA.getByTestId("death-world-champion-score")).toHaveText(formatScoreHalfPoints(nextHalfPoints));
    await expect(pageA.getByTestId("death-world-champion-mode")).toHaveText("AGENT");
  } finally {
    await contextA.close();
    await contextB.close();
  }
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
