import path from "node:path";
import { copyFile, writeFile } from "node:fs/promises";
import {
  attachConsoleRecorder,
  buildRuntimeUrl,
  captureRuntimeSnapshot,
  ensureDir,
  launchBrowser,
  parseBaseUrl,
  parseBooleanEnv,
  startTracing,
  stopTracing,
  writeJson,
} from "./lib/runtimePlaywright.mjs";

const BASE_URL = parseBaseUrl(process.env.BASE_URL ?? "http://127.0.0.1:5174");
const MAP_ID = (process.env.MAP_ID ?? "bazaar-map").trim() || "bazaar-map";
const HEADLESS = parseBooleanEnv(process.env.HEADLESS, true);

function timestampId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function fail(message) {
  throw new Error(`[bot:smoke] ${message}`);
}

function summarizeState(state) {
  return {
    waveNumber: state?.bots?.waveNumber ?? null,
    waveElapsedS: state?.bots?.waveElapsedS ?? null,
    tier: state?.bots?.tier ?? null,
    aliveCount: state?.bots?.aliveCount ?? null,
    roleCounts: state?.bots?.roleCounts ?? null,
    preventedFriendlyFireCount: state?.bots?.preventedFriendlyFireCount ?? null,
    enemyStates: Array.isArray(state?.bots?.enemies)
      ? state.bots.enemies.map((enemy) => ({
          id: enemy.id,
          role: enemy.role,
          state: enemy.state,
          position: enemy.position,
          assignedNodeId: enemy.assignedNodeId,
          directSight: enemy.directSight,
          aimYawErrorDeg: enemy.aimYawErrorDeg,
          directiveAgeS: enemy.directiveAgeS,
          targetNodeChangeCount: enemy.targetNodeChangeCount,
        }))
      : [],
  };
}

function buildEnemyMap(state) {
  const out = new Map();
  for (const enemy of state?.bots?.enemies ?? []) {
    out.set(enemy.id, enemy);
  }
  return out;
}

function countMovedEnemies(fromState, toState, minDistanceM) {
  const fromMap = buildEnemyMap(fromState);
  let count = 0;
  for (const enemy of toState?.bots?.enemies ?? []) {
    const previous = fromMap.get(enemy.id);
    if (!previous) continue;
    const dx = enemy.position.x - previous.position.x;
    const dz = enemy.position.z - previous.position.z;
    if (Math.hypot(dx, dz) >= minDistanceM) {
      count += 1;
    }
  }
  return count;
}

function countSettledEnemies(state) {
  const settledStates = new Set(["HOLD", "OVERWATCH", "INVESTIGATE", "PEEK", "PRESSURE", "FALLBACK", "RELOAD"]);
  return (state?.bots?.enemies ?? []).filter((enemy) => settledStates.has(enemy.state)).length;
}

function countStableAimEnemies(state) {
  return (state?.bots?.enemies ?? []).filter((enemy) => enemy.directiveAgeS >= 0.5 && enemy.aimYawErrorDeg <= 60).length;
}

function hasLongSightlineOverwatch(state) {
  const player = state?.player?.pos;
  if (!player) return false;
  return (state?.bots?.enemies ?? []).some((enemy) => {
    const dx = enemy.position.x - player.x;
    const dz = enemy.position.z - player.z;
    const distance = Math.hypot(dx, dz);
    return distance > 40 && enemy.directSight === true && (
      enemy.state === "OVERWATCH"
      || enemy.reactionRemainingS > 0
      || enemy.burstShotsRemaining > 0
    );
  });
}

function renderReview(summary) {
  const lines = [
    "# Bot Intelligence Smoke Review",
    "",
    `- Status: ${summary.passed ? "PASS" : "FAIL"}`,
    `- Base URL: ${summary.baseUrl}`,
    `- Map ID: ${summary.mapId}`,
    `- Output: ${summary.outputDir}`,
    `- Started: ${summary.startedAt}`,
    `- Finished: ${summary.finishedAt}`,
    "",
    "## Checkpoints",
  ];

  for (const checkpoint of summary.checkpoints) {
    lines.push(
      `- ${checkpoint.id}: wave=${checkpoint.snapshot.waveNumber} elapsed=${checkpoint.snapshot.waveElapsedS?.toFixed?.(2) ?? "n/a"} tier=${checkpoint.snapshot.tier} alive=${checkpoint.snapshot.aliveCount} ff=${checkpoint.snapshot.preventedFriendlyFireCount}`,
    );
    lines.push(`  - image: ${checkpoint.imagePath}`);
    lines.push(`  - state: ${checkpoint.statePath}`);
    lines.push(`  - consoleErrors: ${checkpoint.console.errorCount}`);
  }

  if (summary.longSightline) {
    lines.push("", "## Long Sightline");
    lines.push(
      `- ${summary.longSightline.id}: wave=${summary.longSightline.snapshot.waveNumber} elapsed=${summary.longSightline.snapshot.waveElapsedS?.toFixed?.(2) ?? "n/a"} tier=${summary.longSightline.snapshot.tier} alive=${summary.longSightline.snapshot.aliveCount} ff=${summary.longSightline.snapshot.preventedFriendlyFireCount}`,
    );
    lines.push(`  - image: ${summary.longSightline.imagePath}`);
    lines.push(`  - state: ${summary.longSightline.statePath}`);
    lines.push(`  - consoleErrors: ${summary.longSightline.console.errorCount}`);
  }

  lines.push("", "## Assertions");
  for (const assertion of summary.assertions) {
    lines.push(`- ${assertion.passed ? "PASS" : "FAIL"} ${assertion.label}: ${assertion.detail}`);
  }

  return `${lines.join("\n")}\n`;
}

