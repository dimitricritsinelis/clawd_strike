import path from "node:path";
import {
  DEFAULT_BASE_URL,
  attachConsoleRecorder,
  buildRuntimeUrl,
  ensureDir,
  launchBrowser,
  parseBaseUrl,
  parseBooleanEnv,
  waitForRuntimeReady,
  advanceRuntime,
  writeJson,
} from "./lib/runtimePlaywright.mjs";

function timestampId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function roundMetric(value) {
  return Math.round(value * 1000) / 1000;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function stepFrames(page, count, stepMs) {
  for (let index = 0; index < count; index += 1) {
    await advanceRuntime(page, stepMs);
  }
}

async function waitFor(page, predicate, message, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const stepMs = options.stepMs ?? 1000 / 60;
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const state = await readAmmoWaveState(page);
    if (predicate(state)) return state;
    await advanceRuntime(page, stepMs);
  }

  throw new Error(message);
}

async function applyAction(page, action) {
  await page.evaluate((nextAction) => {
    window.agent_apply_action?.(nextAction);
  }, action);
}

async function readAmmoWaveState(page) {
  const state = await page.evaluate(() => {
    const readJson = (reader) => {
      if (typeof reader !== "function") return null;
      try {
        const raw = reader();
        return typeof raw === "string" ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    };

    const runtimeState = readJson(window.render_game_to_text);
    const publicState = readJson(window.agent_observe);
    if (!runtimeState || typeof runtimeState !== "object") {
      return null;
    }

    return {
      ...runtimeState,
      ammo: publicState?.ammo ?? null,
      health: publicState?.health ?? null,
      gameplay: {
        ...(runtimeState.gameplay ?? {}),
        alive: publicState?.gameplay?.alive ?? runtimeState.gameplay?.alive ?? false,
        gameOverVisible: publicState?.gameplay?.gameOverVisible ?? false,
      },
      runtimeReady: publicState?.runtimeReady ?? runtimeState.runtimeReady ?? false,
    };
  });

  if (!state || typeof state !== "object") {
    throw new Error("Merged ammo/wave runtime state is unavailable");
  }

  return state;
}

function buildDamageProbePoses(state) {
  const enemies = state?.bots?.enemies ?? [];
  const poses = [];

  for (const enemy of enemies.slice(0, 4)) {
    poses.push({ x: enemy.position.x, y: 0.0001, z: enemy.position.z - 3.2, yawDeg: 0 });
    poses.push({ x: enemy.position.x, y: 0.0001, z: enemy.position.z + 3.2, yawDeg: 180 });
    poses.push({ x: enemy.position.x - 3.2, y: 0.0001, z: enemy.position.z, yawDeg: 90 });
    poses.push({ x: enemy.position.x + 3.2, y: 0.0001, z: enemy.position.z, yawDeg: -90 });
  }

  return poses;
}

async function takeDamageBeforeWaveReset(page, initialState) {
  const poses = buildDamageProbePoses(initialState);
  assert(poses.length > 0, "Expected debug enemy data to build damage probe poses");

  for (const pose of poses) {
    await page.evaluate((payload) => {
      window.__debug_reset_bot_knowledge?.();
      window.__debug_set_player_pose?.(payload);
    }, pose);
    await stepFrames(page, 2, FRAME_STEP_MS);

    try {
      const damagedState = await waitFor(
        page,
        (state) => (state.health ?? 100) < 100 || state.gameplay?.alive === false,
        "Timed out waiting for the player to take damage",
        { timeoutMs: 2_500, stepMs: 100 },
      );
      assert(damagedState.gameplay?.alive !== false, "Damage probe killed the player before wave reset");
      if ((damagedState.health ?? 100) < 100) {
        return damagedState;
      }
    } catch {
      // Try the next probe pose.
    }
  }

  throw new Error("Unable to get the player damaged before the wave reset");
}

const BASE_URL = parseBaseUrl(process.env.BASE_URL ?? DEFAULT_BASE_URL);
const HEADLESS = parseBooleanEnv(process.env.HEADLESS, true);
const OUTPUT_DIR = path.resolve(
  process.cwd(),
  process.env.OUTPUT_DIR ?? `../../artifacts/playwright/wave-ammo-reset/${timestampId()}`,
);
const FRAME_STEP_MS = 1000 / 60;
const FAST_RELOAD_ASSERTION_WINDOW_S = 1.35;

await ensureDir(OUTPUT_DIR);

const { browser, context, page } = await launchBrowser({ headless: HEADLESS });
const consoleRecorder = attachConsoleRecorder(page);

const summary = {
  baseUrl: BASE_URL,
  headless: HEADLESS,
  outputDir: OUTPUT_DIR,
  startedAt: new Date().toISOString(),
  checkpoints: {},
};

try {
  await page.goto(
    buildRuntimeUrl(BASE_URL, {
      autostart: "agent",
      agentName: "AmmoSmoke",
      extraSearchParams: {
        debug: 1,
      },
    }),
    { waitUntil: "domcontentloaded" },
  );
  await waitForRuntimeReady(page);
  const initialState = await readAmmoWaveState(page);
  await page.screenshot({ path: path.join(OUTPUT_DIR, "runtime-start.png") });

  const initialAmmo = initialState.ammo;
  const initialWaveNumber = initialState.bots?.waveNumber ?? 0;
  assert(initialAmmo?.mag === 30, `Expected initial magazine to be 30, got ${initialAmmo?.mag ?? "n/a"}`);
  assert(initialAmmo?.reserve === 120, `Expected initial reserve to be 120, got ${initialAmmo?.reserve ?? "n/a"}`);

  await applyAction(page, { fire: true });
  const spentAmmoState = await waitFor(
    page,
    (state) => (state.ammo?.mag ?? 30) <= 24,
    "Timed out waiting for ammo to drop below the initial magazine",
  );
  await applyAction(page, { fire: false });
  await stepFrames(page, 2, FRAME_STEP_MS);

  assert((spentAmmoState.ammo?.mag ?? 30) < 30, `Expected spent mag < 30, got ${spentAmmoState.ammo?.mag ?? "n/a"}`);

  await applyAction(page, { reload: true, fire: false });
  const reloadStartedState = await waitFor(
    page,
    (state) => state.ammo?.reloading === true,
    "Timed out waiting for reload to start",
  );
  await stepFrames(page, Math.ceil(FAST_RELOAD_ASSERTION_WINDOW_S / (FRAME_STEP_MS / 1000)), FRAME_STEP_MS);
  const reloadCompletedState = await readAmmoWaveState(page);
  assert(
    reloadCompletedState.ammo?.reloading === false &&
      (reloadCompletedState.ammo?.reserve ?? 120) < 120 &&
      reloadCompletedState.ammo?.mag === 30,
    `Expected reload to finish within ${FAST_RELOAD_ASSERTION_WINDOW_S}s, got ` +
      `${reloadCompletedState.ammo?.mag ?? "n/a"}/${reloadCompletedState.ammo?.reserve ?? "n/a"} ` +
      `reloading=${reloadCompletedState.ammo?.reloading ?? "n/a"}`,
  );

  await applyAction(page, { fire: true });
  const secondSpendState = await waitFor(
    page,
    (state) => (state.ammo?.mag ?? 30) <= 27,
    "Timed out waiting for second ammo spend",
  );
  await applyAction(page, { fire: false });
  await stepFrames(page, 2, FRAME_STEP_MS);

  await applyAction(page, { reload: true, fire: false });
  const partialReloadState = await waitFor(
    page,
    (state) => state.ammo?.reloading === true,
    "Timed out waiting for partial reload to start",
  );
  await stepFrames(page, 20, FRAME_STEP_MS);
  const duringReloadState = await readAmmoWaveState(page);
  assert(duringReloadState.ammo?.reloading === true, "Expected reload to still be active before the wave reset");

  const damagedState = await takeDamageBeforeWaveReset(page, initialState);
  assert((damagedState.health ?? 100) < 100, `Expected player health to drop below 100, got ${damagedState.health ?? "n/a"}`);

  const eliminatedBots = await page.evaluate(() => window.__debug_eliminate_all_bots?.() ?? 0);
  assert(eliminatedBots > 0, `Expected debug bot clear to eliminate enemies, got ${eliminatedBots}`);

  const nextWaveState = await waitFor(
    page,
    (state) => (state.bots?.waveNumber ?? 0) > initialWaveNumber,
    "Timed out waiting for the next wave to spawn",
    { timeoutMs: 12_000, stepMs: 100 },
  );
  await page.screenshot({ path: path.join(OUTPUT_DIR, "next-wave-ammo-reset.png") });

  assert(nextWaveState.ammo?.mag === 30, `Expected new-wave mag to reset to 30, got ${nextWaveState.ammo?.mag ?? "n/a"}`);
  assert(nextWaveState.ammo?.reserve === 120, `Expected new-wave reserve to reset to 120, got ${nextWaveState.ammo?.reserve ?? "n/a"}`);
  assert(nextWaveState.ammo?.reloading === false, "Expected new-wave ammo to cancel any active reload");
  assert(nextWaveState.health === 100, `Expected new-wave health to reset to 100, got ${nextWaveState.health ?? "n/a"}`);

  if (consoleRecorder.counts().errorCount > 0) {
    throw new Error(`Console/page errors observed: ${consoleRecorder.counts().errorCount}`);
  }

  summary.finishedAt = new Date().toISOString();
  summary.checkpoints = {
    initial: {
      waveNumber: initialWaveNumber,
      ammo: initialAmmo,
    },
    spentAmmo: {
      waveNumber: spentAmmoState.bots?.waveNumber ?? null,
      ammo: spentAmmoState.ammo ?? null,
    },
    reloadStarted: {
      ammo: reloadStartedState.ammo ?? null,
    },
    reloadCompleted: {
      ammo: reloadCompletedState.ammo ?? null,
    },
    secondSpend: {
      ammo: secondSpendState.ammo ?? null,
    },
    partialReload: {
      ammo: partialReloadState.ammo ?? null,
      duringReloadAmmo: duringReloadState.ammo ?? null,
    },
    damaged: {
      health: damagedState.health ?? null,
      alive: damagedState.gameplay?.alive ?? null,
    },
    nextWave: {
      waveNumber: nextWaveState.bots?.waveNumber ?? null,
      ammo: nextWaveState.ammo ?? null,
      health: nextWaveState.health ?? null,
      countdown: roundMetric(nextWaveState.bots?.waveElapsedS ?? 0),
    },
  };

  await writeJson(path.join(OUTPUT_DIR, "summary.json"), summary);
  await writeJson(path.join(OUTPUT_DIR, "console.json"), {
    events: consoleRecorder.snapshot(),
    counts: consoleRecorder.counts(),
  });
  console.log(
    `[wave-ammo-reset] pass | wave=${summary.checkpoints.nextWave.waveNumber} | ` +
      `ammo=${summary.checkpoints.nextWave.ammo.mag}/${summary.checkpoints.nextWave.ammo.reserve} | output=${OUTPUT_DIR}`,
  );
} catch (error) {
  summary.finishedAt = new Date().toISOString();
  summary.failed = true;
  summary.failure = error instanceof Error ? error.message : String(error);
  await writeJson(path.join(OUTPUT_DIR, "summary.json"), summary);
  await writeJson(path.join(OUTPUT_DIR, "console.json"), {
    events: consoleRecorder.snapshot(),
    counts: consoleRecorder.counts(),
  });
  throw error;
} finally {
  await context.close();
  await browser.close();
}
