import path from "node:path";
import {
  PUBLIC_AGENT_CANONICAL_HOST,
  advance,
  applyAction,
  attachConsoleRecorder,
  ensureFreshRun,
  gotoAgentRuntime,
  isDead,
  isRuntimeReady,
  launchPersistentBrowser,
  readState,
  waitForRespawn,
  writeJson
} from "../src/index.mjs";
import { createAdaptiveSweeperController, normalizeAdaptiveSweeperPolicy } from "../src/policies/adaptive-sweeper.mjs";
import {
  aggregateEpisodes,
  compareAggregates,
  createSeededRng,
  defaultPolicy,
  deriveSemanticNotes,
  mutatePolicy,
  selectParentFromHallOfFame,
  upsertHallOfFame
} from "../src/learn/optimizer.mjs";
import {
  ensureLearningLayout,
  loadLearningState,
  recordEpisode,
  writeCandidateSummary,
  writeChampion,
  writeHallOfFame,
  writeLatestSessionSummary,
  writeSemanticMemory
} from "../src/learn/storage.mjs";

const BASE_URL = new URL(process.env.BASE_URL ?? PUBLIC_AGENT_CANONICAL_HOST).toString();
const HEADLESS = process.env.HEADLESS !== "false";
const AGENT_NAME = process.env.AGENT_NAME ?? "LearnRunner";
const STEP_MS = Math.max(100, Number(process.env.STEP_MS ?? 250));
const MAX_STEPS_PER_EPISODE = Math.max(100, Number(process.env.MAX_STEPS_PER_EPISODE ?? 800));
const BASELINE_DEATHS = Math.max(1, Number(process.env.BASELINE_DEATHS ?? 5));
const CANDIDATE_DEATHS = Math.max(1, Number(process.env.CANDIDATE_DEATHS ?? 5));
const MAX_CANDIDATES = Math.max(1, Number(process.env.MAX_CANDIDATES ?? 50));
const STAGNATION_LIMIT = Math.max(1, Number(process.env.STAGNATION_LIMIT ?? 8));
const MIN_SCORE_DELTA = Number(process.env.MIN_SCORE_DELTA ?? 0);
const RNG_SEED = Number(process.env.RNG_SEED ?? Date.now());
const OUTPUT_DIR = path.resolve(process.cwd(), process.env.OUTPUT_DIR ?? "output/self-improving-runner");
const USER_DATA_DIR = path.resolve(process.cwd(), process.env.USER_DATA_DIR ?? ".agent-profile");

const layout = await ensureLearningLayout(OUTPUT_DIR);
const state = await loadLearningState(layout);
const rng = createSeededRng(RNG_SEED);

const { context, page } = await launchPersistentBrowser({
  headless: HEADLESS,
  userDataDir: USER_DATA_DIR
});
const consoleRecorder = attachConsoleRecorder(page);

let championEntry = state.champion ?? {
  id: 0,
  label: "seed",
  promotedAt: new Date().toISOString(),
  policy: defaultPolicy(),
  aggregate: null,
  episodes: []
};

let hallOfFame = Array.isArray(state.hallOfFame) ? state.hallOfFame : [];
hallOfFame = championEntry.aggregate ? upsertHallOfFame(hallOfFame, championEntry) : hallOfFame;

const semanticMemory = state.semanticMemory ?? { version: 1, notes: [] };

async function evaluatePolicy(policyEntry, targetDeaths) {
  await ensureFreshRun(page);

  const controller = createAdaptiveSweeperController(policyEntry.policy);
  controller.resetEpisode();

  const episodes = [];
  let stepCountThisEpisode = 0;
  let activeEpisodeIndex = 1;

  while (episodes.length < targetDeaths) {
    const observation = await readState(page);

    if (!isRuntimeReady(observation)) {
      await advance(page, STEP_MS);
      continue;
    }

    if (isDead(observation)) {
      const summary = observation.lastRunSummary ?? {};
      const episodeRecord = {
        candidateId: policyEntry.id,
        candidateLabel: policyEntry.label,
        recordedAt: new Date().toISOString(),
        episodeIndex: activeEpisodeIndex,
        finalScore: Number(summary.finalScore ?? observation.score?.lastRun ?? 0),
        bestScore: Number(summary.bestScore ?? observation.score?.best ?? 0),
        survivalTimeS: Number(summary.survivalTimeS ?? 0),
        kills: Number(summary.kills ?? 0),
        headshots: Number(summary.headshots ?? 0),
        shotsFired: Number(summary.shotsFired ?? 0),
        shotsHit: Number(summary.shotsHit ?? 0),
        accuracy: Number(summary.accuracy ?? 0),
        deathCause: summary.deathCause ?? "unknown",
        lastRun: observation.score?.lastRun ?? null
      };

      episodes.push(episodeRecord);
      await recordEpisode(layout, episodeRecord);

      const playAgainButton = page.locator('[data-testid="play-again"]');
      const visible = await playAgainButton.isVisible().catch(() => false);
      if (visible) {
        await playAgainButton.click().catch(() => {});
        await waitForRespawn(page);
      } else {
        await advance(page, STEP_MS);
      }

      controller.resetEpisode();
      stepCountThisEpisode = 0;
      activeEpisodeIndex += 1;
      continue;
    }

    const action = controller.nextAction(observation);
    await applyAction(page, action);
    await advance(page, STEP_MS);

    stepCountThisEpisode += 1;
    if (stepCountThisEpisode > MAX_STEPS_PER_EPISODE) {
      throw new Error(`Policy '${policyEntry.label}' exceeded MAX_STEPS_PER_EPISODE=${MAX_STEPS_PER_EPISODE} without dying. Increase the limit or inspect the runtime.`);
    }
  }

  const aggregate = aggregateEpisodes(episodes);
  return { episodes, aggregate };
}

