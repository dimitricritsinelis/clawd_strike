import { spawn } from "node:child_process";
import { mkdir, readdir, rm, stat, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegStatic from "ffmpeg-static";
import sharp from "sharp";
import manifest from "../assets-src/loading-screen/manifest.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ROOT = path.resolve(__dirname, "..");
const MASTERS_DIR = path.join(CLIENT_ROOT, "assets-src", "loading-screen", "masters");
const OUTPUT_DIR = path.join(CLIENT_ROOT, "public", "loading-screen", "assets");

const IMAGE_FORMATS = new Set(["avif", "webp", "png"]);
const HERO_PROFILE = "heroPanel";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getImageOutputs() {
  const outputs = [];
  for (const asset of manifest.images) {
    for (const variant of Object.values(asset.variants)) {
      for (const format of variant.formats) {
        outputs.push(`${variant.outputBase}.${format}`);
      }
    }
  }
  return outputs;
}

function getAudioOutputs() {
  const outputs = [];
  for (const asset of manifest.audio) {
    for (const output of asset.outputs) {
      outputs.push(output.filename);
    }
  }
  return outputs;
}

function getExpectedOutputFiles() {
  return [...getImageOutputs(), ...getAudioOutputs()].sort();
}

function createImageTransformer(inputPath, variant) {
  const transformer = sharp(inputPath, {
    failOn: "error",
    sequentialRead: true,
  });
  if (typeof variant.width === "number") {
    transformer.resize({
      width: variant.width,
      withoutEnlargement: true,
    });
  }
  return transformer;
}

function getFormatOptions(profile, format) {
  if (format === "avif") {
    return {
      quality: 60,
      effort: 8,
      chromaSubsampling: "4:4:4",
    };
  }

  if (format === "webp") {
    if (profile === HERO_PROFILE) {
      return {
        quality: 100,
        alphaQuality: 100,
        nearLossless: true,
        effort: 6,
      };
    }
    return {
      quality: 88,
      alphaQuality: 100,
      effort: 6,
    };
  }

  if (format === "png") {
    if (profile === HERO_PROFILE) {
      return {
        compressionLevel: 9,
        effort: 10,
        adaptiveFiltering: true,
      };
    }
    return {
      compressionLevel: 9,
      effort: 10,
      adaptiveFiltering: true,
      palette: true,
      quality: 100,
    };
  }

  throw new Error(`Unsupported image format: ${format}`);
}

async function emptyOutputDirectory() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const entries = await readdir(OUTPUT_DIR, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    const targetPath = path.join(OUTPUT_DIR, entry.name);
    if (entry.isDirectory()) {
      await rm(targetPath, { recursive: true, force: true });
      return;
    }
    await rm(targetPath, { force: true });
  }));
}

async function generateImageAsset(asset) {
  for (const variant of Object.values(asset.variants)) {
    const inputPath = path.join(MASTERS_DIR, variant.master);
    for (const format of variant.formats) {
      assert(IMAGE_FORMATS.has(format), `Unsupported manifest image format: ${format}`);
      const outputPath = path.join(OUTPUT_DIR, `${variant.outputBase}.${format}`);
      const transformer = createImageTransformer(inputPath, variant);
      if (format === "avif") {
        await transformer.avif(getFormatOptions(asset.profile, format)).toFile(outputPath);
      } else if (format === "webp") {
        await transformer.webp(getFormatOptions(asset.profile, format)).toFile(outputPath);
      } else {
        await transformer.png(getFormatOptions(asset.profile, format)).toFile(outputPath);
      }
    }
  }
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    assert(ffmpegStatic, "ffmpeg-static binary was not resolved");
    const process = spawn(ffmpegStatic, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    process.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    process.on("error", reject);
    process.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg exited with code ${code}\n${stderr}`));
    });
  });
}

async function generateAudioAsset(asset) {
  const inputPath = path.join(MASTERS_DIR, asset.master);
  for (const output of asset.outputs) {
    const outputPath = path.join(OUTPUT_DIR, output.filename);
    if (output.copySource) {
      await copyFile(inputPath, outputPath);
      continue;
    }
    if (output.format !== "ogg") {
      throw new Error(`Unsupported audio output format: ${output.format}`);
    }
    await runFfmpeg([
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-c:a",
      "libopus",
      "-b:a",
      `${output.bitrateKbps}k`,
      "-vbr",
      "on",
      outputPath,
    ]);
  }
}

async function printSummary() {
  const files = getExpectedOutputFiles();
  let totalBytes = 0;
  for (const file of files) {
    const filePath = path.join(OUTPUT_DIR, file);
    const fileStat = await stat(filePath);
    totalBytes += fileStat.size;
    console.log(`[assets:loading-screen] ${file} ${fileStat.size}`);
  }
  console.log(`[assets:loading-screen] total-bytes ${totalBytes}`);
}

async function main() {
  await emptyOutputDirectory();

  for (const asset of manifest.images) {
    await generateImageAsset(asset);
  }
  for (const asset of manifest.audio) {
    await generateAudioAsset(asset);
  }

  await printSummary();
}

await main();
