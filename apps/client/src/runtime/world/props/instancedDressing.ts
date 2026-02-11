import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { MapDef } from "@clawd-strike/shared";
import { hashSeed, lcg, rand01 } from "@clawd-strike/shared";

import type { MaterialLibrary } from "../materials/materialLibrary";

export type DressingSet = Readonly<{
  meshes: readonly THREE.Object3D[];
  dispose: () => void;
}>;

type PointFilter = (id: string) => boolean;

function randomSigned(next: () => number): number {
  return rand01(next) * 2 - 1;
}

function placeInstanced(
  mesh: THREE.InstancedMesh,
  map: MapDef,
  seed: string,
  spread: number,
  y: number,
  perPoint: number,
  filter: PointFilter,
  scaleMin: number,
  scaleMax: number
) {
  const next = lcg(hashSeed(seed));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  let idx = 0;
  for (const point of map.points) {
    if (!filter(point.id)) continue;
    for (let i = 0; i < perPoint; i++) {
      if (idx >= mesh.count) break;
      p.set(point.pos.x + randomSigned(next) * spread, y, point.pos.z + randomSigned(next) * spread);
      q.setFromAxisAngle(up, rand01(next) * Math.PI * 2);
      const scale = scaleMin + rand01(next) * (scaleMax - scaleMin);
      s.set(scale, scale, scale);
      m.compose(p, q, s);
      mesh.setMatrixAt(idx, m);
      idx++;
    }
  }

  mesh.count = idx;
  mesh.instanceMatrix.needsUpdate = true;
}

function includeAll(): boolean {
  return true;
}

function includeMarket(id: string): boolean {
  return id.includes("bazaar") || id.includes("site") || id.includes("street") || id.includes("mid");
}

function includeBazaarStreet(id: string): boolean {
  return id.includes("bazaar") || id.includes("street") || id.includes("alley");
}

/** Create a slatted crate geometry: main box + 4 edge strips + 2 top cross braces */
function createCrateGeometry(): THREE.BufferGeometry {
  const main = new THREE.BoxGeometry(1.2, 1.1, 1.2);
  const slat = new THREE.BoxGeometry(1.22, 0.06, 0.04);
  const brace = new THREE.BoxGeometry(0.06, 0.04, 1.22);

  // Merge slats onto crate sides
  const geos: THREE.BufferGeometry[] = [main];

  // Horizontal slats on front/back
  for (const zSign of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const s = slat.clone();
      s.translate(0, -0.4 + i * 0.4, zSign * 0.62);
      geos.push(s);
    }
  }
  // Vertical braces on sides
  for (const xSign of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const b = brace.clone();
      b.translate(xSign * 0.62, -0.3 + i * 0.6, 0);
      geos.push(b);
    }
  }
  // Top cross braces
  const topBrace1 = new THREE.BoxGeometry(1.2, 0.04, 0.06);
  topBrace1.translate(0, 0.57, -0.25);
  geos.push(topBrace1);
  const topBrace2 = new THREE.BoxGeometry(1.2, 0.04, 0.06);
  topBrace2.translate(0, 0.57, 0.25);
  geos.push(topBrace2);

  return mergeGeometries(geos) ?? main;
}

/** Create barrel geometry: cylinder + 3 metal hoop rings */
function createBarrelGeometry(): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(0.38, 0.42, 1.1, 16);
  const hoopGeo = new THREE.TorusGeometry(0.4, 0.015, 6, 16);

  const geos: THREE.BufferGeometry[] = [body];
  for (const yOff of [-0.35, 0, 0.35]) {
    const hoop = hoopGeo.clone();
    hoop.rotateX(Math.PI * 0.5);
    hoop.translate(0, yOff, 0);
    geos.push(hoop);
  }

  return mergeGeometries(geos) ?? body;
}

/** Create amphora-like pottery using lathe geometry */
function createAmphoraGeometry(): THREE.BufferGeometry {
  const points: THREE.Vector2[] = [];
  // Profile: narrow bottom, wide belly, narrow neck, flared lip
  points.push(new THREE.Vector2(0.02, 0));
  points.push(new THREE.Vector2(0.1, 0.05));
  points.push(new THREE.Vector2(0.2, 0.15));
  points.push(new THREE.Vector2(0.28, 0.35));
  points.push(new THREE.Vector2(0.26, 0.55));
  points.push(new THREE.Vector2(0.18, 0.7));
  points.push(new THREE.Vector2(0.08, 0.78));
  points.push(new THREE.Vector2(0.06, 0.85));
  points.push(new THREE.Vector2(0.09, 0.88));
  return new THREE.LatheGeometry(points, 12);
}

