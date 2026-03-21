import path from "node:path";
import {
  PUBLIC_AGENT_CANONICAL_HOST,
  advance,
  applyAction,
  attachConsoleRecorder,
  ensureFreshRun,
  gotoAgentRuntimeViaUrl,
  launchPersistentBrowser,
  readState,
} from "../src/index.mjs";
import {
  aggregateBatchMetrics,
  compareBatchMetrics,
  createCandidatePolicyRecord,
  meetsBootstrapGate,
  updateHallOfFame,
} from "../src/learn/optimizer.mjs";
import {
  appendEpisode,
  ensureDir,
  listCandidateSummaries,
  readJson,
  resolveStatePaths,
  writeCandidateSummary,
  writeChampionPolicy,
  writeHallOfFame,
  writeLatestSessionSummary,
  writeSemanticMemory,
} from "../src/learn/storage.mjs";
import { createAdaptiveSweeperPolicy, DEFAULT_ADAPTIVE_SWEEPER_PARAMETERS } from "../src/policies/adaptive-sweeper.mjs";

const BASE_URL = new URL(process.env.BASE_URL ?? PUBLIC_AGENT_CANONICAL_HOST).toString();
const HEADLESS = process.env.HEADLESS !== "false";
const STATE_ROOT = path.resolve(process.cwd(), process.env.STATE_ROOT ?? "output/self-improving-runner");
const BATCH_SIZE = Math.max(1, Number(process.env.BATCH_SIZE ?? 5));
const MAX_BATCHES = Math.max(0, Number(process.env.MAX_BATCHES ?? 0));
const MAX_STEPS_PER_EPISODE = Math.max(1, Number(process.env.MAX_STEPS_PER_EPISODE ?? 900));
const STEP_MS = Math.max(100, Number(process.env.STEP_MS ?? 500));
const AGENT_NAME = process.env.AGENT_NAME ?? "SelfImprover";
const BASE_SEED = process.env.SEED ?? "clawd-strike-agent-sdk";
const HALL_OF_FAME_SIZE = 5;
const paths = resolveStatePaths(STATE_ROOT);
const USER_DATA_DIR = path.resolve(process.cwd(), process.env.USER_DATA_DIR ?? paths.browserProfileDir);

function toIso() {
  return new Date().toISOString();
}

function cloneMetrics(metrics) {
  return JSON.parse(JSON.stringify(metrics));
}

function buildHallEntry(summary) {
  return {
    policyId: summary.policy.policyId,
    family: summary.policy.family,
    parameters: summary.policy.parameters,
    metrics: summary.metrics,
    bootstrapGatePassed: summary.bootstrapGatePassed,
    promotedAt: summary.promotedAt ?? null,
  };
}

function describeMutation(mutation) {
  if (typeof mutation.previousValue === "number" && typeof mutation.nextValue === "number") {
    const direction = mutation.nextValue > mutation.previousValue ? "larger" : "smaller";
    return `${direction} ${mutation.key}`;
  }
  return `${mutation.nextValue === true ? "enabled" : "disabled"} ${mutation.key}`;
}

function buildSemanticMemory(existingMemory, batchSummary, comparison) {
  const memory = existingMemory && typeof existingMemory === "object"
    ? existingMemory
    : { rules: [] };
  const previousRules = Array.isArray(memory.rules) ? memory.rules : [];
  const mutations = batchSummary.policy.mutationSummary ?? [];
  const rules = mutations.map((mutation, index) => ({
    id: `${batchSummary.policy.policyId}-${index + 1}`,
    rule: comparison.order > 0
      ? `${describeMutation(mutation)} improved ${comparison.decisiveMetric} during ${batchSummary.focus} tuning.`
      : `${describeMutation(mutation)} did not beat the champion on ${comparison.decisiveMetric} during ${batchSummary.focus} tuning.`,
    policyId: batchSummary.policy.policyId,
    decisiveMetric: comparison.decisiveMetric,
    promoted: comparison.order > 0,
    observedAt: toIso(),
  }));

  return {
    lastUpdatedAt: toIso(),
    rules: [...previousRules, ...rules].slice(-20),
  };
}

