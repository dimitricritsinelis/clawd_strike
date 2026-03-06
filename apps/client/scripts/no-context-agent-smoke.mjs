import path from "node:path";
import {
  DEFAULT_AGENT_NAME,
  DEFAULT_BASE_URL,
  attachConsoleRecorder,
  ensureDir,
  getDocumentedAgentApiStatus,
  gotoAgentRuntimeViaUi,
  launchBrowser,
  parseBaseUrl,
  parseBooleanEnv,
  readDocumentedAgentState,
  sanitizeFileSegment,
  trimAgentName,
  writeJson,
} from "./lib/runtimePlaywright.mjs";

function timestampId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

const BASE_URL = parseBaseUrl(process.env.BASE_URL ?? DEFAULT_BASE_URL);
const SKILLS_URL = new URL(
  process.env.SKILLS_URL ?? "/skills.md",
  BASE_URL,
).toString();
const AGENT_NAME = trimAgentName(process.env.AGENT_NAME, DEFAULT_AGENT_NAME);
const HEADLESS = parseBooleanEnv(process.env.HEADLESS, true);
const REQUIRED_DEATHS = Math.max(1, Number(process.env.REQUIRED_DEATHS ?? 2));
const MAX_STEPS = Math.max(1, Number(process.env.MAX_STEPS ?? 120));
const STEP_MS = Math.max(100, Number(process.env.STEP_MS ?? 500));
const OUTPUT_DIR = path.resolve(
  process.cwd(),
  process.env.OUTPUT_DIR ?? `../../artifacts/playwright/no-context-agent-smoke/${timestampId()}`,
);

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

async function waitForRespawn(page) {
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
      return state.mode === "runtime"
        && state.runtimeReady === true
        && state.gameplay?.alive === true
        && state.gameplay?.gameOverVisible !== true;
    } catch {
      return false;
    }
  }, { timeout: 20_000 });
}

const summary = {
  baseUrl: BASE_URL,
  skillsUrl: SKILLS_URL,
  agentName: AGENT_NAME,
  headless: HEADLESS,
  requiredDeaths: REQUIRED_DEATHS,
  outputDir: OUTPUT_DIR,
  startedAt: new Date().toISOString(),
  skills: {
    requiredSnippetsPresent: false,
    title: null,
  },
  runtime: {
    apiStatus: null,
    deathsObserved: 0,
    respawnsObserved: 0,
    cycles: [],
  },
};

try {
  await page.goto(SKILLS_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
  const skillsText = (await page.textContent("body")) ?? "";
  summary.skills.requiredSnippetsPresent = hasRequiredSkillsText(skillsText);
  summary.skills.title = skillsText.split("\n")[0] ?? null;

  if (!summary.skills.requiredSnippetsPresent) {
    throw new Error("skills.md is missing one or more required no-context contract snippets");
  }

  await gotoAgentRuntimeViaUi(page, {
    baseUrl: BASE_URL,
    agentName: AGENT_NAME,
  });

  summary.runtime.apiStatus = await getDocumentedAgentApiStatus(page);
  await page.screenshot({ path: path.join(OUTPUT_DIR, "runtime-start.png") });

  let previousAlive = true;

  for (let step = 0; step < MAX_STEPS && summary.runtime.deathsObserved < REQUIRED_DEATHS; step += 1) {
    const state = await readDocumentedAgentState(page);
    const alive = state.gameplay?.alive === true;
    const gameOverVisible = state.gameplay?.gameOverVisible === true;

    if (!alive || gameOverVisible) {
      if (previousAlive) {
        summary.runtime.deathsObserved += 1;
        summary.runtime.cycles.push({
          deathIndex: summary.runtime.deathsObserved,
          lastRun: state.score?.lastRun ?? null,
          best: state.score?.best ?? null,
          lastRunSummary: state.lastRunSummary ?? null,
        });
        await page.screenshot({
          path: path.join(OUTPUT_DIR, `death-${sanitizeFileSegment(String(summary.runtime.deathsObserved))}.png`),
        });
      }

      const playAgainButton = page.getByTestId("play-again");
      if (await playAgainButton.isVisible().catch(() => false)) {
        await playAgainButton.click().catch(() => {});
      }

      await waitForRespawn(page);
      summary.runtime.respawnsObserved += 1;
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `respawn-${sanitizeFileSegment(String(summary.runtime.respawnsObserved))}.png`),
      });
      previousAlive = true;
      continue;
    }

    previousAlive = true;
    await page.evaluate(({ stepIndex }) => {
      const fire = stepIndex % 10 === 0;
      const moveX = stepIndex % 60 < 30 ? 0.25 : -0.2;
      const lookYawDelta = stepIndex % 2 === 0 ? 1.35 : -0.7;
      window.agent_apply_action?.({
        moveX,
        moveZ: 1,
        sprint: true,
        lookYawDelta,
        fire,
      });
    }, { stepIndex: step });

    if (typeof page.evaluate === "function") {
      const usedAdvance = await page.evaluate(async (ms) => {
        if (typeof window.advanceTime !== "function") return false;
        await window.advanceTime(ms);
        return true;
      }, STEP_MS);
      if (!usedAdvance) {
        await page.waitForTimeout(STEP_MS);
      }
    }
  }

  if (summary.runtime.deathsObserved < REQUIRED_DEATHS) {
    throw new Error(
      `Observed ${summary.runtime.deathsObserved} deaths; expected at least ${REQUIRED_DEATHS}`,
    );
  }
  if (summary.runtime.respawnsObserved < REQUIRED_DEATHS) {
    throw new Error(
      `Observed ${summary.runtime.respawnsObserved} respawns; expected at least ${REQUIRED_DEATHS}`,
    );
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
  await browser.close();
}
