import path from "node:path";
import { writeFile } from "node:fs/promises";
import { readPngMetrics } from "./lib/imageMetrics.mjs";
import {
  DEFAULT_AGENT_NAME,
  DEFAULT_BASE_URL,
  DEFAULT_MAP_ID,
  TRAVERSAL_ROUTES,
  attachConsoleRecorder,
  captureRuntimeSnapshot,
  ensureDir,
  gotoAgentRuntime,
  gotoHumanShot,
  launchBrowser,
  loadShotsSpec,
  parseBaseUrl,
  parseBooleanEnv,
  runAgentRoute,
  sanitizeFileSegment,
  selectReviewShotIds,
  startTracing,
  stopTracing,
  trimAgentName,
  writeJson,
} from "./lib/runtimePlaywright.mjs";
import { aggregateShotReviews, summarizeCapturedShot } from "./lib/shotReview.mjs";

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

function summarizeRoute(route, routeSummary, startState, endState, consoleCounts) {
  const findings = [];

  if (routeSummary.distanceM < route.expectedMinDistanceM) {
    findings.push({
      severity: "error",
      code: "short-traversal",
      message: `Route moved ${routeSummary.distanceM.toFixed(2)}m (expected >= ${route.expectedMinDistanceM.toFixed(2)}m).`,
    });
  }
  if (routeSummary.maxStationaryTicks > route.maxStationaryTicks) {
    findings.push({
      severity: "error",
      code: "stalled",
      message: `Route stalled for ${routeSummary.maxStationaryTicks} ticks (allowed ${route.maxStationaryTicks}).`,
    });
  }
  if (!routeSummary.withinPlayableBounds) {
    findings.push({
      severity: "error",
      code: "out-of-bounds",
      message: "Route ended outside playable bounds.",
    });
  }
  if (!routeSummary.endedAlive) {
    findings.push({
      severity: "error",
      code: "dead-end-state",
      message: "Route ended in a dead gameplay state.",
    });
  }
  if ((endState.render?.warnings?.length ?? 0) > 0) {
    findings.push({
      severity: "warn",
      code: "runtime-warnings",
      message: `Runtime warnings present after route: ${endState.render.warnings.join(" | ")}`,
    });
  }
  if (consoleCounts.errorCount > 0) {
    findings.push({
      severity: "error",
      code: "console-errors",
      message: `Route emitted ${consoleCounts.errorCount} console/page errors.`,
    });
  }
  if (consoleCounts.warningCount > 0) {
    findings.push({
      severity: "warn",
      code: "console-warnings",
      message: `Route emitted ${consoleCounts.warningCount} warnings.`,
    });
  }

  return {
    routeId: route.id,
    label: route.label,
    spawn: route.spawn,
    startZoneId: startState.player?.zoneId ?? null,
    endZoneId: endState.player?.zoneId ?? null,
    console: consoleCounts,
    findings,
    passed: findings.every((finding) => finding.severity !== "error"),
    ...routeSummary,
  };
}

function aggregateRouteResults(routes) {
  const severityCounts = { error: 0, warn: 0 };
  const failingRoutes = [];
  const routesWithFindings = [];

  for (const route of routes) {
    if ((route.findings?.length ?? 0) > 0) {
      routesWithFindings.push(route.routeId);
    }
    if (!route.passed) {
      failingRoutes.push(route.routeId);
    }
    for (const finding of route.findings ?? []) {
      if (finding.severity === "error") severityCounts.error += 1;
      if (finding.severity === "warn") severityCounts.warn += 1;
    }
  }

  return {
    passed: failingRoutes.length === 0,
    totalRoutes: routes.length,
    totalFindings: severityCounts.error + severityCounts.warn,
    severityCounts,
    failingRoutes,
    routesWithFindings,
  };
}