async function waitForRuntimeState(page) {
  await page.waitForFunction(() => {
    if (typeof window.render_game_to_text !== "function") return false;
    try {
      const state = JSON.parse(window.render_game_to_text());
      return state.mode === "runtime" && state.map?.loaded === true;
    } catch {
      return false;
    }
  }, { timeout: 20_000 });
}

const outputDir = path.resolve(process.cwd(), `../../artifacts/playwright/completion-gate/bot-intelligence/${timestampId()}`);
const stableDir = path.resolve(process.cwd(), "../../artifacts/playwright/completion-gate/bot-intelligence");

await ensureDir(outputDir);
await ensureDir(stableDir);

const { browser, context, page } = await launchBrowser({ headless: HEADLESS });
const consoleRecorder = attachConsoleRecorder(page);
await startTracing(context);
let tracingActive = true;

async function stopTracingOnce(tracePath) {
  if (!tracingActive) return;
  tracingActive = false;
  await stopTracing(context, tracePath);
}

const summary = {
  baseUrl: BASE_URL,
  mapId: MAP_ID,
  headless: HEADLESS,
  outputDir,
  startedAt: new Date().toISOString(),
  checkpoints: [],
  longSightline: null,
  assertions: [],
};

try {
  const url = buildRuntimeUrl(BASE_URL, {
    mapId: MAP_ID,
    autostart: "human",
    spawn: "A",
    extraSearchParams: {
      unlimitedHealth: 1,
      debug: 1,
    },
  });

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitForRuntimeState(page);

  const checkpoints = [
    { id: "t0", advanceMs: 0 },
    { id: "t25", advanceMs: 25_000 },
    { id: "t50", advanceMs: 25_000 },
  ];

  for (const checkpoint of checkpoints) {
    consoleRecorder.clear();
    if (checkpoint.advanceMs > 0) {
      await page.evaluate(async (ms) => {
        await window.advanceTime?.(ms);
      }, checkpoint.advanceMs);
    }
    await waitForRuntimeState(page);

    const imagePath = path.join(outputDir, `${checkpoint.id}.png`);
    const statePath = path.join(outputDir, `${checkpoint.id}.state.json`);
    const consolePath = path.join(outputDir, `${checkpoint.id}.console.json`);
    const state = await captureRuntimeSnapshot(page, { imagePath, statePath });
    const consoleCounts = consoleRecorder.counts();
    await writeJson(consolePath, {
      events: consoleRecorder.snapshot(),
      counts: consoleCounts,
    });

    summary.checkpoints.push({
      id: checkpoint.id,
      imagePath,
      statePath,
      consolePath,
      console: consoleCounts,
      snapshot: summarizeState(state),
      state,
    });
  }

  consoleRecorder.clear();
  const longSightUrl = buildRuntimeUrl(BASE_URL, {
    mapId: MAP_ID,
    autostart: "human",
    spawn: "A",
    extraSearchParams: {
      unlimitedHealth: 1,
      debug: 1,
    },
  });
  await page.goto(longSightUrl, { waitUntil: "domcontentloaded" });
  await waitForRuntimeState(page);
  await page.evaluate(async () => {
    await window.advanceTime?.(4_000);
  });
  await waitForRuntimeState(page);
  const longSightImagePath = path.join(outputDir, "long-sightline.png");
  const longSightStatePath = path.join(outputDir, "long-sightline.state.json");
  const longSightConsolePath = path.join(outputDir, "long-sightline.console.json");
  const longSightState = await captureRuntimeSnapshot(page, {
    imagePath: longSightImagePath,
    statePath: longSightStatePath,
  });
  const longSightConsoleCounts = consoleRecorder.counts();
  await writeJson(longSightConsolePath, {
    events: consoleRecorder.snapshot(),
    counts: longSightConsoleCounts,
  });
  summary.longSightline = {
    id: "spawn-a-long-los",
    imagePath: longSightImagePath,
    statePath: longSightStatePath,
    consolePath: longSightConsolePath,
    console: longSightConsoleCounts,
    snapshot: summarizeState(longSightState),
    state: longSightState,
  };

  const [t0, t25, t50] = summary.checkpoints.map((checkpoint) => checkpoint.state);
  if (!t0 || !t25 || !t50) {
    fail("Missing one or more checkpoint states");
  }

  const assertions = [
    {
      label: "starts on wave 1 tier 0",
      passed: t0.bots.waveNumber === 1 && t0.bots.tier === 0,
      detail: `wave=${t0.bots.waveNumber} tier=${t0.bots.tier}`,
    },
    {
      label: "tier increases at 25s",
      passed: t25.bots.tier === 0,
      detail: `tier=${t25.bots.tier} elapsed=${t25.bots.waveElapsedS}`,
    },
    {
      label: "tier increases again at 50s",
      passed: t50.bots.tier === 1,
      detail: `tier=${t50.bots.tier} elapsed=${t50.bots.waveElapsedS}`,
    },
    {
      label: "friendly fire stays disabled",
      passed:
        t0.bots.preventedFriendlyFireCount === 0
        && t25.bots.preventedFriendlyFireCount === 0
        && t50.bots.preventedFriendlyFireCount === 0,
      detail: `counts=${[t0.bots.preventedFriendlyFireCount, t25.bots.preventedFriendlyFireCount, t50.bots.preventedFriendlyFireCount].join("/")}`,
    },
    {
      label: "bots rotate into positions by 25s",
      passed: countMovedEnemies(t0, t25, 0.75) >= 4,
      detail: `moved=${countMovedEnemies(t0, t25, 0.75)}`,
    },
    {
      label: "holding pattern forms by 50s",
      passed: countSettledEnemies(t50) >= 3,
      detail: `settled=${countSettledEnemies(t50)}`,
    },
    {
      label: "long sightline produces overwatch or firing logic",
      passed: summary.longSightline !== null && hasLongSightlineOverwatch(summary.longSightline.state),
      detail: `longLos=${summary.longSightline !== null ? hasLongSightlineOverwatch(summary.longSightline.state) : false}`,
    },
    {
      label: "flankers stay gated before T3",
      passed:
        (t0.bots.roleCounts?.flanker ?? 0) === 0
        && (t25.bots.roleCounts?.flanker ?? 0) === 0
        && (t50.bots.roleCounts?.flanker ?? 0) === 0,
      detail: `flankers=${[t0.bots.roleCounts?.flanker ?? 0, t25.bots.roleCounts?.flanker ?? 0, t50.bots.roleCounts?.flanker ?? 0].join("/")}`,
    },
    {
      label: "anti-spazz metrics stay bounded",
      passed: countStableAimEnemies(t50) >= 6,
      detail: `stableAim=${countStableAimEnemies(t50)}`,
    },
    {
      label: "console remains clean",
      passed:
        summary.checkpoints.every((checkpoint) => checkpoint.console.errorCount === 0)
        && (summary.longSightline?.console.errorCount ?? 0) === 0,
      detail: `errors=${summary.checkpoints.map((checkpoint) => checkpoint.console.errorCount).join("/")}/${summary.longSightline?.console.errorCount ?? 0}`,
    },
  ];

  summary.assertions.push(...assertions);
  summary.passed = assertions.every((assertion) => assertion.passed);
  summary.finishedAt = new Date().toISOString();

  await stopTracingOnce(path.join(outputDir, "trace.zip"));
  await writeJson(path.join(outputDir, "summary.json"), summary);
  const review = renderReview(summary);
  await writeFile(path.join(outputDir, "review.md"), review, "utf8");
  await copyFile(path.join(outputDir, "summary.json"), path.join(stableDir, "latest-summary.json"));
  await copyFile(path.join(outputDir, "review.md"), path.join(stableDir, "latest-review.md"));

  if (!summary.passed) {
    const failed = assertions.filter((assertion) => !assertion.passed).map((assertion) => assertion.label).join(", ");
    fail(`assertions failed: ${failed}`);
  }

  console.log(`[bot:smoke] pass | output=${outputDir}`);
} catch (error) {
  summary.passed = false;
  summary.finishedAt = new Date().toISOString();
  summary.failure = error instanceof Error ? error.message : String(error);
  await stopTracingOnce(path.join(outputDir, "trace.zip"));
  await writeJson(path.join(outputDir, "summary.json"), summary);
  const review = renderReview(summary);
  await writeFile(path.join(outputDir, "review.md"), review, "utf8");
  await copyFile(path.join(outputDir, "summary.json"), path.join(stableDir, "latest-summary.json"));
  await copyFile(path.join(outputDir, "review.md"), path.join(stableDir, "latest-review.md"));
  throw error;
} finally {
  await context.close();
  await browser.close();
}