export function addInstancedDressing(scene: THREE.Scene, map: MapDef, materials: MaterialLibrary): DressingSet {
  const meshes: THREE.Object3D[] = [];

  // Slatted crates
  const crateMat = materials.get("wood", "dressing:crate", 1.2, 1.2);
  const crateGeom = createCrateGeometry();
  const crates = new THREE.InstancedMesh(crateGeom, crateMat, map.points.length * 3);
  crates.castShadow = true;
  crates.receiveShadow = true;
  crates.userData.ignoreImpactRay = true;
  placeInstanced(crates, map, "dressing:crates", 2.8, 0.56, 3, includeMarket, 0.85, 1.15);
  scene.add(crates);
  meshes.push(crates);

  // Metal-hooped barrels
  const barrelMat = materials.get("metal", "dressing:barrel", 0.8, 1.4);
  const barrelGeom = createBarrelGeometry();
  const barrels = new THREE.InstancedMesh(barrelGeom, barrelMat, map.points.length * 2);
  barrels.castShadow = true;
  barrels.receiveShadow = true;
  barrels.userData.ignoreImpactRay = true;
  placeInstanced(barrels, map, "dressing:barrels", 2.6, 0.55, 2, includeMarket, 0.9, 1.1);
  scene.add(barrels);
  meshes.push(barrels);

  // Wicker baskets (tapered)
  const wickerMat = materials.get("reed", "dressing:wicker", 1.1, 1.1);
  const wickerGeom = new THREE.CylinderGeometry(0.48, 0.32, 0.38, 18);
  const baskets = new THREE.InstancedMesh(wickerGeom, wickerMat, map.points.length * 2);
  baskets.castShadow = true;
  baskets.receiveShadow = true;
  baskets.userData.ignoreImpactRay = true;
  placeInstanced(baskets, map, "dressing:baskets", 2.2, 0.2, 2, includeBazaarStreet, 0.8, 1.25);
  scene.add(baskets);
  meshes.push(baskets);

  // Mixed pottery: spherical pots + amphora
  const potteryMat = materials.get("ceramic", "dressing:pots", 0.9, 0.9);
  const potteryGeom = new THREE.SphereGeometry(0.34, 14, 10);
  const pottery = new THREE.InstancedMesh(potteryGeom, potteryMat, map.points.length * 2);
  pottery.castShadow = true;
  pottery.receiveShadow = true;
  pottery.userData.ignoreImpactRay = true;
  placeInstanced(pottery, map, "dressing:pots", 2.5, 0.34, 2, includeBazaarStreet, 0.7, 1.3);
  scene.add(pottery);
  meshes.push(pottery);

  // Amphora pottery
  const amphoraGeom = createAmphoraGeometry();
  const amphorae = new THREE.InstancedMesh(amphoraGeom, potteryMat, map.points.length * 2);
  amphorae.castShadow = true;
  amphorae.receiveShadow = true;
  amphorae.userData.ignoreImpactRay = true;
  placeInstanced(amphorae, map, "dressing:amphora", 2.2, 0, 2, includeBazaarStreet, 0.5, 0.8);
  scene.add(amphorae);
  meshes.push(amphorae);

  // Sandbags
  const sandbagMat = materials.get("sand", "dressing:sandbags", 0.7, 0.7);
  const sandbagGeom = new THREE.BoxGeometry(1.15, 0.46, 0.68);
  const sandbags = new THREE.InstancedMesh(sandbagGeom, sandbagMat, map.points.length * 4);
  sandbags.castShadow = true;
  sandbags.receiveShadow = true;
  sandbags.userData.ignoreImpactRay = true;
  placeInstanced(sandbags, map, "dressing:sandbags", 3.1, 0.23, 4, includeAll, 0.8, 1.2);
  scene.add(sandbags);
  meshes.push(sandbags);

  // Wooden planks
  const plankMat = materials.get("wood", "dressing:planks", 2.2, 1);
  const plankGeom = new THREE.BoxGeometry(2.4, 0.18, 0.44);
  const planks = new THREE.InstancedMesh(plankGeom, plankMat, map.points.length * 3);
  planks.castShadow = true;
  planks.receiveShadow = true;
  planks.userData.ignoreImpactRay = true;
  placeInstanced(planks, map, "dressing:planks", 2.8, 0.11, 3, includeMarket, 0.7, 1.2);
  scene.add(planks);
  meshes.push(planks);

  // Rugs (standing and flat)
  const rugMat = materials.get("rug", "dressing:rugs", 1.5, 1.5);
  const rugGeom = new THREE.PlaneGeometry(1.8, 1.2);
  const rugCount = map.points.length * 2;
  const rugs = new THREE.InstancedMesh(rugGeom, rugMat, rugCount);
  rugs.castShadow = false;
  rugs.receiveShadow = true;
  rugs.userData.ignoreImpactRay = true;
  {
    const next = lcg(hashSeed("dressing:rugs"));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    let idx = 0;
    for (const point of map.points) {
      if (!includeBazaarStreet(point.id)) continue;
      for (let i = 0; i < 2 && idx < rugCount; i++) {
        const stand = rand01(next) > 0.65;
        if (stand) {
          p.set(point.pos.x + randomSigned(next) * 2.4, 1.1 + rand01(next) * 0.8, point.pos.z + randomSigned(next) * 2.4);
          q.setFromEuler(new THREE.Euler(0, rand01(next) * Math.PI * 2, 0));
          s.set(1 + rand01(next) * 0.6, 1 + rand01(next) * 0.3, 1);
        } else {
          p.set(point.pos.x + randomSigned(next) * 2.4, 0.03, point.pos.z + randomSigned(next) * 2.4);
          q.setFromEuler(new THREE.Euler(-Math.PI * 0.5, rand01(next) * Math.PI * 2, 0));
          s.set(0.9 + rand01(next) * 0.8, 0.9 + rand01(next) * 0.6, 1);
        }
        m.compose(p, q, s);
        rugs.setMatrixAt(idx, m);
        idx++;
      }
    }
    rugs.count = idx;
    rugs.instanceMatrix.needsUpdate = true;
  }
  scene.add(rugs);
  meshes.push(rugs);

  // Produce (fruits)
  const produceMat = materials.get("produce", "dressing:produce", 0.9, 0.9);
  const produceGeom = new THREE.SphereGeometry(0.22, 12, 10);
  const produce = new THREE.InstancedMesh(produceGeom, produceMat, map.points.length * 8);
  produce.castShadow = true;
  produce.receiveShadow = true;
  produce.userData.ignoreImpactRay = true;
  placeInstanced(produce, map, "dressing:produce", 2.1, 0.22, 8, includeBazaarStreet, 0.65, 1.25);
  scene.add(produce);
  meshes.push(produce);

  // Spice piles (smoother cones)
  const spiceMat = materials.get("spice", "dressing:spice", 0.8, 0.8);
  const spiceGeom = new THREE.ConeGeometry(0.26, 0.24, 14);
  const spice = new THREE.InstancedMesh(spiceGeom, spiceMat, map.points.length * 7);
  spice.castShadow = true;
  spice.receiveShadow = true;
  spice.userData.ignoreImpactRay = true;
  placeInstanced(spice, map, "dressing:spice", 2.0, 0.12, 7, includeBazaarStreet, 0.7, 1.2);
  scene.add(spice);
  meshes.push(spice);

  // AC units
  const acMat = materials.get("metal", "dressing:ac", 1.2, 1.2);
  const acGeom = new THREE.BoxGeometry(1, 0.7, 0.8);
  const acCount = Math.max(12, Math.floor(map.points.length * 1.2));
  const ac = new THREE.InstancedMesh(acGeom, acMat, acCount);
  ac.castShadow = true;
  ac.receiveShadow = true;
  ac.userData.ignoreImpactRay = true;
  placeInstanced(ac, map, "dressing:ac", 4.8, 4.2, 1, includeAll, 0.9, 1.25);
  scene.add(ac);
  meshes.push(ac);

  // Herbs
  const herbsMat = materials.get("produce", "dressing:herbs", 1.1, 1.1);
  const herbsGeom = new THREE.ConeGeometry(0.12, 0.48, 8);
  const herbs = new THREE.InstancedMesh(herbsGeom, herbsMat, map.points.length * 4);
  herbs.castShadow = true;
  herbs.receiveShadow = true;
  herbs.userData.ignoreImpactRay = true;
  placeInstanced(herbs, map, "dressing:herbs", 2.1, 2.3, 4, includeBazaarStreet, 0.8, 1.2);
  scene.add(herbs);
  meshes.push(herbs);

  // Rope coils
  const ropeMat = materials.get("cloth", "dressing:rope", 1, 1);
  const ropeGeo = new THREE.TorusGeometry(0.2, 0.035, 6, 14);
  const ropeCount = map.points.length * 2;
  const ropes = new THREE.InstancedMesh(ropeGeo, ropeMat, ropeCount);
  ropes.castShadow = true;
  ropes.receiveShadow = true;
  ropes.userData.ignoreImpactRay = true;
  {
    const next = lcg(hashSeed("dressing:ropes"));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 0.3, 1); // Flattened coils
    const p = new THREE.Vector3();
    let idx = 0;
    for (const point of map.points) {
      if (!includeMarket(point.id)) continue;
      for (let i = 0; i < 2 && idx < ropeCount; i++) {
        p.set(point.pos.x + randomSigned(next) * 3, 0.05, point.pos.z + randomSigned(next) * 3);
        q.setFromEuler(new THREE.Euler(-Math.PI * 0.5, rand01(next) * Math.PI * 2, 0));
        const sc = 0.8 + rand01(next) * 0.5;
        s.set(sc, 0.3 * sc, sc);
        m.compose(p, q, s);
        ropes.setMatrixAt(idx, m);
        idx++;
      }
    }
    ropes.count = idx;
    ropes.instanceMatrix.needsUpdate = true;
  }
  scene.add(ropes);
  meshes.push(ropes);

  return {
    meshes,
    dispose: () => {
      for (const obj of meshes) {
        if (obj instanceof THREE.InstancedMesh) {
          obj.geometry.dispose();
        }
      }
    }
  };
}
