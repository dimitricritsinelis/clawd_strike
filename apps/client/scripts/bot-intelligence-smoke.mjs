import path from "node:path";
import { copyFile, writeFile } from "node:fs/promises";
import {
  advanceRuntime,
  attachConsoleRecorder,
  buildRuntimeUrl,
  captureRuntimeSnapshot,
  ensureDir,
  gotoAgentRuntime,
  launchBrowser,
  parseBaseUrl,
  parseBooleanEnv,
  readRuntimeState,
  runAgentRoute,
  startTracing,
  stopTracing,
  writeJson,
} from "./lib/runtimePlaywright.mjs";

const BASE_URL = parseBaseUrl(process.env.BASE_URL ?? "http://127.0.0.1:5174");
const MAP_ID = (process.env.MAP_ID ?? "bazaar-map").trim() || "bazaar-map";
const HEADLESS = parseBooleanEnv(process.env.HEADLESS, true);
const MAP_MID_Z = 41;
const EXPECTED_BOT_COUNT = 10;
const BOT_OVERLAP_DISTANCE_M = 0.59;
const HIDDEN_PLAYER_POSE = { x: 4.8, y: 0.0001, z: 64, yawDeg: 180 };
const HIDDEN_PLAYER_ROUTE = {
  id: "hide-sh-w",
  label: "Hide in west hall",
  spawn: "A",
  expectedMinDistanceM: 18,
  maxStationaryTicks: 12,
  segments: [
    { durationMs: 1200, action: { moveX: 1 } },
    { durationMs: 1200, action: { moveZ: 1 } },
    { durationMs: 1200, action: { moveX: 1 } },
  ],
};

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
    lastSpawn: state?.bots?.lastSpawn ?? null,
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

function averageDistanceToPlayer(state) {
  const player = state?.player?.pos;
  const enemies = state?.bots?.enemies ?? [];
  if (!player || enemies.length === 0) return Number.POSITIVE_INFINITY;
  let total = 0;
  for (const enemy of enemies) {
    total += Math.hypot(enemy.position.x - player.x, enemy.position.z - player.z);
  }
  return total / enemies.length;
}

function minimumDistanceToPlayer(state) {
  const player = state?.player?.pos;
  const enemies = state?.bots?.enemies ?? [];
  if (!player || enemies.length === 0) return Number.POSITIVE_INFINITY;

  let best = Number.POSITIVE_INFINITY;
  for (const enemy of enemies) {
    best = Math.min(best, Math.hypot(enemy.position.x - player.x, enemy.position.z - player.z));
  }
  return best;
}

function collectSpawnValidationIssues(state, { checkLiveElevation = true } = {}) {
  const issues = [];
  for (const enemy of state?.bots?.enemies ?? []) {
    const spawnValidation = enemy.spawnValidation;
    if (!spawnValidation) {
      issues.push(`${enemy.id}:missing-spawn-validation`);
      continue;
    }
    if (!spawnValidation.valid) {
      issues.push(`${enemy.id}:invalid-spawn`);
    }
    if (!spawnValidation.withinPlayableBounds) {
      issues.push(`${enemy.id}:out-of-bounds`);
    }
    if (!spawnValidation.insideExpectedZone) {
      issues.push(`${enemy.id}:outside-zone`);
    }
    if ((spawnValidation.blockingColliderIds ?? []).length > 0) {
      issues.push(`${enemy.id}:blocked-by-${spawnValidation.blockingColliderIds.join("+")}`);
    }
    if (spawnValidation.elevated) {
      issues.push(`${enemy.id}:spawn-elevated`);
    }
    if (checkLiveElevation && Math.abs(enemy.position?.y ?? 0) > 0.05) {
      issues.push(`${enemy.id}:live-y=${(enemy.position?.y ?? 0).toFixed(3)}`);
    }
  }
  return issues;
}

function spawnValidationDetail(state) {
  const issues = collectSpawnValidationIssues(state);
  return issues.length > 0 ? issues.join(", ") : "ok";
}

function laneFromX(x) {
  if (x <= 14.5) return "west";
  if (x >= 35.5) return "east";
  return "main";
}

function countBotsInLane(state, lane) {
  return (state?.bots?.enemies ?? []).filter((enemy) => laneFromX(enemy.position.x) === lane).length;
}

function laneCounts(state) {
  return {
    west: countBotsInLane(state, "west"),
    main: countBotsInLane(state, "main"),
    east: countBotsInLane(state, "east"),
  };
}

