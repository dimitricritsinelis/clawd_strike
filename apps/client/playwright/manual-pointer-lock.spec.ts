import { expect, test } from "@playwright/test";
import { buildRuntimeUrl, readRuntimeState, waitForRuntimeReady } from "../scripts/lib/runtimePlaywright.mjs";

test.skip(process.env.PW_POINTER_LOCK !== "1", "Manual headed smoke only.");

test("locks pointer and moves in human mode when explicitly requested", async ({ page }, testInfo) => {
  const url = buildRuntimeUrl(testInfo.project.use.baseURL as string, {
    autostart: "human",
    mapId: "bazaar-map",
  });

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitForRuntimeReady(page);

  const canvas = page.getByTestId("game-canvas");
  await canvas.click();
  await page.waitForTimeout(250);

  const initial = await readRuntimeState(page);
  expect(initial.gameplay?.pointerLocked).toBe(true);

  await page.keyboard.down("w");
  await page.waitForTimeout(500);
  await page.keyboard.up("w");

  const final = await readRuntimeState(page);
  expect(final.gameplay?.pointerLocked).toBe(true);
  expect(final.player?.pos?.z).not.toBe(initial.player?.pos?.z);
});