async function playCompletedEpisode(page, controller, initialState) {
  let state = initialState;
  const startingBest = state.score?.best ?? 0;
  const startedAt = toIso();

  for (let step = 0; step < MAX_STEPS_PER_EPISODE; step += 1) {
    state = step === 0 ? state : await readState(page);
    const dead = state.gameplay?.alive === false || state.gameplay?.gameOverVisible === true;
    if (dead) {
      return {
        completed: true,
        startedAt,
        finishedAt: toIso(),
        episodeId: state.feedback?.episodeId ?? null,
        finalScore: state.lastRunSummary?.finalScore ?? state.score?.lastRun ?? 0,
        kills: state.lastRunSummary?.kills ?? 0,
        survivalTimeS: state.lastRunSummary?.survivalTimeS ?? 0,
        accuracy: state.lastRunSummary?.accuracy ?? 0,
        shotsFired: state.lastRunSummary?.shotsFired ?? 0,
        shotsHit: state.lastRunSummary?.shotsHit ?? 0,
        improvedBest: (state.score?.best ?? 0) > startingBest,
        feedbackEvents: state.feedback?.recentEvents ?? [],
      };
    }

    const action = controller.nextAction(state);
    await applyAction(page, action);
    await advance(page, STEP_MS);
  }

  return {
    completed: false,
    startedAt,
    finishedAt: toIso(),
    episodeId: state.feedback?.episodeId ?? null,
    finalScore: state.score?.current ?? 0,
    kills: 0,
    survivalTimeS: 0,
    accuracy: 0,
    shotsFired: 0,
    shotsHit: 0,
    improvedBest: (state.score?.best ?? 0) > startingBest,
    feedbackEvents: state.feedback?.recentEvents ?? [],
    timedOut: true,
  };
}

async function evaluatePolicyBatch(page, policyRecord, options = {}) {
  const { batchSize = BATCH_SIZE } = options;
  const controller = createAdaptiveSweeperPolicy(policyRecord);
  const episodes = [];
  let completedEpisodes = 0;
  let state = await gotoAgentRuntimeViaUrl(page, { baseUrl: BASE_URL, agentName: AGENT_NAME });

  while (completedEpisodes < batchSize) {
    controller.reset();
    const episode = await playCompletedEpisode(page, controller, state);
    episodes.push({
      ...episode,
      policyId: policyRecord.policyId,
      generation: policyRecord.generation ?? 0,
      batchFocus: options.focus ?? "bootstrap",
    });
    if (episode.completed !== false) {
      completedEpisodes += 1;
    }
    if (completedEpisodes >= batchSize) {
      break;
    }
    state = episode.completed !== false
      ? await ensureFreshRun(page)
      : await gotoAgentRuntimeViaUrl(page, { baseUrl: BASE_URL, agentName: AGENT_NAME });
  }

  const metrics = aggregateBatchMetrics(episodes);
  return {
    focus: options.focus ?? "bootstrap",
    policy: {
      ...policyRecord,
      parameters: controller.parameters,
    },
    metrics,
    episodes,
    bootstrapGatePassed: meetsBootstrapGate(metrics, { batchSize }),
  };
}

const session = {
  baseUrl: BASE_URL,
  headless: HEADLESS,
  stateRoot: STATE_ROOT,
  userDataDir: USER_DATA_DIR,
  batchSize: BATCH_SIZE,
  startedAt: toIso(),
  batches: [],
};

await ensureDir(paths.rootDir);
await ensureDir(paths.candidateSummariesDir);
await ensureDir(USER_DATA_DIR);

const { browser, context, page } = await launchPersistentBrowser({
  userDataDir: USER_DATA_DIR,
  headless: HEADLESS,
});
const consoleRecorder = attachConsoleRecorder(page);

