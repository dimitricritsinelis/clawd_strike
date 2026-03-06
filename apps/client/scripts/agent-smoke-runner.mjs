import path from "node:path";
import {
  DEFAULT_AGENT_NAME,
  DEFAULT_BASE_URL,
  DEFAULT_MAP_ID,
  TRAVERSAL_ROUTES,
  attachConsoleRecorder,
  captureRuntimeSnapshot,
  ensureDir,
  gotoAgentRuntime,
  launchBrowser,
  parseBaseUrl,
  parseBooleanEnv,
  runAgentRoute,
  startTracing,
  stopTracing,
  trimAgentName,
  writeJson,
} from "./lib/runtimePlaywright.mjs";

function timestampId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function resolveRoutes(routeIdsRaw) {
  if (!routeIdsRaw) return TRAVERSAL_ROUTES;

  const requestedIds = routeIdsRaw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const routes = TRAVERSAL_ROUTES.filter((route) => requestedIds.includes(route.id));
  if (routes.length === 0) {
    throw new Error(`No traversal routes matched ROUTE_IDS='${routeIdsRaw}'`);
  }
  return routes;
}

const BASE_URL = parseBaseUrl(process.env.BASE_URL ?? DEFAULT_BASE_URL);
const MAP_ID = (process.env.MAP_ID ?? DEFAULT_MAP_ID).trim() || DEFAULT_MAP_ID;
const AGENT_NAME = trimAgentName(process.env.AGENT_NAME, DEFAULT_AGENT_NAME);
const HEADLESS = parseBooleanEnv(process.env.HEADLESS, true);
const ROUTES = resolveRoutes(process.env.ROUTE_IDS);
const OUTPUT_DIR = path.resolve(
  process.cwd(),
  process.env.OUTPUT_DIR ?? `../../artifacts/playwright/agent-smoke/${timestampId()}`,
);

await ensureDir(OUTPUT_DIR);

const { browser, context, page } = await launchBrowser({ headless: HEADLESS });
const consoleRecorder = attachConsoleRecorder(page);
await startTracing(context);

const runSummary = {
  baseUrl: BASE_URL,
  mapId: MAP_ID,
  agentName: AGENT_NAME,
  headless: HEADLESS,
  outputDir: OUTPUT_DIR,
  startedAt: new Date().toISOString(),
  routes: [],
};

try {
  for (const route of ROUTES) {
    const routeDir = path.join(OUTPUT_DIR, route.id);
    await ensureDir(routeDir);
    consoleRecorder.clear();

    await gotoAgentRuntime(page, {
      baseUrl: BASE_URL,
      mapId: MAP_ID,
      agentName: AGENT_NAME,
      spawn: route.spawn,
      extraSearchParams: {
        unlimitedHealth: 1,
      },
    });

    const startState = await captureRuntimeSnapshot(page, {
      imagePath: path.join(routeDir, "start.png"),
      statePath: path.join(routeDir, "start.state.json"),
    });
    const routeSummary = await runAgentRoute(page, route);
    const endState = await captureRuntimeSnapshot(page, {
      imagePath: path.join(routeDir, "final.png"),
      statePath: path.join(routeDir, "final.state.json"),
    });
    const consoleCounts = consoleRecorder.counts();

    await writeJson(path.join(routeDir, "console.json"), {
      events: consoleRecorder.snapshot(),
      counts: consoleCounts,
    });

    const routeReport = {
      ...routeSummary,
      startZoneId: startState.player?.zoneId ?? null,
      endZoneId: endState.player?.zoneId ?? null,
      endedWithWarnings: endState.render?.warnings ?? [],
      console: consoleCounts,
    };
    runSummary.routes.push(routeReport);

    if (routeSummary.distanceM < route.expectedMinDistanceM) {
      throw new Error(
        `[smoke:agent] route ${route.id} moved ${routeSummary.distanceM.toFixed(2)}m (expected >= ${route.expectedMinDistanceM.toFixed(2)}m)`,
      );
    }
    if (routeSummary.maxStationaryTicks > route.maxStationaryTicks) {
      throw new Error(
        `[smoke:agent] route ${route.id} stalled for ${routeSummary.maxStationaryTicks} ticks (allowed ${route.maxStationaryTicks})`,
      );
    }
    if (!routeSummary.withinPlayableBounds) {
      throw new Error(`[smoke:agent] route ${route.id} ended outside playable bounds`);
    }
    if (!routeSummary.endedAlive) {
      throw new Error(`[smoke:agent] route ${route.id} ended in a dead state`);
    }
    if (consoleCounts.errorCount > 0) {
      throw new Error(`[smoke:agent] route ${route.id} emitted ${consoleCounts.errorCount} console/page errors`);
    }
  }

  runSummary.finishedAt = new Date().toISOString();
  await stopTracing(context, path.join(OUTPUT_DIR, "trace.zip"));
  await writeJson(path.join(OUTPUT_DIR, "summary.json"), runSummary);
  console.log(`[smoke:agent] pass | routes=${ROUTES.length} | output=${OUTPUT_DIR}`);
} catch (error) {
  runSummary.finishedAt = new Date().toISOString();
  runSummary.failed = true;
  runSummary.failure = error instanceof Error ? error.message : String(error);
  await stopTracing(context, path.join(OUTPUT_DIR, "trace.zip"));
  await writeJson(path.join(OUTPUT_DIR, "summary.json"), runSummary);
  throw error;
} finally {
  await context.close();
  await browser.close();
}
