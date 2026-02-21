import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

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
    expectedShot: DEFAULT_EXPECTED_SHOT,
    reviewNote: "",
    legacyBeforeStateOk: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--") {
      continue;
    }
    switch (key) {
      case "--legacy-before-state-ok":
        args.legacyBeforeStateOk = true;
        break;
      case "--before-image":
      case "--after-image":
      case "--before-state":
      case "--after-state":
      case "--expected-shot":
      case "--review-note": {
        const value = argv[i + 1];
        if (!value || value.startsWith("--")) {
          fail(`Missing value for ${key}`);
        }
        i += 1;
        if (key === "--before-image") args.beforeImage = value;
        if (key === "--after-image") args.afterImage = value;
        if (key === "--before-state") args.beforeState = value;
        if (key === "--after-state") args.afterState = value;
        if (key === "--expected-shot") args.expectedShot = value;
        if (key === "--review-note") args.reviewNote = value;
        break;
      }
      default:
        fail(`Unknown argument '${key}'`);
    }
  }

  if (!args.beforeImage || !args.afterImage || !args.beforeState || !args.afterState) {
    fail(
      "Usage: node scripts/review-shot-pair.mjs --before-image <path> --after-image <path> --before-state <path> --after-state <path> --review-note \"<manual review note>\" [--expected-shot SHOT_BLOCKOUT_COMPARE]",
    );
  }

  const trimmedNote = args.reviewNote.trim();
  if (trimmedNote.length < 20) {
    fail("--review-note is required and must be at least 20 characters describing your before/after visual review");
  }

  return {
    ...args,
    reviewNote: trimmedNote,
  };
}

function ensureFile(filePath) {
  if (!existsSync(filePath)) {
    fail(`File not found: ${filePath}`);
  }
}

function readPngSize(filePath) {
  const buffer = readFileSync(filePath);
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== pngSignature) {
    fail(`Expected PNG file at ${filePath}`);
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width <= 0 || height <= 0) {
    fail(`Invalid PNG dimensions for ${filePath}`);
  }
  return { width, height, hash: crypto.createHash("sha256").update(buffer).digest("hex") };
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Failed to parse JSON at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
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
    if (allowMissing) {
      return null;
    }
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
  if (!camera) {
    return;
  }
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

function run() {
  const args = parseArgs(process.argv);

  for (const filePath of [args.beforeImage, args.afterImage, args.beforeState, args.afterState]) {
    ensureFile(filePath);
  }

  const beforeImage = readPngSize(args.beforeImage);
  const afterImage = readPngSize(args.afterImage);
  if (beforeImage.width !== afterImage.width || beforeImage.height !== afterImage.height) {
    fail(
      `Before/after resolution mismatch: ${beforeImage.width}x${beforeImage.height} vs ${afterImage.width}x${afterImage.height}`,
    );
  }

  const beforeState = readJson(args.beforeState);
  const afterState = readJson(args.afterState);

  const warnings = [];

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
  if (!beforeCamera || !beforeShot.cameraPose) {
    warnings.push("before state missing camera metadata; legacy fallback enabled");
  }

  validateFraming(beforeCamera, beforeShot, "before");
  validateFraming(afterCamera, afterShot, "after");
  let posDeltaM = 0;
  let yawDeltaDeg = 0;
  let pitchDeltaDeg = 0;
  let fovDeltaDeg = 0;

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
    warnings.push("camera-drift check skipped because one state lacked view.camera");
  }

  const identicalImages = beforeImage.hash === afterImage.hash;

  const summary = {
    passed: true,
    reviewedAt: new Date().toISOString(),
    expectedShot: args.expectedShot,
    resolution: `${beforeImage.width}x${beforeImage.height}`,
    camera: {
      posDeltaM,
      yawDeltaDeg,
      pitchDeltaDeg,
      fovDeltaDeg,
    },
    identicalImages,
    warnings,
    reviewNote: args.reviewNote,
    beforeImage: path.resolve(args.beforeImage),
    afterImage: path.resolve(args.afterImage),
    beforeState: path.resolve(args.beforeState),
    afterState: path.resolve(args.afterState),
  };

  console.log(JSON.stringify(summary, null, 2));
}

run();