function findOverlappingBotPairs(state, minimumDistanceM = BOT_OVERLAP_DISTANCE_M) {
  const enemies = state?.bots?.enemies ?? [];
  const pairs = [];
  for (let i = 0; i < enemies.length - 1; i += 1) {
    const first = enemies[i];
    for (let j = i + 1; j < enemies.length; j += 1) {
      const second = enemies[j];
      const distance = Math.hypot(
        first.position.x - second.position.x,
        first.position.z - second.position.z,
      );
      if (distance < minimumDistanceM) {
        pairs.push({
          firstId: first.id,
          secondId: second.id,
          distance,
        });
      }
    }
  }
  return pairs;
}

function overlappingBotPairDetail(state) {
  const pairs = findOverlappingBotPairs(state);
  return pairs.length > 0
    ? pairs.map((pair) => `${pair.firstId}+${pair.secondId}@${pair.distance.toFixed(3)}`).join(", ")
    : "ok";
}

function botsOnOppositeHalf(state) {
  const playerZ = state?.player?.pos?.z;
  const enemies = state?.bots?.enemies ?? [];
  if (typeof playerZ !== "number" || enemies.length === 0) return false;
  const playerStartsSouth = playerZ < MAP_MID_Z;
  return enemies.every((enemy) => playerStartsSouth ? enemy.position.z > MAP_MID_Z : enemy.position.z < MAP_MID_Z);
}

function countNoSightOverwatch(state) {
  return (state?.bots?.enemies ?? []).filter((enemy) => enemy.state === "OVERWATCH" && enemy.directSight !== true).length;
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

  if (summary.zeroContact) {
    lines.push("", "## Zero Contact");
    for (const checkpoint of summary.zeroContact.checkpoints ?? []) {
      lines.push(
        `- ${checkpoint.id}: wave=${checkpoint.snapshot.waveNumber} elapsed=${checkpoint.snapshot.waveElapsedS?.toFixed?.(2) ?? "n/a"} alive=${checkpoint.state?.gameplay?.alive !== false} avgDist=${averageDistanceToPlayer(checkpoint.state).toFixed(2)}`,
      );
      lines.push(`  - image: ${checkpoint.imagePath}`);
      lines.push(`  - state: ${checkpoint.statePath}`);
      lines.push(`  - consoleErrors: ${checkpoint.console.errorCount}`);
    }
  }

  if (summary.hiddenSearch) {
    lines.push("", "## Hidden Search");
    if (summary.hiddenSearch.route) {
      lines.push(`- route: ${summary.hiddenSearch.route.routeId} distance=${summary.hiddenSearch.route.distanceM?.toFixed?.(2) ?? "n/a"} zones=${(summary.hiddenSearch.route.zonesVisited ?? []).join(",")}`);
    }
    for (const checkpoint of summary.hiddenSearch.checkpoints ?? []) {
      lines.push(
        `- ${checkpoint.id}: wave=${checkpoint.snapshot.waveNumber} elapsed=${checkpoint.snapshot.waveElapsedS?.toFixed?.(2) ?? "n/a"} alive=${checkpoint.state?.gameplay?.alive !== false} avgDist=${averageDistanceToPlayer(checkpoint.state).toFixed(2)}`,
      );
      lines.push(`  - image: ${checkpoint.imagePath}`);
      lines.push(`  - state: ${checkpoint.statePath}`);
      lines.push(`  - consoleErrors: ${checkpoint.console.errorCount}`);
    }
  }

  if (summary.respawnScenario?.checkpoint) {
    lines.push("", "## Adaptive Respawn");
    if (summary.respawnScenario.route) {
      lines.push(`- route: ${summary.respawnScenario.route.routeId} distance=${summary.respawnScenario.route.distanceM?.toFixed?.(2) ?? "n/a"} zones=${(summary.respawnScenario.route.zonesVisited ?? []).join(",")}`);
    }
    lines.push(
      `- ${summary.respawnScenario.checkpoint.id}: wave=${summary.respawnScenario.checkpoint.snapshot.waveNumber} elapsed=${summary.respawnScenario.checkpoint.snapshot.waveElapsedS?.toFixed?.(2) ?? "n/a"} alive=${summary.respawnScenario.checkpoint.snapshot.aliveCount} minDist=${minimumDistanceToPlayer(summary.respawnScenario.checkpoint.state).toFixed(2)}`,
    );
    lines.push(`  - image: ${summary.respawnScenario.checkpoint.imagePath}`);
    lines.push(`  - state: ${summary.respawnScenario.checkpoint.statePath}`);
    lines.push(`  - consoleErrors: ${summary.respawnScenario.checkpoint.console.errorCount}`);
  }

  lines.push("", "## Assertions");
  for (const assertion of summary.assertions) {
    lines.push(`- ${assertion.passed ? "PASS" : "FAIL"} ${assertion.label}: ${assertion.detail}`);
  }

  return `${lines.join("\n")}\n`;
}

