import { expect, test } from "@playwright/test";
import { attachConsoleRecorder, gotoHumanShot } from "../scripts/lib/runtimePlaywright.mjs";

test("loads the deterministic compare shot with landmark and warning state", async ({ page }, testInfo) => {
  const recorder = attachConsoleRecorder(page);
  const state = await gotoHumanShot(page, {
    baseUrl: testInfo.project.use.baseURL as string,
    shot: "compare",
    extraSearchParams: {
      floors: "blockout",
      walls: "blockout",
      ao: 0,
    },
  });

  await page.screenshot({ path: testInfo.outputPath("compare-shot.png") });

  expect(state.mode).toBe("runtime");
  expect(state.shot?.active).toBe(true);
  expect(state.render?.warnings ?? []).toEqual([]);
  expect(state.landmarks?.nearest).toBeTruthy();
  expect(recorder.counts().errorCount).toBe(0);
});
