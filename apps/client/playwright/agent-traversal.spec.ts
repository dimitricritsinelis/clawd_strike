import { expect, test } from "@playwright/test";
import {
  TRAVERSAL_ROUTES,
  attachConsoleRecorder,
  gotoAgentRuntime,
  runAgentRoute,
} from "../scripts/lib/runtimePlaywright.mjs";

test("completes deterministic traversal routes without leaving bounds", async ({ page }, testInfo) => {
  const recorder = attachConsoleRecorder(page);

  for (const route of TRAVERSAL_ROUTES) {
    recorder.clear();
    await gotoAgentRuntime(page, {
      baseUrl: testInfo.project.use.baseURL as string,
      agentName: route.id,
      spawn: route.spawn,
      extraSearchParams: {
        floors: "blockout",
        walls: "blockout",
        ao: 0,
        unlimitedHealth: 1,
      },
    });

    const summary = await runAgentRoute(page, route);
    expect(summary.distanceM).toBeGreaterThanOrEqual(route.expectedMinDistanceM);
    expect(summary.maxStationaryTicks).toBeLessThanOrEqual(route.maxStationaryTicks);
    expect(summary.withinPlayableBounds).toBe(true);
    expect(summary.endedAlive).toBe(true);
    expect(recorder.counts().errorCount).toBe(0);
  }
});
