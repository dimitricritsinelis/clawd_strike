import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

export const DEFAULT_BASE_URL = "http://127.0.0.1:5174";
export const DEFAULT_MAP_ID = "bazaar-map";
export const DEFAULT_AGENT_NAME = "SmokeRunner";
export const DEFAULT_VIEWPORT = { width: 1440, height: 900 };
export const DEFAULT_RUNTIME_READY_TIMEOUT_MS = 90_000;
export const DEFAULT_ROUTE_TICK_MS = 100;
export const DEFAULT_REVIEW_SHOT_COUNT = 8;

export const TRAVERSAL_ROUTES = [
  {
    id: "spawn-a-main",
    label: "Spawn A main-lane push",
    spawn: "A",
    expectedMinDistanceM: 8,
    maxStationaryTicks: 8,
    segments: [
      { durationMs: 2600, action: { moveZ: 1, sprint: true } },
      { durationMs: 900, action: { moveZ: 1, moveX: 0.15, sprint: true } },
    ],
  },
  {
    id: "spawn-b-main",
    label: "Spawn B main-lane push",
    spawn: "B",
    expectedMinDistanceM: 8,
    maxStationaryTicks: 8,
    segments: [
      { durationMs: 2600, action: { moveZ: 1, sprint: true } },
      { durationMs: 900, action: { moveZ: 1, moveX: -0.15, sprint: true } },
    ],
  },
  {
    id: "spawn-a-slide-probe",
    label: "Spawn A slide probe",
    spawn: "A",
    expectedMinDistanceM: 6,
    maxStationaryTicks: 10,
    segments: [
      { durationMs: 1400, action: { moveZ: 1, moveX: 0.3, sprint: true } },
      { durationMs: 1200, action: { moveZ: 1, sprint: true } },
    ],
  },
];

export function parseBaseUrl(value = DEFAULT_BASE_URL) {
  try {
    return new URL(value).toString();
  } catch {
    throw new Error(`Invalid BASE_URL '${value}'`);
  }
}

export function parseBooleanEnv(value, defaultValue) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return value === "1" || value.toLowerCase() === "true";
}

export function trimAgentName(value, fallback = DEFAULT_AGENT_NAME) {
  const normalized = (value ?? fallback).trim().slice(0, 15);
  return normalized.length > 0 ? normalized : fallback;
}

export function sanitizeFileSegment(value) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_");
}

export async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

export async function writeJson(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

export function buildRuntimeUrl(baseUrl, options = {}) {
  const {
    mapId = DEFAULT_MAP_ID,
    autostart = "agent",
    agentName,
    shot,
    spawn,
    extraSearchParams = {},
  } = options;

  const url = new URL("/", parseBaseUrl(baseUrl));
  url.searchParams.set("map", mapId);
  url.searchParams.set("autostart", autostart);

  if (agentName) {
    url.searchParams.set("name", trimAgentName(agentName));
  }
  if (shot) {
    url.searchParams.set("shot", shot);
  }
  if (spawn) {
    url.searchParams.set("spawn", spawn);
  }

  for (const [key, rawValue] of Object.entries(extraSearchParams)) {
    if (rawValue === null || rawValue === undefined || rawValue === false) continue;
    url.searchParams.set(key, String(rawValue));
  }

  return url.toString();
}

export async function launchBrowser(options = {}) {
  const {
    headless = false,
    viewport = DEFAULT_VIEWPORT,
  } = options;

  const browser = await chromium
    .launch({
      channel: "chrome",
      headless,
    })
    .catch(() => chromium.launch({ headless }));

  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  return { browser, context, page };
}

export function attachConsoleRecorder(page) {
  const events = [];

  const push = (event) => {
    events.push({
      ...event,
      recordedAt: new Date().toISOString(),
    });
  };

  page.on("console", (message) => {
    push({
      kind: "console",
      type: message.type(),
      text: message.text(),
      location: message.location(),
    });
  });

  page.on("pageerror", (error) => {
    push({
      kind: "pageerror",
      type: "error",
      text: error.message,
      stack: error.stack ?? null,
    });
  });

  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText ?? "request failed";
    const aborted = /ERR_ABORTED|NS_BINDING_ABORTED|aborted|cancelled/i.test(errorText);
    push({
      kind: "requestfailed",
      type: aborted ? "warning" : "error",
      text: errorText,
      url: request.url(),
      method: request.method(),
    });
  });

  return {
    clear() {
      events.length = 0;
    },
    snapshot() {
      return events.map((event) => ({ ...event }));
    },
    counts() {
      const errorCount = events.filter((event) => event.type === "error" || event.kind === "pageerror").length;
      const warningCount = events.filter((event) => event.type === "warning" || event.type === "warn").length;
      return {
        errorCount,
        warningCount,
        total: events.length,
      };
    },
  };
}

