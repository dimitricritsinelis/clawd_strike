import {
  PUBLIC_AGENT_CANONICAL_HOST,
  advance,
  applyAction,
  ensureFreshRun,
  gotoAgentRuntimeViaUrl,
  launchBrowser,
  readState,
} from "../src/index.mjs";
import { aggregateBatchMetrics } from "../src/learn/optimizer.mjs";
import { createAdaptiveSweeperPolicy, DEFAULT_ADAPTIVE_SWEEPER_PARAMETERS } from "../src/policies/adaptive-sweeper.mjs";

const BASE_URL = new URL(process.env.BASE_URL ?? PUBLIC_AGENT_CANONICAL_HOST).toString();
const HEADLESS = process.env.HEADLESS !== "false";
const COMPLETED_EPISODES = Math.max(1, Number(process.env.COMPLETED_EPISODES ?? 5));
const MAX_STEPS_PER_EPISODE = Math.max(1, Number(process.env.MAX_STEPS_PER_EPISODE ?? 900));
const STEP_MS = Math.max(100, Number(process.env.STEP_MS ?? 500));

async function playEpisode(page, controller, initialState) {
  let state = initialState;
  const startingBest = state.score?.best ?? 0;
  const startedAt = new Date().toISOString();

  for (let step = 0; step < MAX_STEPS_PER_EPISODE; step += 1) {
    state = step === 0 ? state : await readState(page);
    const dead = state.gameplay?.alive === false || state.gameplay?.gameOverVisible === true;
    if (dead) {
      return {
        completed: true,
        startedAt,
        finishedAt: new Date().toISOString(),
        episodeId: state.feedback?.episodeId ?? null,
        finalScore: state.lastRunSummary?.finalScore ?? state.score?.lastRun ?? 0,
        kills: state.lastRunSummary?.kills ?? 0,
        survivalTimeS: state.lastRunSummary?.survivalTimeS ?? 0,
        accuracy: state.lastRunSummary?.accuracy ?? 0,
        shotsFired: state.lastRunSummary?.shotsFired ?? 0,
        shotsHit: state.lastRunSummary?.shotsHit ?? 0,
        improvedBest: (state.score?.best ?? 0) > startingBest,
      };
    }

    const action = controller.nextAction(state);
    await applyAction(page, action);
    await advance(page, STEP_MS);
  }

  return {
    completed: false,
    startedAt,
    finishedAt: new Date().toISOString(),
    episodeId: state.feedback?.episodeId ?? null,
    finalScore: state.score?.current ?? 0,
    kills: state.lastRunSummary?.kills ?? 0,
    survivalTimeS: state.lastRunSummary?.survivalTimeS ?? 0,
    accuracy: state.lastRunSummary?.accuracy ?? 0,
    shotsFired: state.lastRunSummary?.shotsFired ?? 0,
    shotsHit: state.lastRunSummary?.shotsHit ?? 0,
    improvedBest: (state.score?.best ?? 0) > startingBest,
    timedOut: true,
  };
}

const { browser, context, page } = await launchBrowser({ headless: HEADLESS });

try {
  const controller = createAdaptiveSweeperPolicy({
    policyId: "adaptive-sweeper-baseline",
    parameters: DEFAULT_ADAPTIVE_SWEEPER_PARAMETERS,
  });
  const episodes = [];
  let state = await gotoAgentRuntimeViaUrl(page, { baseUrl: BASE_URL, agentName: "BaselineLoop" });

  while (episodes.filter((episode) => episode.completed !== false).length < COMPLETED_EPISODES) {
    controller.reset();
    const episode = await playEpisode(page, controller, state);
    episodes.push(episode);
    if (episodes.filter((entry) => entry.completed !== false).length >= COMPLETED_EPISODES) {
      break;
    }
    state = episode.completed !== false
      ? await ensureFreshRun(page)
      : await gotoAgentRuntimeViaUrl(page, { baseUrl: BASE_URL, agentName: "BaselineLoop" });
  }

  console.log(JSON.stringify({
    policyId: controller.policyId,
    parameters: controller.parameters,
    metrics: aggregateBatchMetrics(episodes),
    episodes,
  }, null, 2));
} finally {
  await context.close();
  if (browser) {
    await browser.close();
  }
}