try {
  let championPolicy = await readJson(paths.championPolicyPath, null);
  let hallOfFame = await readJson(paths.hallOfFamePath, []);
  let semanticMemory = await readJson(paths.semanticMemoryPath, { rules: [] });
  await listCandidateSummaries(paths);

  if (!championPolicy) {
    const baselineSummary = await evaluatePolicyBatch(page, {
      family: "adaptive-sweeper",
      policyId: "adaptive-sweeper-baseline",
      generation: 0,
      parameters: DEFAULT_ADAPTIVE_SWEEPER_PARAMETERS,
      mutationSummary: [],
    }, { batchSize: BATCH_SIZE, focus: "bootstrap" });
    baselineSummary.promotedAt = toIso();
    baselineSummary.comparison = { order: 1, decisiveMetric: "no-champion" };
    await writeCandidateSummary(paths, baselineSummary.policy.policyId, baselineSummary);
    for (const episode of baselineSummary.episodes) {
      await appendEpisode(paths, episode);
    }
    championPolicy = {
      ...baselineSummary.policy,
      metrics: cloneMetrics(baselineSummary.metrics),
      bootstrapGatePassed: baselineSummary.bootstrapGatePassed,
      promotedAt: baselineSummary.promotedAt,
      promotionReason: "baseline batch established the first champion",
    };
    hallOfFame = updateHallOfFame(Array.isArray(hallOfFame) ? hallOfFame : [], buildHallEntry(baselineSummary), HALL_OF_FAME_SIZE);
    semanticMemory = buildSemanticMemory(semanticMemory, baselineSummary, { order: 1, decisiveMetric: "no-champion" });
    await writeChampionPolicy(paths, championPolicy);
    await writeHallOfFame(paths, hallOfFame);
    await writeSemanticMemory(paths, semanticMemory);
    session.batches.push({
      policyId: baselineSummary.policy.policyId,
      promoted: true,
      focus: "bootstrap",
      metrics: baselineSummary.metrics,
      reason: "no champion existed",
    });
  }

  let batchIndex = 0;
  while (MAX_BATCHES === 0 || batchIndex < MAX_BATCHES) {
    batchIndex += 1;
    const focus = championPolicy.bootstrapGatePassed ? "score" : "bootstrap";
    const candidatePolicy = createCandidatePolicyRecord({
      championPolicy,
      hallOfFame: Array.isArray(hallOfFame) ? hallOfFame : [],
      generation: Number(championPolicy.generation ?? 0) + batchIndex,
      seed: BASE_SEED,
      focus,
    });
    const candidateSummary = await evaluatePolicyBatch(page, candidatePolicy, { batchSize: BATCH_SIZE, focus });
    const comparison = compareBatchMetrics(candidateSummary.metrics, championPolicy.metrics);
    const promoted = comparison.order > 0;
    candidateSummary.comparison = comparison;
    candidateSummary.promoted = promoted;
    await writeCandidateSummary(paths, candidateSummary.policy.policyId, candidateSummary);
    for (const episode of candidateSummary.episodes) {
      await appendEpisode(paths, episode);
    }

    if (promoted) {
      const previousChampionEntry = {
        ...championPolicy,
        promotedAt: championPolicy.promotedAt ?? null,
      };
      const promotedAt = toIso();
      championPolicy = {
        ...candidateSummary.policy,
        metrics: cloneMetrics(candidateSummary.metrics),
        bootstrapGatePassed: candidateSummary.bootstrapGatePassed,
        promotedAt,
        promotionReason: `beat the prior champion on ${comparison.decisiveMetric}`,
      };
      hallOfFame = updateHallOfFame(
        updateHallOfFame(Array.isArray(hallOfFame) ? hallOfFame : [], previousChampionEntry, HALL_OF_FAME_SIZE),
        {
          ...buildHallEntry(candidateSummary),
          promotedAt,
        },
        HALL_OF_FAME_SIZE,
      );
      await writeChampionPolicy(paths, championPolicy);
      await writeHallOfFame(paths, hallOfFame);
    } else if (candidateSummary.metrics.killPositiveEpisodes > 0 || candidateSummary.metrics.bestScore > 0) {
      hallOfFame = updateHallOfFame(Array.isArray(hallOfFame) ? hallOfFame : [], buildHallEntry(candidateSummary), HALL_OF_FAME_SIZE);
      await writeHallOfFame(paths, hallOfFame);
    }

    semanticMemory = buildSemanticMemory(semanticMemory, candidateSummary, comparison);
    await writeSemanticMemory(paths, semanticMemory);

    session.batches.push({
      policyId: candidateSummary.policy.policyId,
      promoted,
      focus,
      decisiveMetric: comparison.decisiveMetric,
      metrics: candidateSummary.metrics,
    });

    await writeLatestSessionSummary(paths, {
      ...session,
      finishedAt: toIso(),
      championPolicyId: championPolicy.policyId,
      championMetrics: championPolicy.metrics,
      bootstrapGatePassed: championPolicy.bootstrapGatePassed,
      hallOfFameSize: Array.isArray(hallOfFame) ? hallOfFame.length : 0,
      consoleCounts: consoleRecorder.counts(),
    });

    if (consoleRecorder.counts().errorCount > 0) {
      throw new Error(`Console/page errors observed: ${consoleRecorder.counts().errorCount}`);
    }
  }

  session.finishedAt = toIso();
  session.championPolicyId = championPolicy.policyId;
  session.championMetrics = championPolicy.metrics;
  session.bootstrapGatePassed = championPolicy.bootstrapGatePassed;
  await writeLatestSessionSummary(paths, {
    ...session,
    consoleCounts: consoleRecorder.counts(),
  });

  console.log(JSON.stringify({
    stateRoot: paths.rootDir,
    userDataDir: USER_DATA_DIR,
    championPolicyId: championPolicy.policyId,
    championMetrics: championPolicy.metrics,
    bootstrapGatePassed: championPolicy.bootstrapGatePassed,
    batches: session.batches.length,
  }, null, 2));
} finally {
  await context.close();
  if (browser) {
    await browser.close();
  }
}
