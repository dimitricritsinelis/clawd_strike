export type MutableAabb = {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
};

export function setAabbFromFootPosition(
  out: MutableAabb,
  x: number,
  y: number,
  z: number,
  halfWidth: number,
  height: number,
): void {
  out.minX = x - halfWidth;
  out.maxX = x + halfWidth;
  out.minY = y;
  out.maxY = y + height;
  out.minZ = z - halfWidth;
  out.maxZ = z + halfWidth;
}

export function intersectsAabb(a: MutableAabb, b: MutableAabb): boolean {
  return (
    a.minX < b.maxX &&
    a.maxX > b.minX &&
    a.minY < b.maxY &&
    a.maxY > b.minY &&
    a.minZ < b.maxZ &&
    a.maxZ > b.minZ
  );
}
