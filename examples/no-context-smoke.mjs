import path from "node:path";
import {
  PUBLIC_AGENT_CANONICAL_HOST,
  advance,
  applyAction,
  attachConsoleRecorder,
  clickPlayAgainIfVisible,
  ensureDir,
  getAgentApiStatus,
  gotoAgentRuntime,
  launchBrowser,
  readState,
  waitForRespawn,
  writeJson
} from "../src/index.mjs";

function timestampId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

const BASE_URL = new URL(process.env.BASE_URL ?? PUBLIC_AGENT_CANONICAL_HOST).toString();
const HEADLESS = process.env.HEADLESS !== "false";
const REQUIRED_DEATHS = Math.max(1, Number(process.env.REQUIRED_DEATHS ?? 1));
const MAX_STEPS = Math.max(1, Number(process.env.MAX_STEPS ?? 120));
const STEP_MS = Math.max(100, Number(process.env.STEP_MS ?? 500));
const OUTPUT_DIR = path.resolve(process.cwd(), process.env.OUTPUT_DIR ?? `output/no-context-smoke/${timestampId()}`);

await ensureDir(OUTPUT_DIR);

const { browser, context, page } = await launchBrowser({ headless: HEADLESS });
const consoleRecorder = attachConsoleRecorder(page);

const summary = {
  baseUrl: BASE_URL,
  headless: HEADLESS,
  requiredDeaths: REQUIRED_DEATHS,
  maxSteps: MAX_STEPS,
  stepMs: STEP_MS,
  startedAt: new Date().toISOString(),
  runtime: {
    apiStatus: null,
    deathsObserved: 0,
    respawnsObserved: 0,
    cycles: []
  }
};

try {
  await gotoAgentRuntime(page, { baseUrl: BASE_URL, agentName: "StarterSmoke" });
  summary.runtime.apiStatus = await getAgentApiStatus(page);
  await page.screenshot({ path: path.join(OUTPUT_DIR, "runtime-start.png") });

  let previousAlive = true;

  for (let step = 0; step < MAX_STEPS && summary.runtime.deathsObserved < REQUIRED_DEATHS; step += 1) {
    const state = await readState(page);
    const alive = state.gameplay?.alive === true;
    const gameOverVisible = state.gameplay?.gameOverVisible === true;

    if (!alive || gameOverVisible) {
      const deathSummary = {
        deathIndex: summary.runtime.deathsObserved + 1,
        lastRun: state.score?.lastRun ?? null,
        best: state.score?.best ?? null,
        lastRunSummary: state.lastRunSummary ?? null
      };

      if (previousAlive) {
        summary.runtime.deathsObserved += 1;
        summary.runtime.cycles.push(deathSummary);
        await page.screenshot({
          path: path.join(OUTPUT_DIR, `death-${deathSummary.deathIndex}.png`)
        });
      }

      const clicked = await clickPlayAgainIfVisible(page);
      if (!clicked) {
        previousAlive = false;
        await advance(page, STEP_MS);
        continue;
      }

      const restartedState = await waitForRespawn(page);
      if ((restartedState.score?.current ?? null) !== 0) {
        throw new Error(`Restarted run score should reset to 0, got ${restartedState.score?.current ?? "n/a"}`);
      }

      summary.runtime.respawnsObserved += 1;
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `respawn-${summary.runtime.respawnsObserved}.png`)
      });
      previousAlive = true;
      continue;
    }

    previousAlive = alive;
    await applyAction(page, {
      moveX: step % 60 < 30 ? 0.25 : -0.2,
      moveZ: 1,
      lookYawDelta: step % 2 === 0 ? 1.35 : -0.7,
      fire: step % 10 === 0
    });
    await advance(page, STEP_MS);
  }

  if (summary.runtime.deathsObserved < REQUIRED_DEATHS) {
    throw new Error(`Observed ${summary.runtime.deathsObserved} deaths; expected ${REQUIRED_DEATHS}.`);
  }

  if (consoleRecorder.counts().errorCount > 0) {
    throw new Error(`Console/page errors observed: ${consoleRecorder.counts().errorCount}`);
  }

  summary.finishedAt = new Date().toISOString();
  await writeJson(path.join(OUTPUT_DIR, "summary.json"), summary);
  await writeJson(path.join(OUTPUT_DIR, "console.json"), {
    events: consoleRecorder.snapshot(),
    counts: consoleRecorder.counts()
  });

  console.log(`[smoke:no-context] pass | deaths=${summary.runtime.deathsObserved} | respawns=${summary.runtime.respawnsObserved} | output=${OUTPUT_DIR}`);
} catch (error) {
  summary.finishedAt = new Date().toISOString();
  summary.failed = true;
  summary.failure = error instanceof Error ? error.message : String(error);
  await writeJson(path.join(OUTPUT_DIR, "summary.json"), summary);
  await writeJson(path.join(OUTPUT_DIR, "console.json"), {
    events: consoleRecorder.snapshot(),
    counts: consoleRecorder.counts()
  });
  throw error;
} finally {
  await context.close();
  await browser.close();
}