try {
  await gotoAgentRuntime(page, { baseUrl: BASE_URL, agentName: AGENT_NAME });

  if (!championEntry.aggregate) {
    const seededPolicy = {
      ...championEntry,
      policy: normalizeAdaptiveSweeperPolicy(championEntry.policy)
    };
    const evaluation = await evaluatePolicy(seededPolicy, BASELINE_DEATHS);
    championEntry = {
      ...seededPolicy,
      aggregate: evaluation.aggregate,
      episodes: evaluation.episodes,
      promotedAt: new Date().toISOString()
    };
    hallOfFame = upsertHallOfFame(hallOfFame, championEntry);
    await writeChampion(layout, championEntry);
    await writeHallOfFame(layout, hallOfFame);
  }

  let stagnationCount = 0;
  const session = {
    startedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    agentName: AGENT_NAME,
    headless: HEADLESS,
    stepMs: STEP_MS,
    baselineDeaths: BASELINE_DEATHS,
    candidateDeaths: CANDIDATE_DEATHS,
    maxCandidates: MAX_CANDIDATES,
    userDataDir: USER_DATA_DIR,
    outputDir: OUTPUT_DIR,
    rngSeed: RNG_SEED,
    initialChampion: {
      id: championEntry.id,
      label: championEntry.label,
      aggregate: championEntry.aggregate
    },
    promotions: [],
    rejections: []
  };

  for (let candidateIndex = 1; candidateIndex <= MAX_CANDIDATES; candidateIndex += 1) {
    const targetMode = championEntry.aggregate?.episodesWithKill > 0 ? "score-optimization" : "kill-bootstrap";
    const explorationScale = 1 + (stagnationCount / Math.max(1, STAGNATION_LIMIT));
    const parentEntry = selectParentFromHallOfFame(hallOfFame, rng) ?? championEntry;
    const candidatePolicy = mutatePolicy(parentEntry.policy, {
      rng,
      targetMode,
      explorationScale
    });

    const candidateEntry = {
      id: candidateIndex,
      label: `candidate-${candidateIndex}`,
      parentId: parentEntry.id,
      policy: candidatePolicy,
      aggregate: null,
      episodes: null
    };

    const evaluation = await evaluatePolicy(candidateEntry, CANDIDATE_DEATHS);
    candidateEntry.aggregate = evaluation.aggregate;
    candidateEntry.episodes = evaluation.episodes;

    const comparison = compareAggregates(candidateEntry.aggregate, championEntry.aggregate, {
      minScoreDelta: MIN_SCORE_DELTA
    });

    const candidateSummary = {
      generatedAt: new Date().toISOString(),
      candidate: {
        id: candidateEntry.id,
        label: candidateEntry.label,
        parentId: candidateEntry.parentId,
        policy: candidateEntry.policy,
        aggregate: candidateEntry.aggregate
      },
      championAtEvaluationStart: {
        id: championEntry.id,
        label: championEntry.label,
        aggregate: championEntry.aggregate
      },
      decision: comparison
    };

    await writeCandidateSummary(layout, candidateIndex, candidateSummary);

    if (comparison.promote) {
      const semanticNotes = deriveSemanticNotes(
        championEntry.policy,
        candidateEntry.policy,
        championEntry.aggregate,
        candidateEntry.aggregate
      );

      championEntry = {
        ...candidateEntry,
        promotedAt: new Date().toISOString()
      };
      hallOfFame = upsertHallOfFame(hallOfFame, championEntry);
      session.promotions.push({
        candidateId: candidateEntry.id,
        reason: comparison.reason,
        aggregate: candidateEntry.aggregate
      });
      stagnationCount = 0;

      for (const note of semanticNotes) {
        semanticMemory.notes.push({
          createdAt: new Date().toISOString(),
          candidateId: candidateEntry.id,
          text: note
        });
      }

      await writeChampion(layout, championEntry);
      await writeHallOfFame(layout, hallOfFame);
      await writeSemanticMemory(layout, semanticMemory);
    } else {
      session.rejections.push({
        candidateId: candidateEntry.id,
        reason: comparison.reason,
        aggregate: candidateEntry.aggregate
      });
      stagnationCount += 1;
    }

    if (consoleRecorder.counts().errorCount > 0) {
      throw new Error(`Console/page errors observed: ${consoleRecorder.counts().errorCount}`);
    }
  }

  session.finishedAt = new Date().toISOString();
  session.finalChampion = {
    id: championEntry.id,
    label: championEntry.label,
    aggregate: championEntry.aggregate,
    policy: championEntry.policy
  };
  session.semanticNotes = semanticMemory.notes.slice(-12);
  session.baselineMet = Boolean(championEntry.aggregate?.episodesWithKill > 0);
  session.minimumTarget = "at least 1 kill within 5 completed attempts";

  await writeLatestSessionSummary(layout, session);

  console.log(JSON.stringify({
    championId: championEntry.id,
    championLabel: championEntry.label,
    aggregate: championEntry.aggregate,
    outputDir: OUTPUT_DIR,
    userDataDir: USER_DATA_DIR,
    baselineMet: session.baselineMet
  }, null, 2));
} finally {
  await context.close();
}
