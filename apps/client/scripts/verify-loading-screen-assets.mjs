import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import manifest from "../assets-src/loading-screen/manifest.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(CLIENT_ROOT, "public", "loading-screen", "assets");

const MODERN_IMAGE_BUDGET_BYTES = 3_500_000;
const FIRST_PAINT_BUDGET_BYTES = 1_250_000;
const PRIMARY_AUDIO_BUDGET_BYTES = 1_100_000;

const REFERENCE_FILES = [
  path.join(CLIENT_ROOT, "index.html"),
  path.join(CLIENT_ROOT, "src", "styles.css"),
  path.join(CLIENT_ROOT, "src", "loading-screen", "assets.ts"),
  path.join(CLIENT_ROOT, "src", "loading-screen", "audio.ts"),
  path.join(CLIENT_ROOT, "src", "loading-screen", "bootstrap.ts"),
  path.join(CLIENT_ROOT, "src", "loading-screen", "ui.ts"),
];

const MODERN_IMAGE_REFERENCES = [
  "loading-bg-desktop.avif",
  "loading-bg-mobile.avif",
  "loading-logo-desktop.avif",
  "loading-logo-mobile.avif",
  "loading-button-human-desktop.avif",
  "loading-button-human-mobile.avif",
  "loading-button-agent-desktop.avif",
  "loading-button-agent-mobile.avif",
  "loading-button-skill-md-desktop.avif",
  "loading-button-skill-md-mobile.avif",
  "loading-button-enter-agent-mode-desktop.avif",
  "loading-button-enter-agent-mode-mobile.avif",
  "loading-mute-desktop.avif",
  "loading-mute-mobile.avif",
  "loading-info-desktop.avif",
  "loading-info-mobile.avif",
  "loading-nameplate-callsign-desktop.webp",
  "loading-nameplate-callsign-mobile.webp",
  "loading-world-champion-badge-desktop.webp",
  "loading-world-champion-badge-mobile.webp",
  "info-screen-desktop.webp",
  "info-screen-mobile.webp",
];

const FIRST_PAINT_REFERENCES = [
  "loading-bg-desktop.avif",
  "loading-bg-mobile.avif",
  "loading-logo-desktop.avif",
  "loading-logo-mobile.avif",
  "loading-button-human-desktop.avif",
  "loading-button-human-mobile.avif",
  "loading-button-agent-desktop.avif",
  "loading-button-agent-mobile.avif",
  "loading-button-skill-md-desktop.avif",
  "loading-button-skill-md-mobile.avif",
  "loading-button-enter-agent-mode-desktop.avif",
  "loading-button-enter-agent-mode-mobile.avif",
  "loading-mute-desktop.avif",
  "loading-mute-mobile.avif",
  "loading-info-desktop.avif",
  "loading-info-mobile.avif",
  "loading-world-champion-badge-desktop.webp",
  "loading-world-champion-badge-mobile.webp",
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getExpectedOutputFiles() {
  const outputs = [];
  for (const asset of manifest.images) {
    for (const variant of Object.values(asset.variants)) {
      for (const format of variant.formats) {
        outputs.push(`${variant.outputBase}.${format}`);
      }
    }
  }
  for (const asset of manifest.audio) {
    for (const output of asset.outputs) {
      outputs.push(output.filename);
    }
  }
  return outputs.sort();
}

async function getDirectoryFiles() {
  const entries = await readdir(OUTPUT_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

async function readReferencedAssetUrls() {
  const urls = new Set();
  const pattern = /\/loading-screen\/assets\/([A-Za-z0-9._-]+)/g;
  for (const filePath of REFERENCE_FILES) {
    const content = await readFile(filePath, "utf8");
    for (const match of content.matchAll(pattern)) {
      const fileName = match[1];
      if (fileName) {
        urls.add(fileName);
      }
    }
  }
  return [...urls].sort();
}

async function sumFileSizes(fileNames) {
  let total = 0;
  for (const fileName of fileNames) {
    const filePath = path.join(OUTPUT_DIR, fileName);
    const fileStat = await stat(filePath);
    total += fileStat.size;
  }
  return total;
}

async function main() {
  const expectedFiles = getExpectedOutputFiles();
  const actualFiles = await getDirectoryFiles();
  assert(
    JSON.stringify(actualFiles) === JSON.stringify(expectedFiles),
    `Generated loading-screen assets drifted.\nExpected: ${expectedFiles.join(", ")}\nActual: ${actualFiles.join(", ")}`,
  );

  const referencedUrls = await readReferencedAssetUrls();
  for (const fileName of referencedUrls) {
    assert(
      expectedFiles.includes(fileName),
      `Runtime references a non-generated loading-screen asset: ${fileName}`,
    );
  }

  const modernImageBytes = await sumFileSizes(MODERN_IMAGE_REFERENCES);
  assert(
    modernImageBytes <= MODERN_IMAGE_BUDGET_BYTES,
    `Modern loading-screen image budget exceeded: ${modernImageBytes} > ${MODERN_IMAGE_BUDGET_BYTES}`,
  );

  const firstPaintBytes = await sumFileSizes(FIRST_PAINT_REFERENCES);
  assert(
    firstPaintBytes <= FIRST_PAINT_BUDGET_BYTES,
    `First-paint loading-screen image budget exceeded: ${firstPaintBytes} > ${FIRST_PAINT_BUDGET_BYTES}`,
  );

  const primaryAudioBytes = await sumFileSizes(["loading-ambient.ogg"]);
  assert(
    primaryAudioBytes <= PRIMARY_AUDIO_BUDGET_BYTES,
    `Primary loading-screen audio budget exceeded: ${primaryAudioBytes} > ${PRIMARY_AUDIO_BUDGET_BYTES}`,
  );

  console.log(`[verify:loading-screen-assets] modern-images-bytes ${modernImageBytes}`);
  console.log(`[verify:loading-screen-assets] first-paint-bytes ${firstPaintBytes}`);
  console.log(`[verify:loading-screen-assets] primary-audio-bytes ${primaryAudioBytes}`);
  console.log("[verify:loading-screen-assets] pass");
}

await main();
