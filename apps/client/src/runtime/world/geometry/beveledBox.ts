import * as THREE from "three";

/**
 * Creates a box geometry with beveled/chamfered edges.
 * Uses THREE.BoxGeometry with segments + vertex displacement for bevel effect.
 * More efficient than RoundedBoxGeometry for architectural use.
 */
export function createBeveledBoxGeometry(
  width: number,
  height: number,
  depth: number,
  bevelRadius: number = 0.08,
  bevelSegments: number = 2
): THREE.BufferGeometry {
  const r = Math.min(bevelRadius, width * 0.25, height * 0.25, depth * 0.25);
  if (r < 0.01) {
    // Bevel too small — return plain box
    return new THREE.BoxGeometry(width, height, depth);
  }

  const seg = Math.max(1, bevelSegments);
  const geo = new THREE.BoxGeometry(width, height, depth, seg + 2, seg + 2, seg + 2);
  const pos = geo.getAttribute("position");
  const hw = width / 2;
  const hh = height / 2;
  const hd = depth / 2;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    // Compute how far each axis is into the bevel zone
    const bx = Math.max(0, Math.abs(x) - (hw - r));
    const by = Math.max(0, Math.abs(y) - (hh - r));
    const bz = Math.max(0, Math.abs(z) - (hd - r));

    const bevelDist = Math.sqrt(bx * bx + by * by + bz * bz);
    if (bevelDist > 0) {
      const scale = r / bevelDist;
      if (scale < 1) {
        // Pull vertex inward to create rounded edge
        if (bx > 0) x = Math.sign(x) * ((hw - r) + bx * scale);
        if (by > 0) y = Math.sign(y) * ((hh - r) + by * scale);
        if (bz > 0) z = Math.sign(z) * ((hd - r) + bz * scale);
      }
    }

    pos.setXYZ(i, x, y, z);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();

  // Generate UV2 for AO map support
  const uv = geo.getAttribute("uv");
  if (uv) {
    const uv2 = new THREE.Float32BufferAttribute(uv.array.slice(), 2);
    geo.setAttribute("uv2", uv2);
  }

  return geo;
}