export async function startTracing(context) {
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
}

export async function stopTracing(context, tracePath) {
  await ensureDir(path.dirname(tracePath));
  await context.tracing.stop({ path: tracePath });
}

export async function readRuntimeState(page) {
  const state = await page.evaluate(() => {
    if (typeof window.render_game_to_text !== "function") {
      return null;
    }

    try {
      return JSON.parse(window.render_game_to_text());
    } catch {
      return null;
    }
  });

  if (!state || typeof state !== "object") {
    throw new Error("Runtime state is unavailable");
  }

  return state;
}

export async function getDocumentedAgentApiStatus(page) {
  return page.evaluate(() => ({
    agentObserve: typeof window.agent_observe === "function",
    renderGameToText: typeof window.render_game_to_text === "function",
    agentApplyAction: typeof window.agent_apply_action === "function",
    advanceTime: typeof window.advanceTime === "function",
  }));
}

export async function readDocumentedAgentState(page) {
  const state = await page.evaluate(() => {
    const read = () => {
      if (typeof window.agent_observe === "function") {
        return window.agent_observe();
      }
      if (typeof window.render_game_to_text === "function") {
        return window.render_game_to_text();
      }
      return null;
    };

    const raw = read();
    if (typeof raw !== "string") {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });

  if (!state || typeof state !== "object") {
    throw new Error("Documented agent state is unavailable");
  }

  return state;
}

export async function waitForDocumentedRuntimeReady(page, options = {}) {
  const {
    timeoutMs = DEFAULT_RUNTIME_READY_TIMEOUT_MS,
  } = options;

  await page.waitForFunction(() => {
    const read = () => {
      if (typeof window.agent_observe === "function") {
        return window.agent_observe();
      }
      if (typeof window.render_game_to_text === "function") {
        return window.render_game_to_text();
      }
      return null;
    };

    const raw = read();
    if (typeof raw !== "string") return false;

    try {
      const state = JSON.parse(raw);
      if (state.mode !== "runtime") return false;
      return state.runtimeReady === true || state.map?.loaded === true;
    } catch {
      return false;
    }
  }, { timeout: timeoutMs });

  return readDocumentedAgentState(page);
}

export async function gotoAgentRuntimeViaUi(page, options = {}) {
  const {
    baseUrl = DEFAULT_BASE_URL,
    agentName = DEFAULT_AGENT_NAME,
  } = options;

  await page.goto(new URL("/", parseBaseUrl(baseUrl)).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.getByTestId("agent-mode").click();
  await page.getByTestId("play").click();
  const agentNameInput = page.getByTestId("agent-name");
  await agentNameInput.fill(trimAgentName(agentName));
  await agentNameInput.press("Enter");

  return waitForDocumentedRuntimeReady(page);
}

export async function waitForRuntimeReady(page, options = {}) {
  const {
    timeoutMs = DEFAULT_RUNTIME_READY_TIMEOUT_MS,
    expectedShotId = null,
  } = options;

  await page.waitForFunction((shotId) => {
    if (typeof window.render_game_to_text !== "function") return false;

    try {
      const state = JSON.parse(window.render_game_to_text());
      if (state.mode !== "runtime" || state.map?.loaded !== true) return false;
      if (!shotId) return true;
      if (shotId === "compare") return state.shot?.active === true;
      return state.shot?.active === true && state.shot?.id === shotId;
    } catch {
      return false;
    }
  }, expectedShotId, { timeout: timeoutMs });

  return readRuntimeState(page);
}

export async function gotoAgentRuntime(page, options = {}) {
  const {
    baseUrl = DEFAULT_BASE_URL,
    mapId = DEFAULT_MAP_ID,
    agentName = DEFAULT_AGENT_NAME,
    spawn = "A",
    shot = null,
    extraSearchParams = {},
  } = options;

  await page.goto(
    buildRuntimeUrl(baseUrl, {
      mapId,
      autostart: "agent",
      agentName,
      spawn,
      shot,
      extraSearchParams,
    }),
    { waitUntil: "domcontentloaded" },
  );

  return waitForRuntimeReady(page, {
    expectedShotId: shot,
  });
}

export async function gotoHumanShot(page, options = {}) {
  const {
    baseUrl = DEFAULT_BASE_URL,
    mapId = DEFAULT_MAP_ID,
    shot = "compare",
    spawn = "A",
    extraSearchParams = {},
  } = options;

  await page.goto(
    buildRuntimeUrl(baseUrl, {
      mapId,
      autostart: "human",
      shot,
      spawn,
      extraSearchParams,
    }),
    { waitUntil: "domcontentloaded" },
  );

  return waitForRuntimeReady(page, {
    expectedShotId: shot,
  });
}

export async function advanceRuntime(page, stepMs) {
  const usedAdvanceTime = await page.evaluate(async (ms) => {
    if (typeof window.advanceTime !== "function") {
      return false;
    }

    await window.advanceTime(ms);
    return true;
  }, stepMs);

  if (!usedAdvanceTime) {
    await page.waitForTimeout(stepMs);
  }

  return usedAdvanceTime;
}

export async function captureRuntimeSnapshot(page, options) {
  const { imagePath, statePath } = options;
  await ensureDir(path.dirname(imagePath));
  await page.screenshot({ path: imagePath });
  const state = await readRuntimeState(page);
  if (statePath) {
    await writeJson(statePath, state);
  }
  return state;
}

export async function runAgentRoute(page, route, options = {}) {
  const tickMs = options.tickMs ?? DEFAULT_ROUTE_TICK_MS;
  const initialState = await readRuntimeState(page);
  const initialPos = initialState.player?.pos;
  if (!initialPos) {
    throw new Error(`Route '${route.id}' requires player.pos in runtime state`);
  }

  let finalState = initialState;
  let stationaryTicks = 0;
  let maxStationaryTicks = 0;
  let collisionTicksX = 0;
  let collisionTicksY = 0;
  let collisionTicksZ = 0;
  let usedAdvanceTime = false;
  const zonesVisited = new Set(initialState.player.zoneId ? [initialState.player.zoneId] : []);

  for (const segment of route.segments) {
    const tickCount = Math.max(1, Math.ceil(segment.durationMs / tickMs));

    for (let index = 0; index < tickCount; index += 1) {
      await page.evaluate((action) => {
        window.agent_apply_action?.(action);
      }, segment.action);

      const advanced = await advanceRuntime(page, tickMs);
      usedAdvanceTime = usedAdvanceTime || advanced;

      const nextState = await readRuntimeState(page);
      const prevPos = finalState.player?.pos ?? initialPos;
      const nextPos = nextState.player?.pos ?? prevPos;
      const movedDistanceM = Math.hypot(
        nextPos.x - prevPos.x,
        nextPos.y - prevPos.y,
        nextPos.z - prevPos.z,
      );
      const movingIntent = Math.hypot(segment.action.moveX ?? 0, segment.action.moveZ ?? 0) > 0.05;

      if (movingIntent && movedDistanceM < 0.02) {
        stationaryTicks += 1;
        maxStationaryTicks = Math.max(maxStationaryTicks, stationaryTicks);
      } else {
        stationaryTicks = 0;
      }

      if (nextState.player?.collision?.hitX) collisionTicksX += 1;
      if (nextState.player?.collision?.hitY) collisionTicksY += 1;
      if (nextState.player?.collision?.hitZ) collisionTicksZ += 1;
      if (nextState.player?.zoneId) zonesVisited.add(nextState.player.zoneId);

      finalState = nextState;

      if (nextState.gameplay?.alive === false) {
        break;
      }
    }

    if (finalState.gameplay?.alive === false) {
      break;
    }
  }

  const finalPos = finalState.player?.pos ?? initialPos;
  const distanceM = Math.hypot(
    finalPos.x - initialPos.x,
    finalPos.y - initialPos.y,
    finalPos.z - initialPos.z,
  );

  return {
    routeId: route.id,
    label: route.label,
    spawn: route.spawn,
    tickMs,
    usedAdvanceTime,
    initialPos,
    finalPos,
    distanceM,
    maxStationaryTicks,
    withinPlayableBounds: finalState.player?.withinPlayableBounds ?? true,
    endedAlive: finalState.gameplay?.alive !== false,
    collisionTicks: {
      x: collisionTicksX,
      y: collisionTicksY,
      z: collisionTicksZ,
    },
    zonesVisited: Array.from(zonesVisited).sort(),
    expectedMinDistanceM: route.expectedMinDistanceM,
    maxAllowedStationaryTicks: route.maxStationaryTicks,
  };
}

export async function loadShotsSpec(baseUrl, mapId = DEFAULT_MAP_ID) {
  const shotsUrl = new URL(`/maps/${mapId}/shots.json`, parseBaseUrl(baseUrl));
  const response = await fetch(shotsUrl);
  if (!response.ok) {
    throw new Error(`Failed to load shots spec (${response.status} ${response.statusText}) from ${shotsUrl}`);
  }
  return response.json();
}

export function selectReviewShotIds(shotsSpec, maxShots = DEFAULT_REVIEW_SHOT_COUNT) {
  const compareId = shotsSpec?.aliases?.compare ?? "SHOT_BLOCKOUT_COMPARE";
  const allShots = Array.isArray(shotsSpec?.shots) ? shotsSpec.shots : [];
  const selected = [];

  if (allShots.some((shot) => shot.id === compareId)) {
    selected.push(compareId);
  }

  const priorityOf = (shot) => {
    const tags = Array.isArray(shot?.tags) ? shot.tags : [];
    let score = 0;
    if (shot?.reviewPriority === "high") score += 120;
    if (shot?.reviewPriority === "medium") score += 60;
    if (tags.includes("facade")) score += 100;
    if (tags.includes("landmark")) score += 50;
    if (tags.includes("gameplay")) score += 40;
    if (tags.includes("canopy")) score += 20;
    if (tags.includes("overview") || /TOPDOWN/i.test(shot?.id ?? "")) score -= 120;
    return score;
  };

  const prioritized = allShots
    .filter((shot) => shot.id !== compareId)
    .map((shot, index) => ({ shot, index, priority: priorityOf(shot) }))
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.index - b.index;
    });

  for (const entry of prioritized) {
    if (selected.includes(entry.shot.id)) continue;
    selected.push(entry.shot.id);
    if (selected.length >= maxShots) break;
  }

  return selected;
}

