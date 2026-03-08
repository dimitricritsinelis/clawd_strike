import { expect, test } from "@playwright/test";
import {
  advanceRuntime,
  attachConsoleRecorder,
  gotoAgentRuntime,
  readDocumentedAgentState,
  readRuntimeState,
} from "../scripts/lib/runtimePlaywright.mjs";

function planarDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

test("death restart returns the runtime to a fresh wave-1 run", async ({ page }, testInfo) => {
  const recorder = attachConsoleRecorder(page);
  const initialState = await gotoAgentRuntime(page, {
    baseUrl: testInfo.project.use.baseURL as string,
    agentName: "RestartProbe",
    extraSearchParams: {
      floors: "blockout",
      walls: "blockout",
      ao: 0,
    },
  });

  const initialSpawn = initialState.player?.pos;
  expect(initialSpawn).toBeTruthy();
  expect(initialState.bots?.waveNumber).toBe(1);
  expect(initialState.bots?.aliveCount).toBe(10);

  let died = false;
  for (let step = 0; step < 120 && !died; step += 1) {
    const state = await readRuntimeState(page);
    const alive = state.gameplay?.alive === true;
    const gameOverVisible = state.gameOver?.visible === true;
    if (!alive || gameOverVisible) {
      died = true;
      break;
    }

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

  expect(died).toBe(true);

  const deadPublicState = await readDocumentedAgentState(page);
  expect(deadPublicState.score?.lastRun).not.toBeNull();
  expect(deadPublicState.lastRunSummary).not.toBeNull();

  await expect(page.getByTestId("game-over")).toBeVisible();
  await page.getByTestId("play-again").click();

  await page.waitForFunction(() => {
    if (typeof window.render_game_to_text !== "function") return false;
    try {
      const state = JSON.parse(window.render_game_to_text());
      return state.mode === "runtime"
        && state.gameplay?.alive === true
        && state.gameOver?.visible !== true
        && state.bots?.waveNumber === 1
        && state.bots?.aliveCount === 10
        && state.score?.current === 0;
    } catch {
      return false;
    }
  }, { timeout: 20_000 });

  const restartedState = await readRuntimeState(page);
  const restartedPublicState = await readDocumentedAgentState(page);
  expect(planarDistance(restartedState.player.pos, initialSpawn)).toBeLessThan(0.05);
  expect(restartedState.bots.waveNumber).toBe(1);
  expect(restartedState.bots.aliveCount).toBe(10);
  expect(restartedState.gameOver.visible).toBe(false);
  expect(restartedState.score.current).toBe(0);
  expect(restartedPublicState.health).toBe(100);
  expect(restartedPublicState.score?.current).toBe(0);
  expect(restartedPublicState.score?.lastRun ?? null).toBe(deadPublicState.score?.lastRun ?? null);
  expect(restartedPublicState.lastRunSummary?.finalScore ?? null).toBe(deadPublicState.lastRunSummary?.finalScore ?? null);
  await expect(page.getByTestId("game-over")).not.toBeVisible();
  await expect(page.getByText("ROUND COMPLETE")).not.toBeVisible();
  expect(recorder.counts().errorCount).toBe(0);
});
