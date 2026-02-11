import * as THREE from "three";

export type BoxUvScale = Readonly<{
  side: number;
  top: number;
}>;

// Ensures wall/floor UV density tracks physical dimensions.
// Also generates UV2 attribute (required for AO maps in MeshStandardMaterial).
export function createWorldUvBoxGeometry(sizeX: number, sizeY: number, sizeZ: number, scale: BoxUvScale): THREE.BufferGeometry {
  const base = new THREE.BoxGeometry(sizeX, sizeY, sizeZ).toNonIndexed();
  const uv = base.getAttribute("uv");
  if (!uv) return base;

  // BoxGeometry non-index order: +X, -X, +Y, -Y, +Z, -Z (6 verts per face).
  const faceRepeats: Array<{ u: number; v: number }> = [
    { u: sizeZ * scale.side, v: sizeY * scale.side },
    { u: sizeZ * scale.side, v: sizeY * scale.side },
    { u: sizeX * scale.top, v: sizeZ * scale.top },
    { u: sizeX * scale.top, v: sizeZ * scale.top },
    { u: sizeX * scale.side, v: sizeY * scale.side },
    { u: sizeX * scale.side, v: sizeY * scale.side }
  ];

  for (let face = 0; face < 6; face++) {
    const repeat = faceRepeats[face]!;
    for (let i = 0; i < 6; i++) {
      const idx = face * 6 + i;
      const x = uv.getX(idx) * repeat.u;
      const y = uv.getY(idx) * repeat.v;
      uv.setXY(idx, x, y);
    }
  }

  uv.needsUpdate = true;

  // Copy UV to UV2 for AO map support (Three.js requires uv2 for aoMap)
  const uv2 = new THREE.Float32BufferAttribute(uv.array.slice(), 2);
  base.setAttribute("uv2", uv2);

  base.computeBoundingBox();
  base.computeBoundingSphere();
  return base;
}
