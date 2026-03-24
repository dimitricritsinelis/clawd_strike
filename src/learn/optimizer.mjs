import {
  DEFAULT_ADAPTIVE_SWEEPER_POLICY,
  normalizeAdaptiveSweeperPolicy
} from "../policies/adaptive-sweeper.mjs";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createSeededRng(seed = Date.now()) {
  let state = Number(seed) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    const normalized = ((state >>> 0) % 1_000_000) / 1_000_000;
    return normalized;
  };
}

export function defaultPolicy() {
  return normalizeAdaptiveSweeperPolicy(DEFAULT_ADAPTIVE_SWEEPER_POLICY);
}

export function aggregateEpisodes(episodes) {
  const safeEpisodes = Array.isArray(episodes) ? episodes : [];
  const totalEpisodes = safeEpisodes.length;
  const totalKills = safeEpisodes.reduce((sum, episode) => sum + Number(episode.kills ?? 0), 0);
  const episodesWithKill = safeEpisodes.filter((episode) => Number(episode.kills ?? 0) > 0).length;
  const scores = safeEpisodes.map((episode) => Number(episode.finalScore ?? episode.lastRun ?? 0)).sort((a, b) => a - b);
  const survivals = safeEpisodes.map((episode) => Number(episode.survivalTimeS ?? 0));
  const accuracies = safeEpisodes
    .map((episode) => Number(episode.accuracy ?? 0))
    .filter((value) => Number.isFinite(value));
  const shotsFired = safeEpisodes.reduce((sum, episode) => sum + Number(episode.shotsFired ?? 0), 0);
  const shotsHit = safeEpisodes.reduce((sum, episode) => sum + Number(episode.shotsHit ?? 0), 0);

  const mean = (values) => values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
  const median = (values) => {
    if (values.length === 0) return 0;
    const middle = Math.floor(values.length / 2);
    if (values.length % 2 === 1) return values[middle];
    return (values[middle - 1] + values[middle]) / 2;
  };

  return {
    totalEpisodes,
    totalKills,
    episodesWithKill,
    episodesWithoutKill: totalEpisodes - episodesWithKill,
    firstKillEpisode: safeEpisodes.findIndex((episode) => Number(episode.kills ?? 0) > 0) + 1 || null,
    bestScore: scores.length === 0 ? 0 : scores[scores.length - 1],
    medianScore: median(scores),
    meanScore: mean(scores),
    meanSurvivalTimeS: mean(survivals),
    meanAccuracy: mean(accuracies),
    totalShotsFired: shotsFired,
    totalShotsHit: shotsHit,
    baselineMet: episodesWithKill >= 1 && totalEpisodes >= 5
  };
}

export function compareAggregates(candidate, champion, options = {}) {
  const minScoreDelta = Number(options.minScoreDelta ?? 0);

  const checks = [
    ["episodesWithKill", 1],
    ["totalKills", 1],
    ["bestScore", minScoreDelta],
    ["medianScore", minScoreDelta],
    ["meanScore", minScoreDelta],
    ["meanSurvivalTimeS", 0.5]
  ];

  for (const [key, minDelta] of checks) {
    const candidateValue = Number(candidate?.[key] ?? 0);
    const championValue = Number(champion?.[key] ?? 0);
    if (candidateValue > championValue + minDelta) {
      return { promote: true, reason: `candidate improved ${key}`, key, delta: candidateValue - championValue };
    }
    if (championValue > candidateValue + minDelta) {
      return { promote: false, reason: `candidate regressed ${key}`, key, delta: candidateValue - championValue };
    }
  }

  if (
    Number(candidate?.meanAccuracy ?? 0) > Number(champion?.meanAccuracy ?? 0) + 0.03
    && Number(candidate?.totalShotsFired ?? 0) >= Number(champion?.totalShotsFired ?? 0) * 0.7
  ) {
    return { promote: true, reason: "candidate improved meanAccuracy with comparable shot volume", key: "meanAccuracy", delta: Number(candidate.meanAccuracy) - Number(champion.meanAccuracy) };
  }

  return { promote: false, reason: "candidate did not beat champion on the comparison ladder", key: "tie", delta: 0 };
}

const PARAMETER_FAMILIES = Object.freeze({
  movement: [
    ["strafeMagnitude", 0.06],
    ["strafePeriodTicks", 6],
    ["pauseEveryTicks", 14],
    ["pauseDurationTicks", 2]
  ],
  sweep: [
    ["sweepAmplitudeDeg", 0.5],
    ["sweepPeriodTicks", 8]
  ],
  combat: [
    ["fireBurstLengthTicks", 2],
    ["fireBurstCooldownTicks", 2],
    ["reloadThreshold", 2],
    ["crouchEveryTicks", 20]
  ],
  panic: [
    ["panicTurnDeg", 2],
    ["panicTicks", 3],
    ["postScoreHoldTicks", 3]
  ]
});

function randomChoice(rng, values) {
  return values[Math.floor(rng() * values.length)];
}

