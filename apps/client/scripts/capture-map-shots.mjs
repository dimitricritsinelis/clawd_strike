import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  DEFAULT_BASE_URL,
  DEFAULT_MAP_ID,
  attachConsoleRecorder,
  captureShotSet,
  ensureDir,
  launchBrowser,
  loadShotsSpec,
  parseBaseUrl,
  parseBooleanEnv,
  selectReviewShotIds,
  startTracing,
  stopTracing,
  writeJson,
} from "./lib/runtimePlaywright.mjs";
import { readPngMetrics } from "./lib/imageMetrics.mjs";
import { aggregateShotReviews, summarizeCapturedShot } from "./lib/shotReview.mjs";

function timestampId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

const BASE_URL = parseBaseUrl(process.env.BASE_URL ?? DEFAULT_BASE_URL);
const MAP_ID = (process.env.MAP_ID ?? DEFAULT_MAP_ID).trim() || DEFAULT_MAP_ID;
const HEADLESS = parseBooleanEnv(process.env.HEADLESS, true);
const MAX_SHOTS = Math.max(1, Number(process.env.MAX_SHOTS ?? 8));
const MIN_SHOT_SCORE = Math.max(0, Math.min(100, Number(process.env.MIN_SHOT_SCORE ?? 80)));
const OUTPUT_DIR = path.resolve(
  process.cwd(),
  process.env.OUTPUT_DIR ?? `../../artifacts/playwright/map-shots/${timestampId()}`,
);

await ensureDir(OUTPUT_DIR);

const shotsSpec = await loadShotsSpec(BASE_URL, MAP_ID);
const selectedShotIds = selectReviewShotIds(shotsSpec, MAX_SHOTS);
const shotsById = new Map((Array.isArray(shotsSpec?.shots) ? shotsSpec.shots : []).map((shot) => [shot.id, shot]));

const { browser, context, page } = await launchBrowser({ headless: HEADLESS });
const consoleRecorder = attachConsoleRecorder(page);
await startTracing(context);

const summary = {
  baseUrl: BASE_URL,
  mapId: MAP_ID,
  headless: HEADLESS,
  selectedShotIds,
  outputDir: OUTPUT_DIR,
  startedAt: new Date().toISOString(),
  shots: [],
};

try {
  const shotsDir = path.join(OUTPUT_DIR, "shots");
  const captures = await captureShotSet(page, {
    baseUrl: BASE_URL,
    mapId: MAP_ID,
    outputDir: shotsDir,
    shotIds: selectedShotIds,
    consoleRecorder,
  });

  for (const capture of captures) {
    const metrics = await readPngMetrics(capture.imagePath);
    const consolePayload = capture.state && capture.consolePath
      ? JSON.parse(await readFile(capture.consolePath, "utf8"))
      : { counts: { errorCount: 0, warningCount: 0, total: 0 } };

    summary.shots.push(
      summarizeCapturedShot(capture, metrics, consolePayload.counts, {
        minScore: MIN_SHOT_SCORE,
        shotDefinition: shotsById.get(capture.shotId) ?? null,
      }),
    );
  }

  summary.aggregate = aggregateShotReviews(summary.shots, {
    minScore: MIN_SHOT_SCORE,
  });
  summary.finishedAt = new Date().toISOString();

  await stopTracing(context, path.join(OUTPUT_DIR, "trace.zip"));
  await writeJson(path.join(OUTPUT_DIR, "summary.json"), summary);
  console.log(`[capture:shots] pass | shots=${summary.shots.length} | output=${OUTPUT_DIR}`);
} catch (error) {
  summary.finishedAt = new Date().toISOString();
  summary.failed = true;
  summary.failure = error instanceof Error ? error.message : String(error);
  await stopTracing(context, path.join(OUTPUT_DIR, "trace.zip"));
  await writeJson(path.join(OUTPUT_DIR, "summary.json"), summary);
  throw error;
} finally {
  await context.close();
  await browser.close();
}
