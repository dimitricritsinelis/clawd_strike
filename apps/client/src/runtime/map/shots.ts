import type { CameraPose } from "../game/Game";
import { designToWorldVec3 } from "./coordinateTransforms";
import type { RuntimeShotsSpec } from "./types";

const COMPARE_ALIAS = "compare";
const COMPARE_SHOT_ID = "SHOT_BLOCKOUT_COMPARE";

const HARDCODED_COMPARE_CAMERA: CameraPose = {
  pos: { x: 25, y: 1.7, z: 7 },
  lookAt: { x: 25, y: 1.7, z: 20 },
  fovDeg: 75,
};

export type ResolvedShot = {
  active: boolean;
  id: string | null;
  cameraPose: CameraPose | null;
  freezeInput: boolean;
  warning: string | null;
};

function toCameraPose(shot: RuntimeShotsSpec["shots"][number]): CameraPose {
  return {
    pos: designToWorldVec3(shot.camera.pos),
    lookAt: designToWorldVec3(shot.camera.lookAt),
    fovDeg: shot.camera.fovDeg,
  };
}

export function resolveShot(shotsSpec: RuntimeShotsSpec, requestedShot: string | null): ResolvedShot {
  if (!requestedShot) {
    return {
      active: false,
      id: null,
      cameraPose: null,
      freezeInput: false,
      warning: null,
    };
  }

  const targetShotId =
    requestedShot === COMPARE_ALIAS ? (shotsSpec.aliases?.compare ?? COMPARE_SHOT_ID) : requestedShot;

  const shot = shotsSpec.shots.find((candidate) => candidate.id === targetShotId);
  if (!shot) {
    return {
      active: true,
      id: targetShotId,
      cameraPose: HARDCODED_COMPARE_CAMERA,
      freezeInput: true,
      warning: `Shot '${requestedShot}' not found. Falling back to hardcoded compare camera.`,
    };
  }

  return {
    active: true,
    id: shot.id,
    cameraPose: toCameraPose(shot),
    freezeInput: true,
    warning: null,
  };
}
