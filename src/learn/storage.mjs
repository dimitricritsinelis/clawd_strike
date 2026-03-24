import path from "node:path";
import { ensureDir, appendJsonl, readJsonIfExists, writeJson } from "../index.mjs";

export async function ensureLearningLayout(outputDir) {
  await ensureDir(outputDir);
  await ensureDir(path.join(outputDir, "candidate-summaries"));
  return {
    outputDir,
    episodesPath: path.join(outputDir, "episodes.jsonl"),
    championPath: path.join(outputDir, "champion-policy.json"),
    semanticPath: path.join(outputDir, "semantic-memory.json"),
    hallOfFamePath: path.join(outputDir, "hall-of-fame.json"),
    latestSessionSummaryPath: path.join(outputDir, "latest-session-summary.json"),
    candidateDir: path.join(outputDir, "candidate-summaries")
  };
}

export async function loadLearningState(layout) {
  const champion = await readJsonIfExists(layout.championPath, null);
  const semanticMemory = await readJsonIfExists(layout.semanticPath, {
    version: 1,
    notes: []
  });
  const hallOfFame = await readJsonIfExists(layout.hallOfFamePath, []);
  return { champion, semanticMemory, hallOfFame };
}

export async function recordEpisode(layout, episode) {
  await appendJsonl(layout.episodesPath, episode);
}

export async function writeChampion(layout, champion) {
  await writeJson(layout.championPath, champion);
}

export async function writeSemanticMemory(layout, semanticMemory) {
  await writeJson(layout.semanticPath, semanticMemory);
}

export async function writeHallOfFame(layout, hallOfFame) {
  await writeJson(layout.hallOfFamePath, hallOfFame);
}

export async function writeCandidateSummary(layout, candidateId, summary) {
  const filePath = path.join(layout.candidateDir, `${String(candidateId).padStart(4, "0")}.json`);
  await writeJson(filePath, summary);
  return filePath;
}

export async function writeLatestSessionSummary(layout, summary) {
  await writeJson(layout.latestSessionSummaryPath, summary);
}
