import { chromium } from "playwright";

const DEFAULT_BASE_URL = "http://127.0.0.1:5174";
const DEFAULT_AGENT_NAME = "SmokeRunner";
const RUNTIME_READY_TIMEOUT_MS = 20_000;
const RUN_DURATION_MS = 10_000;
const ACTION_INTERVAL_MS = 100;
const MIN_MOVED_DISTANCE_M = 0.1;

function fail(message) {
  throw new Error(`[smoke:agent] ${message}`);
}

function parseBaseUrl(value) {
  try {
    return new URL(value).toString();
  } catch {
    fail(`BASE_URL is invalid: '${value}'`);
  }
}

function asFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${label} must be a finite number`);
  }
  return value;
}

function readCameraAndScore(state, label) {
  if (!state || typeof state !== "object") {
    fail(`${label} state is missing`);
  }

  const camera = state.view?.camera?.pos;
  if (!camera || typeof camera !== "object") {
    fail(`${label} missing view.camera.pos`);
  }

  return {
    camera: {
      x: asFiniteNumber(camera.x, `${label}.view.camera.pos.x`),
      y: asFiniteNumber(camera.y, `${label}.view.camera.pos.y`),
      z: asFiniteNumber(camera.z, `${label}.view.camera.pos.z`),
    },
    scoreCurrent: asFiniteNumber(state.score?.current, `${label}.score.current`),
  };
}

async function readState(page) {
  return page.evaluate(() => {
    if (typeof window.render_game_to_text !== "function") {
      return null;
    }
    try {
      return JSON.parse(window.render_game_to_text());
    } catch {
      return null;
    }
  });
}

const BASE_URL = parseBaseUrl(process.env.BASE_URL ?? DEFAULT_BASE_URL);
const AGENT_NAME = (process.env.AGENT_NAME ?? DEFAULT_AGENT_NAME).trim().slice(0, 15);

if (AGENT_NAME.length === 0) {
  fail("AGENT_NAME must be non-empty after trimming");
}

const browser = await chromium.launch({
  channel: "chrome",
  headless: false,
});

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  console.log(`[smoke:agent] opening ${BASE_URL}`);
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.getByTestId("agent-mode").click();
  await page.getByTestId("play").click();
  const agentNameInput = page.getByTestId("agent-name");
  await agentNameInput.fill(AGENT_NAME);
  await agentNameInput.press("Enter");

  await page.waitForFunction(() => {
    if (typeof window.render_game_to_text !== "function") return false;
    try {
      const s = JSON.parse(window.render_game_to_text());
      return s.mode === "runtime" && s.map?.loaded === true;
    } catch {
      return false;
    }
  }, { timeout: RUNTIME_READY_TIMEOUT_MS });

  const initialState = await readState(page);
  const initial = readCameraAndScore(initialState, "initial");
  const runStarted = Date.now();
  let tick = 0;

  while (Date.now() - runStarted < RUN_DURATION_MS) {
    const lookYawDelta = tick % 2 === 0 ? 0.5 : -0.3;
    const lookPitchDelta = tick % 5 === 0 ? 0.04 : 0;
    const fire = tick % 6 === 0;
    const sampledState = await page.evaluate(({ lookYawDelta, lookPitchDelta, fire }) => {
      window.agent_apply_action?.({
        moveZ: 1,
        sprint: true,
        lookYawDelta,
        lookPitchDelta,
        fire,
      });
      return JSON.parse(window.render_game_to_text());
    }, { lookYawDelta, lookPitchDelta, fire });

    readCameraAndScore(sampledState, `tick-${tick}`);
    tick += 1;
    await page.waitForTimeout(ACTION_INTERVAL_MS);
  }

  const finalState = await readState(page);
  const final = readCameraAndScore(finalState, "final");
  const movedDistanceM = Math.hypot(
    final.camera.x - initial.camera.x,
    final.camera.y - initial.camera.y,
    final.camera.z - initial.camera.z,
  );

  if (movedDistanceM < MIN_MOVED_DISTANCE_M) {
    fail(
      `camera moved only ${movedDistanceM.toFixed(3)}m (expected >= ${MIN_MOVED_DISTANCE_M.toFixed(3)}m)`,
    );
  }

  console.log(
    `[smoke:agent] pass | name=${AGENT_NAME} | moved=${movedDistanceM.toFixed(3)}m | score.current=${final.scoreCurrent}`,
  );

  await context.close();
} finally {
  await browser.close();
}