function isIgnorableConsoleEvent(event) {
  const text = event?.text ?? "";
  const url = event?.url ?? event?.location?.url ?? "";
  return (
    url.includes("/api/run/start")
    || text.includes("[shared-champion] failed to start run session")
    || text.includes("[shared-champion] failed to load SyntaxError")
    || text.includes("POST /api/run/start failed: 404")
  );
}

function summarizeConsoleEvents(events) {
  const filtered = events.filter((event) => !isIgnorableConsoleEvent(event));
  const errorCount = filtered.filter((event) => event.type === "error" || event.kind === "pageerror").length;
  const warningCount = filtered.filter((event) => event.type === "warning" || event.type === "warn").length;
  return {
    errorCount,
    warningCount,
    total: filtered.length,
  };
}

async function waitForRuntimeState(page) {
  await page.waitForFunction(() => {
    if (typeof window.render_game_to_text !== "function") return false;
    try {
      const state = JSON.parse(window.render_game_to_text());
      return state.mode === "runtime"
        && state.map?.loaded === true
        && state.boot?.revealPhase === "active";
    } catch {
      return false;
    }
  }, { timeout: 20_000 });
}

async function captureCheckpoint(page, outputDir, consoleRecorder, id) {
  await waitForRuntimeState(page);
  const imagePath = path.join(outputDir, `${id}.png`);
  const statePath = path.join(outputDir, `${id}.state.json`);
  const consolePath = path.join(outputDir, `${id}.console.json`);
  const state = await captureRuntimeSnapshot(page, { imagePath, statePath });
  const consoleEvents = consoleRecorder.snapshot();
  const consoleCounts = summarizeConsoleEvents(consoleEvents);
  await writeJson(consolePath, {
    events: consoleEvents,
    counts: consoleCounts,
  });

  return {
    id,
    imagePath,
    statePath,
    consolePath,
    console: consoleCounts,
    snapshot: summarizeState(state),
    state,
  };
}

async function readRuntimeStateWithRetry(page, { retries = 8, delayMs = 250 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await readRuntimeState(page);
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(delayMs);
    }
  }
  throw lastError;
}

async function advanceToWaveElapsedS(page, targetS, onIntermediateState) {
  let state = await readRuntimeStateWithRetry(page);
  let remainingMs = Math.max(0, Math.round(targetS * 1000 - ((state?.bots?.waveElapsedS ?? 0) * 1000)));

  while (remainingMs > 5_000) {
    await advanceRuntime(page, 5_000);
    remainingMs -= 5_000;
    state = await readRuntimeStateWithRetry(page);
    if (onIntermediateState) {
      await onIntermediateState(state);
    }
  }

  if (remainingMs > 0) {
    await advanceRuntime(page, remainingMs);
    state = await readRuntimeStateWithRetry(page);
    if (onIntermediateState) {
      await onIntermediateState(state);
    }
  }

  return state;
}

