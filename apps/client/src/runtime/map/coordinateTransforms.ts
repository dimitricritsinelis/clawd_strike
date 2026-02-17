const DEG_TO_RAD = Math.PI / 180;

export type DesignVec3 = {
  x: number;
  y: number;
  z: number;
};

export type WorldVec3 = {
  x: number;
  y: number;
  z: number;
};

export function designToWorldVec3(vec: DesignVec3): WorldVec3 {
  return {
    x: vec.x,
    y: vec.z,
    z: vec.y,
  };
}

export function designYawDegToWorldYawRad(yawDeg: number | undefined): number {
  return (yawDeg ?? 0) * DEG_TO_RAD;
}