export async function captureShotSet(page, options) {
  const {
    baseUrl = DEFAULT_BASE_URL,
    mapId = DEFAULT_MAP_ID,
    outputDir,
    shotIds,
    consoleRecorder,
    extraSearchParams = {},
  } = options;

  const captures = [];
  await ensureDir(outputDir);

  for (let index = 0; index < shotIds.length; index += 1) {
    const shotId = shotIds[index];
    consoleRecorder?.clear();
    await gotoHumanShot(page, {
      baseUrl,
      mapId,
      shot: shotId,
      extraSearchParams,
    });

    const fileBase = `${String(index + 1).padStart(2, "0")}-${sanitizeFileSegment(shotId)}`;
    const imagePath = path.join(outputDir, `${fileBase}.png`);
    const statePath = path.join(outputDir, `${fileBase}.state.json`);
    const consolePath = path.join(outputDir, `${fileBase}.console.json`);
    const state = await captureRuntimeSnapshot(page, { imagePath, statePath });
    await writeJson(consolePath, {
      events: consoleRecorder?.snapshot() ?? [],
      counts: consoleRecorder?.counts() ?? { errorCount: 0, warningCount: 0, total: 0 },
    });

    captures.push({
      shotId,
      imagePath,
      statePath,
      consolePath,
      state,
    });
  }

  return captures;
}
