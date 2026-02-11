import type { Vec3 } from "@clawd-strike/shared";
import { PLAYER_MAX_SPEED } from "./constants";
import { clampPitch, yawPitchToDir, yawToForwardRight } from "./movement";

/** @deprecated Internal helper type retained for one cleanup cycle. */
export type RecoilState = {
  sprayIndex: number;
  lastShotTick: number;
};

type RecoilOffsetDeg = Readonly<{ yaw: number; pitch: number }>;

// Deterministic, learnable pattern (no random spread). Values are *cumulative* offsets in degrees.
// Tuned to feel AK-like: strong vertical climb with alternating horizontal drift.
const AK_RECOIL_OFFSETS_DEG: readonly RecoilOffsetDeg[] = [
  { yaw: 0.0, pitch: 0.0 },
  { yaw: 0.2, pitch: 0.35 },
  { yaw: 0.55, pitch: 0.8 },
  { yaw: 0.9, pitch: 1.35 },
  { yaw: 1.15, pitch: 1.95 },
  { yaw: 1.25, pitch: 2.6 },
  { yaw: 1.2, pitch: 3.25 },
  { yaw: 1.0, pitch: 3.85 },
  { yaw: 0.65, pitch: 4.35 },
  { yaw: 0.2, pitch: 4.75 },
  { yaw: -0.25, pitch: 5.05 },
  { yaw: -0.65, pitch: 5.3 },
  { yaw: -0.95, pitch: 5.55 },
  { yaw: -1.1, pitch: 5.85 },
  { yaw: -1.05, pitch: 6.25 },
  { yaw: -0.8, pitch: 6.75 },
  { yaw: -0.4, pitch: 7.35 },
  { yaw: 0.1, pitch: 8.0 },
  { yaw: 0.65, pitch: 8.6 },
  { yaw: 1.05, pitch: 9.1 },
  { yaw: 1.2, pitch: 9.55 },
  { yaw: 1.1, pitch: 10.0 },
  { yaw: 0.8, pitch: 10.45 },
  { yaw: 0.35, pitch: 10.85 },
  { yaw: -0.2, pitch: 11.2 },
  { yaw: -0.65, pitch: 11.5 },
  { yaw: -0.95, pitch: 11.8 },
  { yaw: -1.05, pitch: 12.05 },
  { yaw: -0.85, pitch: 12.25 },
  { yaw: -0.45, pitch: 12.4 }
];

function degToRad(d: number): number {
  return (d * Math.PI) / 180;
}

export function getAkRecoilOffsetRad(sprayIndex: number): { yaw: number; pitch: number } {
  const i = Math.max(0, Math.min(AK_RECOIL_OFFSETS_DEG.length - 1, sprayIndex));
  const o = AK_RECOIL_OFFSETS_DEG[i] ?? AK_RECOIL_OFFSETS_DEG[0]!;
  return { yaw: degToRad(o.yaw), pitch: degToRad(o.pitch) };
}

export function computeBulletDir(
  yaw: number,
  pitch: number,
  sprayIndex: number,
  vel: Vec3
): Vec3 {
  const recoil = getAkRecoilOffsetRad(sprayIndex);

  // Deterministic movement inaccuracy: offsets derived from local velocity components (no randomness).
  const speed = Math.hypot(vel.x, vel.z);
  const speedT = Math.max(0, Math.min(1, speed / PLAYER_MAX_SPEED));
  const { fwd, right } = yawToForwardRight(yaw);
  const localRight = vel.x * right.x + vel.z * right.z;
  const localFwd = vel.x * fwd.x + vel.z * fwd.z;

  const MOVING_YAW_DEG = 0.9;
  const MOVING_PITCH_DEG = 0.65;
  const moveYaw = degToRad((localRight / PLAYER_MAX_SPEED) * MOVING_YAW_DEG) * speedT;
  const movePitch = degToRad((-localFwd / PLAYER_MAX_SPEED) * MOVING_PITCH_DEG) * speedT;

  return yawPitchToDir(yaw + recoil.yaw + moveYaw, clampPitch(pitch + recoil.pitch + movePitch));
}