function jitterNumber(current, magnitude, rng, min, max, integer = false) {
  const signed = (rng() * 2 - 1) * magnitude;
  const next = clamp(current + signed, min, max);
  return integer ? Math.round(next) : next;
}

export function mutatePolicy(policy, options = {}) {
  const rng = options.rng ?? Math.random;
  const targetMode = options.targetMode ?? "kill-bootstrap";
  const explorationScale = clamp(Number(options.explorationScale ?? 1), 0.25, 3);
  const base = normalizeAdaptiveSweeperPolicy(policy);
  const next = { ...base };

  const familyNames = targetMode === "kill-bootstrap"
    ? ["movement", "sweep", "combat", "panic"]
    : ["combat", "panic", "sweep", "movement"];

  const chosenFamily = randomChoice(rng, familyNames);
  const family = PARAMETER_FAMILIES[chosenFamily];
  const mutationCount = targetMode === "kill-bootstrap" ? 2 : 1;

  for (let index = 0; index < mutationCount; index += 1) {
    const [key, magnitude] = randomChoice(rng, family);
    const scaledMagnitude = magnitude * explorationScale;

    switch (key) {
      case "strafeMagnitude":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 0.05, 0.6, false);
        break;
      case "strafePeriodTicks":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 4, 60, true);
        break;
      case "pauseEveryTicks":
        next[key] = rng() < 0.25 && next[key] > 0
          ? 0
          : jitterNumber(next[key] || 18, scaledMagnitude, rng, 0, 120, true);
        break;
      case "pauseDurationTicks":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 0, 12, true);
        break;
      case "sweepAmplitudeDeg":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 0.2, 6, false);
        break;
      case "sweepPeriodTicks":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 4, 80, true);
        break;
      case "fireBurstLengthTicks":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 1, 12, true);
        break;
      case "fireBurstCooldownTicks":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 0, 20, true);
        break;
      case "reloadThreshold":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 0, 12, true);
        break;
      case "crouchEveryTicks":
        next[key] = rng() < 0.3 && next[key] > 0
          ? 0
          : jitterNumber(next[key] || 24, scaledMagnitude, rng, 0, 120, true);
        break;
      case "panicTurnDeg":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 1, 20, false);
        break;
      case "panicTicks":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 1, 24, true);
        break;
      case "postScoreHoldTicks":
        next[key] = jitterNumber(next[key], scaledMagnitude, rng, 0, 30, true);
        break;
      default:
        break;
    }
  }

  if (rng() < 0.15 * explorationScale) {
    next.reverseOnDamage = !next.reverseOnDamage;
  }

  return normalizeAdaptiveSweeperPolicy(next);
}

export function deriveSemanticNotes(previousPolicy, nextPolicy, previousAggregate, nextAggregate) {
  const notes = [];
  if (!previousPolicy || !nextPolicy) return notes;

  const push = (text) => {
    if (text) notes.push(text);
  };

  if (nextAggregate.episodesWithKill > previousAggregate.episodesWithKill) {
    push("Promoted policy improved first-kill reliability.");
  }
  if (nextAggregate.bestScore > previousAggregate.bestScore) {
    push("Promoted policy improved best score in the evaluation batch.");
  }
  if (nextPolicy.sweepPeriodTicks < previousPolicy.sweepPeriodTicks) {
    push("A shorter sweep period was part of the promoted candidate.");
  }
  if (nextPolicy.strafeMagnitude > previousPolicy.strafeMagnitude) {
    push("A wider strafe was part of the promoted candidate.");
  }
  if (nextPolicy.reloadThreshold < previousPolicy.reloadThreshold) {
    push("A later reload threshold was part of the promoted candidate.");
  }
  if (nextPolicy.panicTurnDeg > previousPolicy.panicTurnDeg) {
    push("A stronger panic turn was part of the promoted candidate.");
  }

  return notes;
}

export function upsertHallOfFame(hallOfFame, entry, options = {}) {
  const maxEntries = Number(options.maxEntries ?? 5);
  const next = [...(Array.isArray(hallOfFame) ? hallOfFame : []), entry];

  next.sort((left, right) => {
    const aggregateLeft = left.aggregate ?? {};
    const aggregateRight = right.aggregate ?? {};
    const decision = compareAggregates(aggregateLeft, aggregateRight, { minScoreDelta: 0 });
    if (decision.promote) return -1;
    const reverseDecision = compareAggregates(aggregateRight, aggregateLeft, { minScoreDelta: 0 });
    if (reverseDecision.promote) return 1;
    return 0;
  });

  return next.slice(0, maxEntries);
}

export function selectParentFromHallOfFame(hallOfFame, rng) {
  const entries = Array.isArray(hallOfFame) && hallOfFame.length > 0 ? hallOfFame : [];
  if (entries.length === 0) return null;
  const weighted = entries.flatMap((entry, index) => Array.from({ length: Math.max(1, entries.length - index) }, () => entry));
  return randomChoice(rng, weighted);
}