async function enforceHiddenPlayerPose(page, options = {}) {
  const suppressIntelMs = options.suppressIntelMs ?? 0;
  await page.evaluate(({ pose, suppressIntel }) => {
    window.__debug_set_player_pose?.(pose);
    if (suppressIntel > 0) {
      window.__debug_suppress_bot_intel_ms?.(suppressIntel);
    }
    window.agent_apply_action?.({
      moveX: 0,
      moveZ: 0,
      lookYawDelta: 0,
      lookPitchDelta: 0,
      fire: false,
      crouch: true,
    });
  }, { pose: HIDDEN_PLAYER_POSE, suppressIntel: suppressIntelMs });
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
  zeroContact: {
    checkpoints: [],
  },
  hiddenSearch: {
    route: null,
    checkpoints: [],
  },
  respawnScenario: {
    route: null,
    checkpoint: null,
    eliminated: 0,
  },
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
    { id: "t15", advanceMs: 15_000 },
    { id: "t30", advanceMs: 15_000 },
    { id: "t60", advanceMs: 30_000 },
  ];

  for (const checkpoint of checkpoints) {
    consoleRecorder.clear();
    if (checkpoint.advanceMs > 0) {
      await advanceRuntime(page, checkpoint.advanceMs);
    }
    summary.checkpoints.push(await captureCheckpoint(page, outputDir, consoleRecorder, checkpoint.id));
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
  await advanceRuntime(page, 4_000);
  summary.longSightline = await captureCheckpoint(page, outputDir, consoleRecorder, "long-sightline");
  summary.longSightline.id = "spawn-a-long-los";

  consoleRecorder.clear();
  await gotoAgentRuntime(page, {
    baseUrl: BASE_URL,
    mapId: MAP_ID,
    agentName: "ZeroContact",
    spawn: "A",
    extraSearchParams: {
      debug: 1,
    },
  });
  const zeroContactOutputDir = path.join(outputDir, "zero-contact");
  await enforceHiddenPlayerPose(page, { suppressIntelMs: 55_000 });
  summary.zeroContact.checkpoints.push(await captureCheckpoint(page, zeroContactOutputDir, consoleRecorder, "post-teleport"));

  const zeroContactTargetsS = [15, 30, 60, 90];
  let zeroContactDeathAtS = null;
  for (const targetS of zeroContactTargetsS) {
    consoleRecorder.clear();
    await advanceToWaveElapsedS(page, targetS, async (currentState) => {
      if (zeroContactDeathAtS === null && (currentState?.gameplay?.alive === false || currentState?.gameOver?.visible === true)) {
        zeroContactDeathAtS = currentState?.bots?.waveElapsedS ?? null;
      }
      if (zeroContactDeathAtS === null && currentState?.gameplay?.alive !== false && currentState?.player?.zoneId !== "SH_W") {
        await enforceHiddenPlayerPose(page, { suppressIntelMs: 10_000 });
      }
    });
    const checkpoint = await captureCheckpoint(page, zeroContactOutputDir, consoleRecorder, `t${targetS}`);
    if (zeroContactDeathAtS === null && (checkpoint.state?.gameplay?.alive === false || checkpoint.state?.gameOver?.visible === true)) {
      zeroContactDeathAtS = checkpoint.state?.bots?.waveElapsedS ?? null;
    }
    summary.zeroContact.checkpoints.push(checkpoint);
  }
  summary.zeroContact.deathAtS = zeroContactDeathAtS;

  consoleRecorder.clear();
  await gotoAgentRuntime(page, {
    baseUrl: BASE_URL,
    mapId: MAP_ID,
    agentName: "BotSmoke",
    spawn: "A",
    extraSearchParams: {
      debug: 1,
    },
  });
  const hiddenOutputDir = path.join(outputDir, "hidden-search");
  const hiddenRoute = await runAgentRoute(page, HIDDEN_PLAYER_ROUTE, { tickMs: 100 });
  await enforceHiddenPlayerPose(page);
  summary.hiddenSearch.route = hiddenRoute;
  consoleRecorder.clear();
  summary.hiddenSearch.checkpoints.push(await captureCheckpoint(page, hiddenOutputDir, consoleRecorder, "post-route"));

  const hiddenTargetsS = [30, 60, 90];
  let hiddenDeathAtS = null;
  for (const targetS of hiddenTargetsS) {
    consoleRecorder.clear();
    await advanceToWaveElapsedS(page, targetS, async (currentState) => {
      if (hiddenDeathAtS === null && (currentState?.gameplay?.alive === false || currentState?.gameOver?.visible === true)) {
        hiddenDeathAtS = currentState?.bots?.waveElapsedS ?? null;
      }
      if (hiddenDeathAtS === null && currentState?.gameplay?.alive !== false && currentState?.player?.zoneId !== "SH_W") {
        await enforceHiddenPlayerPose(page);
      }
    });
    const checkpoint = await captureCheckpoint(page, hiddenOutputDir, consoleRecorder, `t${targetS}`);
    if (hiddenDeathAtS === null && (checkpoint.state?.gameplay?.alive === false || checkpoint.state?.gameOver?.visible === true)) {
      hiddenDeathAtS = checkpoint.state?.bots?.waveElapsedS ?? null;
    }
    summary.hiddenSearch.checkpoints.push(checkpoint);
  }
  summary.hiddenSearch.deathAtS = hiddenDeathAtS;

  consoleRecorder.clear();
  await gotoAgentRuntime(page, {
    baseUrl: BASE_URL,
    mapId: MAP_ID,
    agentName: "RespawnCheck",
    spawn: "A",
    extraSearchParams: {
      unlimitedHealth: 1,
      debug: 1,
    },
  });
  summary.respawnScenario.route = await runAgentRoute(page, HIDDEN_PLAYER_ROUTE, { tickMs: 100 });
  const respawnRouteState = await readRuntimeState(page);
  if (!respawnRouteState?.gameplay?.alive) {
    fail("Adaptive respawn route died before wave clear");
  }
  summary.respawnScenario.eliminated = await page.evaluate(() => window.__debug_eliminate_all_bots?.() ?? 0);
  await advanceRuntime(page, 150);
  await page.waitForFunction(() => {
    if (typeof window.render_game_to_text !== "function") return false;
    try {
      const state = JSON.parse(window.render_game_to_text());
      return state?.bots?.aliveCount === 0;
    } catch {
      return false;
    }
  }, { timeout: 5_000 });
  await advanceRuntime(page, 5_250);
  await page.waitForFunction(() => {
    if (typeof window.render_game_to_text !== "function") return false;
    try {
      const state = JSON.parse(window.render_game_to_text());
      return state?.bots?.waveNumber === 2 && state?.bots?.lastSpawn?.mode === "adaptive";
    } catch {
      return false;
    }
  }, { timeout: 10_000 });
  summary.respawnScenario.checkpoint = await captureCheckpoint(page, outputDir, consoleRecorder, "respawn-wave2");

  const checkpointMap = new Map(summary.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint.state]));
  const zeroContactCheckpointMap = new Map(summary.zeroContact.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint.state]));
  const hiddenCheckpointMap = new Map(summary.hiddenSearch.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint.state]));
  const t0 = checkpointMap.get("t0");
  const t15 = checkpointMap.get("t15");
  const t30 = checkpointMap.get("t30");
  const t60 = checkpointMap.get("t60");
  const zeroContactPostTeleport = zeroContactCheckpointMap.get("post-teleport");
  const zeroContactT15 = zeroContactCheckpointMap.get("t15");
  const zeroContactT30 = zeroContactCheckpointMap.get("t30");
  const zeroContactT90 = zeroContactCheckpointMap.get("t90");
  const hiddenPostRoute = hiddenCheckpointMap.get("post-route");
  const hiddenT30 = hiddenCheckpointMap.get("t30");
  const hiddenT60 = hiddenCheckpointMap.get("t60");
  const hiddenT90 = hiddenCheckpointMap.get("t90");
  const respawnState = summary.respawnScenario.checkpoint?.state ?? null;
  const respawnTelemetry = respawnState?.bots?.lastSpawn ?? null;
  if (!t0 || !t15 || !t30 || !t60 || !zeroContactPostTeleport || !zeroContactT15 || !zeroContactT30 || !zeroContactT90 || !hiddenPostRoute || !hiddenT30 || !hiddenT60 || !hiddenT90 || !respawnState || !respawnTelemetry) {
    fail("Missing one or more checkpoint states");
  }
  const initialTelemetry = t0.bots.lastSpawn ?? null;
  const initialLaneCounts = laneCounts(t0);
  const settledAtT30 = countSettledEnemies(t30);
  const stableAimAtT30 = countStableAimEnemies(t30);
  const respawnMinDistance = minimumDistanceToPlayer(respawnState);

  const assertions = [
    {
      label: "starts on wave 1 tier 1",
      passed: t0.bots.waveNumber === 1 && t0.bots.tier === 1,
      detail: `wave=${t0.bots.waveNumber} tier=${t0.bots.tier}`,
    },
    {
      label: "wave 1 uses adaptive initial spawn telemetry",
      passed:
        initialTelemetry !== null
        && initialTelemetry.mode === "adaptive"
        && initialTelemetry.selectedNodeIds.length === EXPECTED_BOT_COUNT,
      detail: `mode=${initialTelemetry?.mode ?? "n/a"} nodes=${initialTelemetry?.selectedNodeIds?.length ?? 0}`,
    },
    {
      label: "wave 1 starts with ten live bots",
      passed: t0.bots.aliveCount === EXPECTED_BOT_COUNT,
      detail: `alive=${t0.bots.aliveCount}`,
    },
    {
      label: "initial spawn opens with zero visible bots",
      passed: initialTelemetry !== null && initialTelemetry.visibleCount === 0,
      detail: `visible=${initialTelemetry?.visibleCount ?? "n/a"}`,
    },
    {
      label: "initial spawn stays on the opposite half of the map",
      passed: botsOnOppositeHalf(t0),
      detail: `playerZ=${t0.player?.pos?.z ?? "n/a"} enemyZ=${(t0.bots.enemies ?? []).map((enemy) => enemy.position.z.toFixed(1)).join("/")}`,
    },
    {
      label: "initial spawn spreads bots across west main and east lanes",
      passed:
        initialLaneCounts.west >= 2
        && initialLaneCounts.main >= 2
        && initialLaneCounts.east >= 2
        && initialLaneCounts.west <= 4
        && initialLaneCounts.main <= 4
        && initialLaneCounts.east <= 4,
      detail: `lanes=${initialLaneCounts.west}/${initialLaneCounts.main}/${initialLaneCounts.east}`,
    },
    {
      label: "initial spawn keeps the opening comfortably distant",
      passed: Number.isFinite(minimumDistanceToPlayer(t0)) && minimumDistanceToPlayer(t0) >= 24,
      detail: `minDistance=${minimumDistanceToPlayer(t0).toFixed(2)}`,
    },
    {
      label: "initial spawn footprints stay valid",
      passed: collectSpawnValidationIssues(t0).length === 0,
      detail: spawnValidationDetail(t0),
    },
    {
      label: "initial spawn keeps bots physically separated",
      passed: findOverlappingBotPairs(t0).length === 0,
      detail: overlappingBotPairDetail(t0),
    },
    {
      label: "wave 1 stays on tier 1 through 15s",
      passed: t15.bots.tier === 1,
      detail: `tier=${t15.bots.tier} elapsed=${t15.bots.waveElapsedS}`,
    },
    {
      label: "wave 1 reaches tier 2 at 30s",
      passed: t30.bots.tier === 2,
      detail: `tier=${t30.bots.tier} elapsed=${t30.bots.waveElapsedS}`,
    },
    {
      label: "wave 1 reaches tier 3 at 60s",
      passed: t60.bots.tier === 3,
      detail: `tier=${t60.bots.tier} elapsed=${t60.bots.waveElapsedS}`,
    },
    {
      label: "friendly fire stays disabled",
      passed:
        t0.bots.preventedFriendlyFireCount === 0
        && t15.bots.preventedFriendlyFireCount === 0
        && t30.bots.preventedFriendlyFireCount === 0
        && t60.bots.preventedFriendlyFireCount === 0,
      detail: `counts=${[t0.bots.preventedFriendlyFireCount, t15.bots.preventedFriendlyFireCount, t30.bots.preventedFriendlyFireCount, t60.bots.preventedFriendlyFireCount].join("/")}`,
    },
    {
      label: "bots rotate into positions by 15s",
      passed: countMovedEnemies(t0, t15, 0.75) >= 4,
      detail: `moved=${countMovedEnemies(t0, t15, 0.75)}`,
    },
    {
      label: "active-wave checkpoints avoid bot overlap",
      passed:
        findOverlappingBotPairs(t15).length === 0
        && findOverlappingBotPairs(t30).length === 0
        && findOverlappingBotPairs(t60).length === 0,
      detail: `t15=${overlappingBotPairDetail(t15)} | t30=${overlappingBotPairDetail(t30)} | t60=${overlappingBotPairDetail(t60)}`,
    },
    {
      label: "full hunt is active and closing by 30s",
      passed:
        t30.bots.searchPhase === "pinch"
        && averageDistanceToPlayer(t30) <= averageDistanceToPlayer(t15) - 1.5,
      detail: `phase=${t30.bots.searchPhase} avgDist=${averageDistanceToPlayer(t15).toFixed(2)}->${averageDistanceToPlayer(t30).toFixed(2)}`,
    },
    {
      label: "pressure keeps closing by 60s",
      passed: averageDistanceToPlayer(t60) <= averageDistanceToPlayer(t15) - 4,
      detail: `avgDist=${averageDistanceToPlayer(t15).toFixed(2)}->${averageDistanceToPlayer(t60).toFixed(2)}`,
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
        && (t15.bots.roleCounts?.flanker ?? 0) === 0
        && (t30.bots.roleCounts?.flanker ?? 0) === 0,
      detail: `flankers=${[t0.bots.roleCounts?.flanker ?? 0, t15.bots.roleCounts?.flanker ?? 0, t30.bots.roleCounts?.flanker ?? 0].join("/")}`,
    },
    {
      label: "anti-spazz metrics stay bounded",
      passed: stableAimAtT30 >= Math.max(3, Math.floor(settledAtT30 * 0.4)),
      detail: `stableAim=${stableAimAtT30} settled=${settledAtT30}`,
    },
    {
      label: "zero-contact camper starts hidden and silent",
      passed:
        zeroContactPostTeleport.player?.zoneId === "SH_W"
        && (zeroContactPostTeleport.bots?.lastSeenPlayer ?? null) === null
        && (zeroContactPostTeleport.bots?.lastHeardPlayer ?? null) === null,
      detail: `zone=${zeroContactPostTeleport.player?.zoneId ?? "n/a"} seen=${zeroContactPostTeleport.bots?.lastSeenPlayer ? "yes" : "no"} heard=${zeroContactPostTeleport.bots?.lastHeardPlayer ? "yes" : "no"}`,
    },
    {
      label: "zero-contact search leaves caution and fans tasks by 15s",
      passed:
        zeroContactT15.bots?.searchPhase === "probe"
        && (zeroContactT15.bots?.squadTasks?.length ?? 0) >= 5
        && new Set((zeroContactT15.bots?.squadTasks ?? []).map((task) => task.zoneId)).size >= 3
        && (zeroContactT15.bots?.squadTasks ?? []).filter((task) => task.lane === "west").length >= 2,
      detail: `phase=${zeroContactT15.bots?.searchPhase ?? "n/a"} tasks=${zeroContactT15.bots?.squadTasks?.length ?? 0} westTasks=${(zeroContactT15.bots?.squadTasks ?? []).filter((task) => task.lane === "west").length} uniqueZones=${new Set((zeroContactT15.bots?.squadTasks ?? []).map((task) => task.zoneId)).size}`,
    },
    {
      label: "zero-contact full hunt is active by 30s",
      passed:
        zeroContactT30.bots?.searchPhase === "pinch"
        && (zeroContactT30.bots?.squadTasks?.length ?? 0) >= 5,
      detail: `phase=${zeroContactT30.bots?.searchPhase ?? "n/a"} tasks=${zeroContactT30.bots?.squadTasks?.length ?? 0}`,
    },
    {
      label: "zero-contact hunt kills or hard-pins by 90s",
      passed:
        (summary.zeroContact.deathAtS !== null && summary.zeroContact.deathAtS <= 90)
        || (
          averageDistanceToPlayer(zeroContactT90) <= 21
          && countBotsInLane(zeroContactT90, "west") + countBotsInLane(zeroContactT90, "main") >= 8
        ),
      detail: `deathAt=${summary.zeroContact.deathAtS ?? "n/a"} avgDist90=${averageDistanceToPlayer(zeroContactT90).toFixed(2)} westMain90=${countBotsInLane(zeroContactT90, "west") + countBotsInLane(zeroContactT90, "main")}`,
    },
    {
      label: "hidden route reaches the west hall",
      passed:
        summary.hiddenSearch.route !== null
        && summary.hiddenSearch.route.zonesVisited.includes("SH_W")
        && hiddenPostRoute.player?.zoneId === "SH_W",
      detail: `zones=${summary.hiddenSearch.route?.zonesVisited?.join("/") ?? "n/a"} finalZone=${hiddenPostRoute.player?.zoneId ?? "n/a"}`,
    },
    {
      label: "hidden-player search commits by 30s",
      passed:
        (summary.hiddenSearch.deathAtS !== null && summary.hiddenSearch.deathAtS <= 30)
        || (
          hiddenT30.player?.zoneId === "SH_W"
          && countBotsInLane(hiddenT30, "west") >= 3
          && averageDistanceToPlayer(hiddenT30) <= averageDistanceToPlayer(hiddenPostRoute) - 4
        ),
      detail: `deathAt=${summary.hiddenSearch.deathAtS ?? "n/a"} west30=${countBotsInLane(hiddenT30, "west")} avgDist=${averageDistanceToPlayer(hiddenPostRoute).toFixed(2)}->${averageDistanceToPlayer(hiddenT30).toFixed(2)} zone30=${hiddenT30.player?.zoneId ?? "n/a"}`,
    },
    {
      label: "hidden-player search keeps collapsing by 60s",
      passed:
        (summary.hiddenSearch.deathAtS !== null && summary.hiddenSearch.deathAtS <= 60)
        || (
          hiddenT60.player?.zoneId === "SH_W"
          && countBotsInLane(hiddenT60, "west") >= 8
          && averageDistanceToPlayer(hiddenT60) <= 21
        ),
      detail: `deathAt=${summary.hiddenSearch.deathAtS ?? "n/a"} west60=${countBotsInLane(hiddenT60, "west")} avgDist=${averageDistanceToPlayer(hiddenPostRoute).toFixed(2)}->${averageDistanceToPlayer(hiddenT60).toFixed(2)} zone60=${hiddenT60.player?.zoneId ?? "n/a"}`,
    },
    {
      label: "full hunt kills or hard-pins a hidden idle player by 90s",
      passed:
        (summary.hiddenSearch.deathAtS !== null && summary.hiddenSearch.deathAtS <= 90)
        || (
          hiddenT90.player?.zoneId === "SH_W"
          && countBotsInLane(hiddenT90, "west") + countBotsInLane(hiddenT90, "main") >= 8
          && averageDistanceToPlayer(hiddenT90) <= 20
        ),
      detail: `deathAt=${summary.hiddenSearch.deathAtS ?? "n/a"} alive90=${hiddenT90.gameplay?.alive} avgDist90=${averageDistanceToPlayer(hiddenT90).toFixed(2)} westMain90=${countBotsInLane(hiddenT90, "west") + countBotsInLane(hiddenT90, "main")}`,
    },
    {
      label: "respawn route leaves the authored opening",
      passed: (summary.respawnScenario.route?.distanceM ?? 0) >= 12,
      detail: `distance=${summary.respawnScenario.route?.distanceM ?? 0}`,
    },
    {
      label: "adaptive respawn clears all ten bots before wave 2",
      passed: summary.respawnScenario.eliminated === EXPECTED_BOT_COUNT,
      detail: `eliminated=${summary.respawnScenario.eliminated}`,
    },
    {
      label: "wave 2 uses adaptive respawn mode under the new tier schedule",
      passed: respawnState.bots.waveNumber === 2 && respawnState.bots.tier === 1 && respawnTelemetry.mode === "adaptive",
      detail: `wave=${respawnState.bots.waveNumber} tier=${respawnState.bots.tier} mode=${respawnTelemetry.mode}`,
    },
    {
      label: "adaptive respawn footprints stay valid",
      passed: collectSpawnValidationIssues(respawnState).length === 0,
      detail: spawnValidationDetail(respawnState),
    },
    {
      label: "adaptive respawn keeps bots physically separated",
      passed: findOverlappingBotPairs(respawnState).length === 0,
      detail: overlappingBotPairDetail(respawnState),
    },
    {
      label: "adaptive respawn keeps the far-distance floor",
      passed:
        typeof respawnTelemetry.distanceFloorM === "number"
        && respawnTelemetry.distanceFloorM >= 18
        && typeof respawnTelemetry.minDistanceToPlayerM === "number"
        && respawnTelemetry.minDistanceToPlayerM >= respawnTelemetry.distanceFloorM,
      detail: `floor=${respawnTelemetry.distanceFloorM} min=${respawnTelemetry.minDistanceToPlayerM}`,
    },
    {
      label: "adaptive respawn prefers zero visible bots",
      passed: respawnTelemetry.visibleCount === 0,
      detail: `visible=${respawnTelemetry.visibleCount}`,
    },
    {
      label: "adaptive respawn never exposes more than one bot",
      passed: respawnTelemetry.visibleCount <= 1,
      detail: `visible=${respawnTelemetry.visibleCount}`,
    },
    {
      label: "adaptive respawn never stacks onto the player",
      passed: Number.isFinite(respawnMinDistance) && respawnMinDistance >= 18,
      detail: `minDistance=${respawnMinDistance}`,
    },
    {
      label: "console remains clean",
      passed:
        summary.checkpoints.every((checkpoint) => checkpoint.console.errorCount === 0)
        && (summary.longSightline?.console.errorCount ?? 0) === 0
        && summary.zeroContact.checkpoints.every((checkpoint) => checkpoint.console.errorCount === 0)
        && summary.hiddenSearch.checkpoints.every((checkpoint) => checkpoint.console.errorCount === 0)
        && (summary.respawnScenario.checkpoint?.console.errorCount ?? 0) === 0,
      detail: `errors=${summary.checkpoints.map((checkpoint) => checkpoint.console.errorCount).join("/")}/${summary.longSightline?.console.errorCount ?? 0}/${summary.zeroContact.checkpoints.map((checkpoint) => checkpoint.console.errorCount).join("/")}/${summary.hiddenSearch.checkpoints.map((checkpoint) => checkpoint.console.errorCount).join("/")}/${summary.respawnScenario.checkpoint?.console.errorCount ?? 0}`,
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
