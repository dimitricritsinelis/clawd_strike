import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";

function toLuminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export async function readPngMetrics(filePath) {
  const buffer = await readFile(filePath);
  const png = PNG.sync.read(buffer);
  const { width, height, data } = png;

  let luminanceSum = 0;
  let luminanceSqSum = 0;
  let darkPixels = 0;
  let brightPixels = 0;
  let saturationSum = 0;
  let edgeEnergySum = 0;
  let edgeSamples = 0;

  const luminances = new Float32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x;
      const offset = pixelIndex * 4;
      const r = data[offset] / 255;
      const g = data[offset + 1] / 255;
      const b = data[offset + 2] / 255;
      const luminance = toLuminance(r, g, b);

      luminances[pixelIndex] = luminance;
      luminanceSum += luminance;
      luminanceSqSum += luminance * luminance;

      const maxChannel = Math.max(r, g, b);
      const minChannel = Math.min(r, g, b);
      const saturation = maxChannel === 0 ? 0 : (maxChannel - minChannel) / maxChannel;
      saturationSum += saturation;

      if (luminance < 0.2) darkPixels += 1;
      if (luminance > 0.8) brightPixels += 1;
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const current = luminances[index];

      if (x + 1 < width) {
        edgeEnergySum += Math.abs(current - luminances[index + 1]);
        edgeSamples += 1;
      }
      if (y + 1 < height) {
        edgeEnergySum += Math.abs(current - luminances[index + width]);
        edgeSamples += 1;
      }
    }
  }

  const pixelCount = width * height;
  const meanLuminance = pixelCount === 0 ? 0 : luminanceSum / pixelCount;
  const variance = pixelCount === 0 ? 0 : Math.max(0, luminanceSqSum / pixelCount - meanLuminance * meanLuminance);
  const contrast = Math.sqrt(variance);

  return {
    width,
    height,
    hash: crypto.createHash("sha256").update(buffer).digest("hex"),
    meanLuminance,
    contrast,
    meanSaturation: pixelCount === 0 ? 0 : saturationSum / pixelCount,
    darkPixelRatio: pixelCount === 0 ? 0 : darkPixels / pixelCount,
    brightPixelRatio: pixelCount === 0 ? 0 : brightPixels / pixelCount,
    edgeEnergy: edgeSamples === 0 ? 0 : edgeEnergySum / edgeSamples,
  };
}

export async function comparePngMetrics(beforePath, afterPath) {
  const beforeBuffer = await readFile(beforePath);
  const afterBuffer = await readFile(afterPath);
  const before = PNG.sync.read(beforeBuffer);
  const after = PNG.sync.read(afterBuffer);

  if (before.width !== after.width || before.height !== after.height) {
    throw new Error(
      `PNG size mismatch: ${before.width}x${before.height} vs ${after.width}x${after.height}`,
    );
  }

  const pixelCount = before.width * before.height;
  let absDiffSum = 0;
  let changedPixels = 0;

  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    const beforeL = toLuminance(
      before.data[offset] / 255,
      before.data[offset + 1] / 255,
      before.data[offset + 2] / 255,
    );
    const afterL = toLuminance(
      after.data[offset] / 255,
      after.data[offset + 1] / 255,
      after.data[offset + 2] / 255,
    );
    const diff = Math.abs(beforeL - afterL);
    absDiffSum += diff;
    if (diff >= 0.08) {
      changedPixels += 1;
    }
  }

  return {
    meanAbsLuminanceDiff: pixelCount === 0 ? 0 : absDiffSum / pixelCount,
    changedPixelRatio: pixelCount === 0 ? 0 : changedPixels / pixelCount,
  };
}
