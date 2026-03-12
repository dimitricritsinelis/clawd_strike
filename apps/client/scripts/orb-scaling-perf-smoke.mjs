import path from "node:path";
import {
  DEFAULT_BASE_URL,
  attachConsoleRecorder,
  buildRuntimeUrl,
  ensureDir,
  launchBrowser,
  parseBaseUrl,
  parseBooleanEnv,
  readRuntimeState,
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

function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function max(values) {
  return values.reduce((best, value) => Math.max(best, value), Number.NEGATIVE_INFINITY);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const BASE_URL = parseBaseUrl(process.env.BASE_URL ?? DEFAULT_BASE_URL);
const HEADLESS = parseBooleanEnv(process.env.HEADLESS, true);
const OUTPUT_DIR = path.resolve(
  process.cwd(),
  process.env.OUTPUT_DIR ?? `../../artifacts/playwright/orb-scaling-perf/${timestampId()}`,
);
const FRAME_STEP_MS = 1000 / 60;
const STEADY_FRAME_COUNT = Math.max(12, Number(process.env.STEADY_FRAME_COUNT ?? 45));
const RAMP_FRAME_COUNT = Math.max(6, Number(process.env.RAMP_FRAME_COUNT ?? 18));
const ZERO_ORB_MAX_MS = Math.max(0.1, Number(process.env.ZERO_ORB_MAX_MS ?? 16.7));
const ORB_DELTA_BUDGET_MS = Math.max(0.1, Number(process.env.ORB_DELTA_BUDGET_MS ?? 1.5));
const ORB_DELTA_BUDGET_DRAWS = Math.max(1, Number(process.env.ORB_DELTA_BUDGET_DRAWS ?? 24));
const SPAWN_SPIKE_DELTA_MS = Math.max(0.1, Number(process.env.SPAWN_SPIKE_DELTA_MS ?? 6));
const TEXTURE_GROWTH_BUDGET = Math.max(0, Number(process.env.TEXTURE_GROWTH_BUDGET ?? 0));
const ORB_COUNTS = [0, 1, 5, 10, 20];

await ensureDir(OUTPUT_DIR);

const { browser } = await launchBrowser({ headless: HEADLESS });

async function stepAndSample(page, label) {
  const startedAt = performance.now();
  await advanceRuntime(page, FRAME_STEP_MS);
  const durationMs = performance.now() - startedAt;
  const state = await readRuntimeState(page);
  return {
    label,
    durationMs: roundMetric(durationMs),
    msPerFrame: roundMetric(state.perf.msPerFrame),
    drawCalls: state.perf.drawCalls,
    triangles: state.perf.triangles,
    textures: state.perf.textures,
    orbCount: state.perf.orbCount,
    orbCapacity: state.perf.orbCapacity,
    orbSpawnMs: roundMetric(state.perf.orbSpawnMs),
    orbUpdateMs: roundMetric(state.perf.orbUpdateMs),
  };
}

async function sampleFrames(page, labelPrefix, count) {
  const frames = [];
  for (let index = 0; index < count; index += 1) {
    frames.push(await stepAndSample(page, `${labelPrefix}-${index}`));
  }
  return frames;
}

function summarizeFrames(frames) {
  return {
    count: frames.length,
    avgDurationMs: roundMetric(average(frames.map((frame) => frame.durationMs))),
    avgMsPerFrame: roundMetric(average(frames.map((frame) => frame.msPerFrame))),
    maxMsPerFrame: roundMetric(max(frames.map((frame) => frame.msPerFrame))),
    avgDrawCalls: roundMetric(average(frames.map((frame) => frame.drawCalls))),
    maxDrawCalls: max(frames.map((frame) => frame.drawCalls)),
    maxTextures: max(frames.map((frame) => frame.textures)),
    maxOrbSpawnMs: roundMetric(max(frames.map((frame) => frame.orbSpawnMs))),
    maxOrbUpdateMs: roundMetric(max(frames.map((frame) => frame.orbUpdateMs))),
    lastOrbCount: frames.at(-1)?.orbCount ?? 0,
    lastOrbCapacity: frames.at(-1)?.orbCapacity ?? 0,
  };
}

async function setOrbCount(page, count) {
  return page.evaluate((nextCount) => {
    if (typeof window.__debug_set_buff_orbs !== "function") {
      throw new Error("__debug_set_buff_orbs is unavailable");
    }
    return window.__debug_set_buff_orbs({ count: nextCount });
  }, count);
}

async function openScenarioRuntime() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const recorder = attachConsoleRecorder(page);

  await page.goto(
    buildRuntimeUrl(BASE_URL, {
      autostart: "human",
      agentName: "PerfProbe",
      extraSearchParams: {
        debug: 1,
        perf: 1,
        god: 1,
      },
    }),
    { waitUntil: "domcontentloaded" },
  );
  await waitForRuntimeReady(page);

  const readyState = await readRuntimeState(page);
  if (readyState.render.webgl !== true) {
    throw new Error("Orb scaling perf smoke requires WebGL");
  }

  await page.evaluate((pose) => {
    window.__debug_set_player_pose?.({ x: pose.x, y: pose.y, z: pose.z, yawDeg: 180 });
    window.__debug_suppress_bot_intel_ms?.(120000);
  }, readyState.player.pos);

  return { context, page, recorder };
}

async function runScenario(orbCount) {
  const { context, page, recorder } = await openScenarioRuntime();
  try {
    const cleared = await setOrbCount(page, 0);
    assert(cleared === 0, `Expected zero control orbs, received ${cleared}`);
    const controlFrames = await sampleFrames(page, `steady-0-${orbCount}`, STEADY_FRAME_COUNT);
    const control = summarizeFrames(controlFrames);

    if (orbCount === 0) {
      if (recorder.counts().errorCount > 0) {
        throw new Error(`Console/page errors observed: ${recorder.counts().errorCount}`);
      }
      return {
        orbCount,
        control,
        ramp: null,
        steady: control,
        deltaMsPerFrame: 0,
        deltaDrawCalls: 0,
        textureGrowth: 0,
      };
    }

    const applied = await setOrbCount(page, orbCount);
    assert(applied === orbCount, `Expected ${orbCount} orbs, received ${applied}`);
    const rampFrames = await sampleFrames(page, `ramp-${orbCount}`, RAMP_FRAME_COUNT);
    const steadyFrames = await sampleFrames(page, `steady-${orbCount}`, STEADY_FRAME_COUNT);
    const ramp = summarizeFrames(rampFrames);
    const steady = summarizeFrames(steadyFrames);

    if (orbCount === 20) {
      await page.screenshot({ path: path.join(OUTPUT_DIR, "orbs-20.png") });
    }

    if (recorder.counts().errorCount > 0) {
      throw new Error(`Console/page errors observed: ${recorder.counts().errorCount}`);
    }

    return {
      orbCount,
      control,
      ramp,
      steady,
      deltaMsPerFrame: roundMetric(steady.avgMsPerFrame - control.avgMsPerFrame),
      deltaDrawCalls: roundMetric(steady.avgDrawCalls - control.avgDrawCalls),
      textureGrowth: Math.max(0, steady.maxTextures - control.maxTextures),
      rampPreview: rampFrames.slice(0, 6),
      steadyPreview: steadyFrames.slice(0, 6),
    };
  } finally {
    await context.close();
  }
}

const summary = {
  baseUrl: BASE_URL,
  headless: HEADLESS,
  outputDir: OUTPUT_DIR,
  budgets: {
    zeroOrbMaxMs: ZERO_ORB_MAX_MS,
    orbDeltaBudgetMs: ORB_DELTA_BUDGET_MS,
    orbDeltaBudgetDraws: ORB_DELTA_BUDGET_DRAWS,
    spawnSpikeDeltaMs: SPAWN_SPIKE_DELTA_MS,
    textureGrowthBudget: TEXTURE_GROWTH_BUDGET,
  },
  startedAt: new Date().toISOString(),
  scenarios: [],
};

try {
  for (const orbCount of ORB_COUNTS) {
    const scenario = await runScenario(orbCount);
    summary.scenarios.push(scenario);

    assert(
      scenario.control.avgMsPerFrame <= ZERO_ORB_MAX_MS,
      `Zero-orb baseline exceeded budget: ${scenario.control.avgMsPerFrame}ms > ${ZERO_ORB_MAX_MS}ms`,
    );

    if (orbCount === 0) {
      continue;
    }

    assert(
      scenario.steady.lastOrbCount === orbCount,
      `Expected ${orbCount} steady-state orbs, received ${scenario.steady.lastOrbCount}`,
    );
    assert(
      scenario.deltaMsPerFrame <= ORB_DELTA_BUDGET_MS,
      `${orbCount} orbs exceeded steady-state budget: ${scenario.deltaMsPerFrame}ms > ${ORB_DELTA_BUDGET_MS}ms`,
    );
    assert(
      scenario.deltaDrawCalls <= ORB_DELTA_BUDGET_DRAWS,
      `${orbCount} orbs exceeded draw-call budget: ${scenario.deltaDrawCalls} > ${ORB_DELTA_BUDGET_DRAWS}`,
    );
    assert(
      scenario.ramp.maxMsPerFrame <= scenario.control.avgMsPerFrame + SPAWN_SPIKE_DELTA_MS,
      `${orbCount} orbs exceeded spawn spike budget: ${scenario.ramp.maxMsPerFrame}ms > ${roundMetric(scenario.control.avgMsPerFrame + SPAWN_SPIKE_DELTA_MS)}ms`,
    );
    assert(
      scenario.textureGrowth <= TEXTURE_GROWTH_BUDGET,
      `${orbCount} orbs increased textures by ${scenario.textureGrowth}, budget is ${TEXTURE_GROWTH_BUDGET}`,
    );
  }

  summary.finishedAt = new Date().toISOString();
  await writeJson(path.join(OUTPUT_DIR, "summary.json"), summary);
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  summary.failedAt = new Date().toISOString();
  summary.error = error instanceof Error ? error.message : String(error);
  await writeJson(path.join(OUTPUT_DIR, "summary.json"), summary);
  throw error;
} finally {
  await browser.close();
}
