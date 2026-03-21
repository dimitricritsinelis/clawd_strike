import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import {
  PUBLIC_AGENT_CANONICAL_HOST,
  advance,
  applyAction,
  attachConsoleRecorder,
  ensureFreshRun,
  getAgentApiStatus,
  gotoAgentRuntimeViaUi,
  launchBrowser,
  readState,
} from "../src/index.mjs";

function timestampId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

const BASE_URL = new URL(process.env.BASE_URL ?? PUBLIC_AGENT_CANONICAL_HOST).toString();
const HEADLESS = process.env.HEADLESS !== "false";
const REQUIRED_DEATHS = Math.max(1, Number(process.env.REQUIRED_DEATHS ?? 2));
const MAX_STEPS = Math.max(1, Number(process.env.MAX_STEPS ?? 150));
const STEP_MS = Math.max(100, Number(process.env.STEP_MS ?? 500));
const OUTPUT_DIR = path.resolve(process.cwd(), process.env.OUTPUT_DIR ?? `output/no-context-smoke/${timestampId()}`);

await ensureDir(OUTPUT_DIR);

const { browser, context, page } = await launchBrowser({ headless: HEADLESS });
const consoleRecorder = attachConsoleRecorder(page);

function hasRequiredSkillsText(skillsText) {
  const normalized = skillsText.toLowerCase();
  return [
    "[data-testid=\"agent-mode\"]",
    "[data-testid=\"play\"]",
    "[data-testid=\"agent-name\"]",
    "[data-testid=\"play-again\"]",
    "agent_observe",
    "render_game_to_text",
    "contract mismatch",
  ].every((snippet) => normalized.includes(snippet.toLowerCase()));
}

const summary = {
  baseUrl: BASE_URL,
  headless: HEADLESS,
  requiredDeaths: REQUIRED_DEATHS,
  startedAt: new Date().toISOString(),
  skills: {
    verified: false,
  },
  runtime: {
    apiStatus: null,
    deathsObserved: 0,
    respawnsObserved: 0,
    cycles: [],
  },
};

try {
  await page.goto(new URL("/skills.md", BASE_URL).toString(), { waitUntil: "domcontentloaded", timeout: 90_000 });
  const skillsText = (await page.textContent("body")) ?? "";
  summary.skills.verified = hasRequiredSkillsText(skillsText);
  if (!summary.skills.verified) {
    throw new Error("skills.md is missing one or more required public-agent snippets");
  }

  await gotoAgentRuntimeViaUi(page, { baseUrl: BASE_URL, agentName: "SdkSmoke" });
  summary.runtime.apiStatus = await getAgentApiStatus(page);
  await page.screenshot({ path: path.join(OUTPUT_DIR, "runtime-start.png") });

  let previousAlive = true;

  for (let step = 0; step < MAX_STEPS && summary.runtime.deathsObserved < REQUIRED_DEATHS; step += 1) {
    const state = await readState(page);
    const dead = state.gameplay?.alive === false || state.gameplay?.gameOverVisible === true;

    if (dead) {
      if (previousAlive) {
        summary.runtime.deathsObserved += 1;
        summary.runtime.cycles.push({
          deathIndex: summary.runtime.deathsObserved,
          lastRun: state.score?.lastRun ?? null,
          best: state.score?.best ?? null,
          lastRunSummary: state.lastRunSummary ?? null,
          feedback: state.feedback ?? null,
        });
        await page.screenshot({
          path: path.join(OUTPUT_DIR, `death-${summary.runtime.deathsObserved}.png`),
        });
      }

      const restartedState = await ensureFreshRun(page);
      if ((restartedState.score?.current ?? null) !== 0) {
        throw new Error(`Restarted run score should reset to 0, got ${restartedState.score?.current ?? "n/a"}`);
      }
      summary.runtime.respawnsObserved += 1;
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `respawn-${summary.runtime.respawnsObserved}.png`),
      });
      previousAlive = true;
      continue;
    }

    previousAlive = true;
    await applyAction(page, {
      moveX: step % 60 < 30 ? 0.25 : -0.2,
      moveZ: 1,
      lookYawDelta: step % 2 === 0 ? 1.35 : -0.7,
      fire: step % 10 === 0,
    });
    await advance(page, STEP_MS);
  }

  if (summary.runtime.deathsObserved < REQUIRED_DEATHS) {
    throw new Error(`Observed ${summary.runtime.deathsObserved} deaths; expected at least ${REQUIRED_DEATHS}`);
  }
  if (summary.runtime.respawnsObserved < REQUIRED_DEATHS) {
    throw new Error(`Observed ${summary.runtime.respawnsObserved} respawns; expected at least ${REQUIRED_DEATHS}`);
  }
  if ((summary.runtime.apiStatus?.agentApplyAction ?? false) !== true) {
    throw new Error("agent_apply_action is unavailable during runtime");
  }
  if ((summary.runtime.apiStatus?.advanceTime ?? false) !== true) {
    throw new Error("advanceTime is unavailable during runtime");
  }
  if ((summary.runtime.apiStatus?.agentObserve ?? false) !== true && (summary.runtime.apiStatus?.renderGameToText ?? false) !== true) {
    throw new Error("Neither agent_observe nor render_game_to_text is available during runtime");
  }
  if (consoleRecorder.counts().errorCount > 0) {
    throw new Error(`Console/page errors observed: ${consoleRecorder.counts().errorCount}`);
  }

  summary.finishedAt = new Date().toISOString();
  await writeJson(path.join(OUTPUT_DIR, "summary.json"), summary);
  await writeJson(path.join(OUTPUT_DIR, "console.json"), {
    events: consoleRecorder.snapshot(),
    counts: consoleRecorder.counts(),
  });
  console.log(`[smoke:no-context] pass | deaths=${summary.runtime.deathsObserved} | respawns=${summary.runtime.respawnsObserved} | output=${OUTPUT_DIR}`);
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
  if (browser) {
    await browser.close();
  }
}
