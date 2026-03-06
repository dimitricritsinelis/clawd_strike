import { expect, test } from "@playwright/test";
import { attachConsoleRecorder, gotoAgentRuntime } from "../scripts/lib/runtimePlaywright.mjs";

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
