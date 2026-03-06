import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { comparePngMetrics, readPngMetrics } from "./lib/imageMetrics.mjs";

const DEFAULT_EXPECTED_SHOT = "SHOT_BLOCKOUT_COMPARE";
const MAX_ABS_PITCH_DEG = 35;
const MAX_CAMERA_HEIGHT_M = 4;
const MAX_CAMERA_DELTA_M = 0.05;
const MAX_ANGLE_DELTA_DEG = 0.5;
const MAX_LOOKDOWN_DELTA_Y_M = 5;

function fail(message) {
  throw new Error(`[review:shot-pair] ${message}`);
}

function parseArgs(argv) {
  const args = {
    beforeImage: "",
    afterImage: "",
    beforeState: "",
    afterState: "",
    beforeConsole: "",
    afterConsole: "",
    expectedShot: DEFAULT_EXPECTED_SHOT,
    reviewNote: "",
    legacyBeforeStateOk: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    switch (key) {
      case "--legacy-before-state-ok":
        args.legacyBeforeStateOk = true;
        break;
      case "--before-image":
      case "--after-image":
      case "--before-state":
      case "--after-state":
      case "--before-console":
      case "--after-console":
      case "--expected-shot":
      case "--review-note": {
        const value = argv[index + 1];
        if (!value || value.startsWith("--")) {
          fail(`Missing value for ${key}`);
        }
        index += 1;
        if (key === "--before-image") args.beforeImage = value;
        if (key === "--after-image") args.afterImage = value;
        if (key === "--before-state") args.beforeState = value;
        if (key === "--after-state") args.afterState = value;
        if (key === "--before-console") args.beforeConsole = value;
        if (key === "--after-console") args.afterConsole = value;
        if (key === "--expected-shot") args.expectedShot = value;
        if (key === "--review-note") args.reviewNote = value.trim();
        break;
      }
      default:
        fail(`Unknown argument '${key}'`);
    }
  }

  if (!args.beforeImage || !args.afterImage || !args.beforeState || !args.afterState) {
    fail(
      "Usage: node scripts/review-shot-pair.mjs --before-image <path> --after-image <path> --before-state <path> --after-state <path> [--before-console <path>] [--after-console <path>] [--review-note \"optional note\"] [--expected-shot SHOT_BLOCKOUT_COMPARE]",
    );
  }

  return args;
}