function renderCompletionReview(summary) {
  const lines = [
    "# Autonomous Completion Review",
    "",
    `- Status: ${summary.passed ? "PASS" : "FAIL"}`,
    `- Reviewed at: ${summary.finishedAt ?? summary.startedAt}`,
    `- Base URL: ${summary.baseUrl}`,
    `- Map ID: ${summary.mapId}`,
    `- Headless: ${summary.headless}`,
    `- Output: ${summary.outputDir}`,
    "",
    "## Functional Routes",
  ];

  for (const route of summary.functional.routes) {
    lines.push(
      `- ${route.passed ? "PASS" : "FAIL"} \`${route.routeId}\` distance=${route.distanceM?.toFixed?.(2) ?? "n/a"}m zone=${route.endZoneId ?? "unknown"} consoleErrors=${route.console?.errorCount ?? 0}`,
    );
    for (const finding of route.findings ?? []) {
      lines.push(`  - [${finding.severity}] ${finding.message}`);
    }
    if (route.artifacts) {
      lines.push(`  - start: ${route.artifacts.startImage}`);
      lines.push(`  - final: ${route.artifacts.finalImage}`);
    }
  }

  lines.push("", "## Visual Review");
  for (const shot of summary.visual.shots) {
    lines.push(
      `- ${shot.passed ? "PASS" : "FAIL"} \`${shot.shotId}\` score=${shot.score} zone=${shot.zoneId ?? "unknown"} landmarks=${shot.visibleLandmarks.join(", ") || "none"}`,
    );
    lines.push(`  - image: ${shot.imagePath}`);
    if ((shot.reviewFocus?.length ?? 0) > 0) {
      lines.push(`  - reviewFocus: ${shot.reviewFocus.join(" | ")}`);
    }
    if ((shot.mustShow?.length ?? 0) > 0) {
      lines.push(`  - mustShow: ${shot.mustShow.join(" | ")}`);
    }
    for (const finding of shot.findings) {
      lines.push(`  - [${finding.severity}] ${finding.message}`);
    }
  }

  lines.push(
    "",
    "## Aggregate",
    `- Functional pass: ${summary.functional.aggregate.passed}`,
    `- Visual pass: ${summary.visual.aggregate.passed}`,
    `- Failing routes: ${summary.functional.aggregate.failingRoutes.join(", ") || "none"}`,
    `- Failing shots: ${summary.visual.aggregate.failingShots.join(", ") || "none"}`,
  );

  return `${lines.join("\n")}\n`;
}

const BASE_URL = parseBaseUrl(process.env.BASE_URL ?? DEFAULT_BASE_URL);
const MAP_ID = (process.env.MAP_ID ?? DEFAULT_MAP_ID).trim() || DEFAULT_MAP_ID;
const AGENT_NAME = trimAgentName(process.env.AGENT_NAME, DEFAULT_AGENT_NAME);
const HEADLESS = parseBooleanEnv(process.env.HEADLESS, true);
const ROUTES = resolveRoutes(process.env.ROUTE_IDS);
const MAX_SHOTS = Math.max(1, Number(process.env.MAX_SHOTS ?? 8));
const MIN_SHOT_SCORE = Math.max(0, Math.min(100, Number(process.env.MIN_SHOT_SCORE ?? 80)));
const OUTPUT_DIR = path.resolve(
  process.cwd(),
  process.env.OUTPUT_DIR ?? `../../artifacts/playwright/completion-gate/${timestampId()}`,
);
const STABLE_DIR = path.resolve(process.cwd(), "../../artifacts/playwright/completion-gate");

await ensureDir(OUTPUT_DIR);
await ensureDir(STABLE_DIR);

const shotsSpec = await loadShotsSpec(BASE_URL, MAP_ID);
const selectedShotIds = selectReviewShotIds(shotsSpec, MAX_SHOTS);
const shotsById = new Map((Array.isArray(shotsSpec?.shots) ? shotsSpec.shots : []).map((shot) => [shot.id, shot]));
const { browser, context, page } = await launchBrowser({ headless: HEADLESS });
const consoleRecorder = attachConsoleRecorder(page);
await startTracing(context);

const summary = {
  baseUrl: BASE_URL,
  mapId: MAP_ID,
  agentName: AGENT_NAME,
  headless: HEADLESS,
  selectedShotIds,
  outputDir: OUTPUT_DIR,
  startedAt: new Date().toISOString(),
  functional: {
    routes: [],
  },
  visual: {
    minShotScore: MIN_SHOT_SCORE,
    shots: [],
  },
};

