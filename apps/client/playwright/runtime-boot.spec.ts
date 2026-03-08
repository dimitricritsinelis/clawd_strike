import { expect, test } from "@playwright/test";
import {
  attachConsoleRecorder,
  buildRuntimeUrl,
  gotoAgentRuntime,
} from "../scripts/lib/runtimePlaywright.mjs";

test("boots runtime in agent mode without console errors", async ({ page }, testInfo) => {
  const recorder = attachConsoleRecorder(page);
  const state = await gotoAgentRuntime(page, {
    baseUrl: testInfo.project.use.baseURL as string,
    extraSearchParams: {
      floors: "blockout",
      walls: "blockout",
      ao: 0,
    },
  });

  expect(state.mode).toBe("runtime");
  expect(state.map?.loaded).toBe(true);
  expect(state.player?.pos).toBeTruthy();
  expect(state.render?.viewport?.width).toBeGreaterThan(0);
  expect(recorder.counts().errorCount).toBe(0);
});

test("keeps reveal-stage camera framing stable through runtime activation", async ({ page }, testInfo) => {
  const recorder = attachConsoleRecorder(page);
  const baseUrl = testInfo.project.use.baseURL as string;

  await page.goto(buildRuntimeUrl(baseUrl, {
    autostart: "agent",
    agentName: "AspectProbe",
    extraSearchParams: {
      floors: "blockout",
      walls: "blockout",
      ao: 0,
    },
  }), { waitUntil: "domcontentloaded" });

  const revealingHandle = await page.waitForFunction(() => {
    if (typeof window.render_game_to_text !== "function") return null;
    try {
      const state = JSON.parse(window.render_game_to_text());
      return state.mode === "runtime" && state.boot?.revealPhase === "revealing" ? state : null;
    } catch {
      return null;
    }
  }, { timeout: 30_000 });
  const revealingState = await revealingHandle.jsonValue();

  const activeHandle = await page.waitForFunction(() => {
    if (typeof window.render_game_to_text !== "function") return null;
    try {
      const state = JSON.parse(window.render_game_to_text());
      return state.mode === "runtime" && state.boot?.revealPhase === "active" ? state : null;
    } catch {
      return null;
    }
  }, { timeout: 30_000 });
  const activeState = await activeHandle.jsonValue();

  expect(revealingState.view?.camera?.fovDeg).toBe(activeState.view?.camera?.fovDeg);
  expect(revealingState.view?.camera?.aspect).toBeCloseTo(activeState.view?.camera?.aspect, 6);

  const revealingLandmark = revealingState.landmarks?.visible?.find((landmark) => landmark.id === "LMK_MID_WELL_01")
    ?? revealingState.landmarks?.visible?.[0]
    ?? null;
  const activeLandmark = activeState.landmarks?.visible?.find((landmark) => landmark.id === "LMK_MID_WELL_01")
    ?? activeState.landmarks?.visible?.[0]
    ?? null;
  expect(revealingLandmark).not.toBeNull();
  expect(activeLandmark).not.toBeNull();
  expect(Math.abs(revealingLandmark.screenX - activeLandmark.screenX)).toBeLessThan(0.5);
  expect(Math.abs(revealingLandmark.screenY - activeLandmark.screenY)).toBeLessThan(0.5);

  expect(recorder.counts().errorCount).toBe(0);
});