function ensureFile(filePath) {
  if (!existsSync(filePath)) {
    fail(`File not found: ${filePath}`);
  }
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Failed to parse ${label} JSON at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function asNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${label} must be a finite number`);
  }
  return value;
}

function absAngleDeltaDeg(a, b) {
  let delta = Math.abs(a - b) % 360;
  if (delta > 180) {
    delta = 360 - delta;
  }
  return delta;
}

function readViewCamera(state, label, allowMissing) {
  const camera = state?.view?.camera;
  if (!camera || typeof camera !== "object") {
    if (allowMissing) return null;
    fail(`${label}.view.camera missing; update runtime text state before running screenshot review`);
  }

  return {
    pos: {
      x: asNumber(camera.pos?.x, `${label}.view.camera.pos.x`),
      y: asNumber(camera.pos?.y, `${label}.view.camera.pos.y`),
      z: asNumber(camera.pos?.z, `${label}.view.camera.pos.z`),
    },
    yawDeg: asNumber(camera.yawDeg, `${label}.view.camera.yawDeg`),
    pitchDeg: asNumber(camera.pitchDeg, `${label}.view.camera.pitchDeg`),
    fovDeg: asNumber(camera.fovDeg, `${label}.view.camera.fovDeg`),
  };
}

function readShot(state, label, allowMissingPose) {
  const shot = state?.shot;
  if (!shot || typeof shot !== "object") {
    fail(`${label}.shot missing`);
  }
  if (!shot.active) {
    fail(`${label}.shot.active must be true`);
  }
  if (typeof shot.id !== "string" || shot.id.length === 0) {
    fail(`${label}.shot.id missing`);
  }

  const pose = shot.cameraPose;
  if (!pose || typeof pose !== "object") {
    if (allowMissingPose) {
      return {
        id: shot.id,
        cameraPose: null,
      };
    }
    fail(`${label}.shot.cameraPose missing`);
  }

  return {
    id: shot.id,
    cameraPose: {
      posY: asNumber(pose.pos?.y, `${label}.shot.cameraPose.pos.y`),
      lookAtY: asNumber(pose.lookAt?.y, `${label}.shot.cameraPose.lookAt.y`),
    },
  };
}

function validateFraming(camera, shot, label) {
  if (!camera) return;

  if (Math.abs(camera.pitchDeg) > MAX_ABS_PITCH_DEG) {
    fail(`${label} camera pitch ${camera.pitchDeg.toFixed(2)}deg is too steep; likely floor-only framing`);
  }
  if (camera.pos.y > MAX_CAMERA_HEIGHT_M) {
    fail(`${label} camera height ${camera.pos.y.toFixed(2)}m is too high for gameplay compare framing`);
  }

  if (shot.cameraPose) {
    const lookDownDeltaY = shot.cameraPose.posY - shot.cameraPose.lookAtY;
    if (lookDownDeltaY > MAX_LOOKDOWN_DELTA_Y_M) {
      fail(`${label} shot camera looks down ${lookDownDeltaY.toFixed(2)}m vertically; compare shot must stay gameplay-level`);
    }
  }
}

function readConsoleCounts(filePath) {
  if (!filePath) {
    return { errorCount: 0, warningCount: 0, total: 0 };
  }
  ensureFile(filePath);
  const payload = readJson(filePath, "console");
  return payload?.counts ?? { errorCount: 0, warningCount: 0, total: 0 };
}

function buildFindings(context) {
  const findings = [];

  if (context.afterConsole.errorCount > 0) {
    findings.push({
      severity: "error",
      message: `After capture includes ${context.afterConsole.errorCount} console/page errors.`,
    });
  }
  if ((context.afterState.render?.warnings?.length ?? 0) > 0) {
    findings.push({
      severity: "warn",
      message: `Runtime warnings present after capture: ${context.afterState.render.warnings.join(" | ")}`,
    });
  }
  if (context.afterImage.meanLuminance < 0.16) {
    findings.push({
      severity: "warn",
      message: "After image is very dark; landmark readability may be compromised.",
    });
  }
  if (context.afterImage.contrast < 0.09) {
    findings.push({
      severity: "warn",
      message: "After image contrast is low; forms may read as flat.",
    });
  }
  if ((context.afterState.landmarks?.visible?.length ?? 0) === 0) {
    findings.push({
      severity: "warn",
      message: "No landmark anchors are visible in the after frame.",
    });
  }
  if (context.afterState.assets?.wall?.requestedMode === "pbr" && context.afterState.assets?.wall?.activeMode !== "pbr") {
    findings.push({
      severity: "warn",
      message: "Wall materials fell back from requested PBR mode in the after capture.",
    });
  }
  if (context.afterState.assets?.floor?.requestedMode === "pbr" && context.afterState.assets?.floor?.activeMode !== "pbr") {
    findings.push({
      severity: "warn",
      message: "Floor materials fell back from requested PBR mode in the after capture.",
    });
  }
  if (context.diff.changedPixelRatio > 0.55) {
    findings.push({
      severity: "warn",
      message: `Large image delta detected (${(context.diff.changedPixelRatio * 100).toFixed(1)}% of pixels changed). Verify this was intentional.`,
    });
  }

  const propDelta = (context.afterState.props?.collidersPlaced ?? 0) - (context.beforeState.props?.collidersPlaced ?? 0);
  if (Math.abs(propDelta) >= 25) {
    findings.push({
      severity: "warn",
      message: `Prop collider count changed by ${propDelta}; review whether density shifted more than intended.`,
    });
  }

  return findings;
}

function computeScore(findings) {
  let score = 100;
  for (const finding of findings) {
    score -= finding.severity === "error" ? 35 : 10;
  }
  return Math.max(0, score);
}

async function run() {
  const args = parseArgs(process.argv);
  for (const filePath of [args.beforeImage, args.afterImage, args.beforeState, args.afterState]) {
    ensureFile(filePath);
  }

  const beforeState = readJson(args.beforeState, "before state");
  const afterState = readJson(args.afterState, "after state");

  if (!beforeState?.map?.loaded || !afterState?.map?.loaded) {
    fail("Both before/after state files must report map.loaded=true");
  }

  const beforeShot = readShot(beforeState, "before", args.legacyBeforeStateOk);
  const afterShot = readShot(afterState, "after", false);
  if (beforeShot.id !== afterShot.id) {
    fail(`Shot mismatch: before=${beforeShot.id}, after=${afterShot.id}`);
  }
  if (beforeShot.id !== args.expectedShot) {
    fail(`Expected shot '${args.expectedShot}' but got '${beforeShot.id}'`);
  }

  const beforeCamera = readViewCamera(beforeState, "before", args.legacyBeforeStateOk);
  const afterCamera = readViewCamera(afterState, "after", false);
  validateFraming(beforeCamera, beforeShot, "before");
  validateFraming(afterCamera, afterShot, "after");

  let posDeltaM = 0;
  let yawDeltaDeg = 0;
  let pitchDeltaDeg = 0;
  let fovDeltaDeg = 0;
  const warnings = [];

  if (beforeCamera && afterCamera) {
    posDeltaM = Math.hypot(
      beforeCamera.pos.x - afterCamera.pos.x,
      beforeCamera.pos.y - afterCamera.pos.y,
      beforeCamera.pos.z - afterCamera.pos.z,
    );
    yawDeltaDeg = absAngleDeltaDeg(beforeCamera.yawDeg, afterCamera.yawDeg);
    pitchDeltaDeg = Math.abs(beforeCamera.pitchDeg - afterCamera.pitchDeg);
    fovDeltaDeg = Math.abs(beforeCamera.fovDeg - afterCamera.fovDeg);

    if (posDeltaM > MAX_CAMERA_DELTA_M) {
      fail(`Camera position drift is ${posDeltaM.toFixed(4)}m; before/after must use same deterministic viewpoint`);
    }
    if (yawDeltaDeg > MAX_ANGLE_DELTA_DEG || pitchDeltaDeg > MAX_ANGLE_DELTA_DEG || fovDeltaDeg > MAX_ANGLE_DELTA_DEG) {
      fail(
        `Camera orientation drift too high (yaw=${yawDeltaDeg.toFixed(3)}deg, pitch=${pitchDeltaDeg.toFixed(3)}deg, fov=${fovDeltaDeg.toFixed(3)}deg)`,
      );
    }
  } else {
    warnings.push("camera drift check skipped because one state lacked camera metadata");
  }

  const beforeImage = await readPngMetrics(args.beforeImage);
  const afterImage = await readPngMetrics(args.afterImage);
  const diff = await comparePngMetrics(args.beforeImage, args.afterImage);
  const beforeConsole = readConsoleCounts(args.beforeConsole);
  const afterConsole = readConsoleCounts(args.afterConsole);

  const findings = buildFindings({
    beforeState,
    afterState,
    beforeImage,
    afterImage,
    beforeConsole,
    afterConsole,
    diff,
  });
  const score = computeScore(findings);

  const summary = {
    passed: findings.every((finding) => finding.severity !== "error"),
    reviewedAt: new Date().toISOString(),
    expectedShot: args.expectedShot,
    resolution: `${beforeImage.width}x${beforeImage.height}`,
    camera: {
      posDeltaM,
      yawDeltaDeg,
      pitchDeltaDeg,
      fovDeltaDeg,
    },
    images: {
      identical: beforeImage.hash === afterImage.hash,
      before: beforeImage,
      after: afterImage,
      diff,
    },
    console: {
      before: beforeConsole,
      after: afterConsole,
    },
    deltas: {
      propsPlaced:
        (afterState.props?.collidersPlaced ?? 0) - (beforeState.props?.collidersPlaced ?? 0),
      visibleLandmarks:
        (afterState.landmarks?.visible?.length ?? 0) - (beforeState.landmarks?.visible?.length ?? 0),
      warnings:
        (afterState.render?.warnings?.length ?? 0) - (beforeState.render?.warnings?.length ?? 0),
    },
    score,
    findings,
    warnings,
    reviewNote: args.reviewNote || null,
    beforeImage: path.resolve(args.beforeImage),
    afterImage: path.resolve(args.afterImage),
    beforeState: path.resolve(args.beforeState),
    afterState: path.resolve(args.afterState),
    ...(args.beforeConsole ? { beforeConsole: path.resolve(args.beforeConsole) } : {}),
    ...(args.afterConsole ? { afterConsole: path.resolve(args.afterConsole) } : {}),
  };

  console.log(JSON.stringify(summary, null, 2));
}

await run();