try {
  const routesDir = path.join(OUTPUT_DIR, "routes");
  await ensureDir(routesDir);

  for (const route of ROUTES) {
    const routeDir = path.join(routesDir, route.id);
    await ensureDir(routeDir);
    consoleRecorder.clear();

    try {
      await gotoAgentRuntime(page, {
        baseUrl: BASE_URL,
        mapId: MAP_ID,
        agentName: AGENT_NAME,
        spawn: route.spawn,
        extraSearchParams: {
          unlimitedHealth: 1,
        },
      });

      const startImage = path.join(routeDir, "start.png");
      const startStatePath = path.join(routeDir, "start.state.json");
      const finalImage = path.join(routeDir, "final.png");
      const finalStatePath = path.join(routeDir, "final.state.json");
      const consolePath = path.join(routeDir, "console.json");

      const startState = await captureRuntimeSnapshot(page, {
        imagePath: startImage,
        statePath: startStatePath,
      });
      const routeSummary = await runAgentRoute(page, route);
      const endState = await captureRuntimeSnapshot(page, {
        imagePath: finalImage,
        statePath: finalStatePath,
      });
      const consoleCounts = consoleRecorder.counts();

      await writeJson(consolePath, {
        events: consoleRecorder.snapshot(),
        counts: consoleCounts,
      });

      summary.functional.routes.push({
        ...summarizeRoute(route, routeSummary, startState, endState, consoleCounts),
        artifacts: {
          startImage,
          startState: startStatePath,
          finalImage,
          finalState: finalStatePath,
          console: consolePath,
        },
      });
    } catch (error) {
      summary.functional.routes.push({
        routeId: route.id,
        label: route.label,
        spawn: route.spawn,
        passed: false,
        findings: [
          {
            severity: "error",
            code: "route-run-failed",
            message: error instanceof Error ? error.message : String(error),
          },
        ],
      });
    }
  }

  const shotsDir = path.join(OUTPUT_DIR, "shots");
  await ensureDir(shotsDir);

  for (let index = 0; index < selectedShotIds.length; index += 1) {
    const shotId = selectedShotIds[index];
    const fileBase = `${String(index + 1).padStart(2, "0")}-${sanitizeFileSegment(shotId)}`;
    const imagePath = path.join(shotsDir, `${fileBase}.png`);
    const statePath = path.join(shotsDir, `${fileBase}.state.json`);
    const consolePath = path.join(shotsDir, `${fileBase}.console.json`);

    consoleRecorder.clear();

    try {
      await gotoHumanShot(page, {
        baseUrl: BASE_URL,
        mapId: MAP_ID,
        shot: shotId,
      });

      const state = await captureRuntimeSnapshot(page, { imagePath, statePath });
      const consoleCounts = consoleRecorder.counts();
      await writeJson(consolePath, {
        events: consoleRecorder.snapshot(),
        counts: consoleCounts,
      });

      const metrics = await readPngMetrics(imagePath);
      summary.visual.shots.push(
        summarizeCapturedShot(
          {
            shotId,
            imagePath,
            statePath,
            consolePath,
            state,
          },
          metrics,
          consoleCounts,
          {
            minScore: MIN_SHOT_SCORE,
            shotDefinition: shotsById.get(shotId) ?? null,
          },
        ),
      );
    } catch (error) {
      await writeJson(consolePath, {
        events: consoleRecorder.snapshot(),
        counts: consoleRecorder.counts(),
      });

      summary.visual.shots.push({
        shotId,
        imagePath,
        statePath,
        consolePath,
        metrics: null,
        zoneId: null,
        visibleLandmarks: [],
        console: consoleRecorder.counts(),
        findings: [
          {
            severity: "error",
            code: "shot-capture-failed",
            message: error instanceof Error ? error.message : String(error),
          },
        ],
        score: 0,
        passed: false,
      });
    }
  }

  summary.functional.aggregate = aggregateRouteResults(summary.functional.routes);
  summary.visual.aggregate = aggregateShotReviews(summary.visual.shots, {
    minScore: MIN_SHOT_SCORE,
  });
  summary.passed = summary.functional.aggregate.passed && summary.visual.aggregate.passed;
  summary.finishedAt = new Date().toISOString();

  const markdown = renderCompletionReview(summary);
  const summaryPath = path.join(OUTPUT_DIR, "summary.json");
  const reviewPath = path.join(OUTPUT_DIR, "review.md");
  const latestSummaryPath = path.join(STABLE_DIR, "latest-summary.json");
  const latestReviewPath = path.join(STABLE_DIR, "latest-review.md");

  await stopTracing(context, path.join(OUTPUT_DIR, "trace.zip"));
  await writeJson(summaryPath, summary);
  await writeJson(latestSummaryPath, summary);
  await writeFile(reviewPath, markdown);
  await writeFile(latestReviewPath, markdown);

  if (!summary.passed) {
    throw new Error(
      `[qa:completion] failed | routes=${summary.functional.aggregate.failingRoutes.join(",") || "none"} | shots=${summary.visual.aggregate.failingShots.join(",") || "none"} | output=${OUTPUT_DIR}`,
    );
  }

  console.log(`[qa:completion] pass | routes=${summary.functional.routes.length} | shots=${summary.visual.shots.length} | output=${OUTPUT_DIR}`);
} catch (error) {
  summary.finishedAt = new Date().toISOString();
  summary.failed = true;
  summary.failure = error instanceof Error ? error.message : String(error);
  const summaryPath = path.join(OUTPUT_DIR, "summary.json");
  const reviewPath = path.join(OUTPUT_DIR, "review.md");
  const latestSummaryPath = path.join(STABLE_DIR, "latest-summary.json");
  const latestReviewPath = path.join(STABLE_DIR, "latest-review.md");
  const markdown = renderCompletionReview(summary);

  await stopTracing(context, path.join(OUTPUT_DIR, "trace.zip")).catch(() => {});
  await writeJson(summaryPath, summary);
  await writeJson(latestSummaryPath, summary);
  await writeFile(reviewPath, markdown);
  await writeFile(latestReviewPath, markdown);
  throw error;
} finally {
  await context.close();
  await browser.close();
}
