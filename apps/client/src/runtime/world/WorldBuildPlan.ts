import type { MapDef, SurfaceTag, Vec3 } from "@clawd-strike/shared";
import { hashSeed, lcg, rand01 } from "@clawd-strike/shared";

import type { WorldMaterialKind } from "./materials/materialLibrary";

export type VisualBlock = Readonly<{
  id: string;
  min: Vec3;
  max: Vec3;
  surface: SurfaceTag;
  material: WorldMaterialKind;
  seedKey: string;
  uvSide: number;
  uvTop: number;
  rounded: boolean;
}>;

export type PlanProp =
  | Readonly<{
      kind: "awning" | "tarp";
      id: string;
      pos: Vec3;
      size: Readonly<{ x: number; y: number; z: number }>;
      rotY: number;
      color: string;
    }>
  | Readonly<{
      kind: "clothStrip";
      id: string;
      from: Vec3;
      to: Vec3;
      width: number;
      color: string;
    }>
  | Readonly<{
      kind: "sign";
      id: string;
      pos: Vec3;
      width: number;
      height: number;
      rotY: number;
    }>
  | Readonly<{
      kind: "cable";
      id: string;
      from: Vec3;
      to: Vec3;
      sag: number;
    }>
  | Readonly<{
      kind: "lantern";
      id: string;
      pos: Vec3;
      radius: number;
      wallMounted: boolean;
    }>;

export type WorldBuildPlan = Readonly<{
  blocks: readonly VisualBlock[];
  props: readonly PlanProp[];
}>;

function inferMaterial(id: string, surface: SurfaceTag): WorldMaterialKind {
  if (id === "floor") return "sand";
  if (id.includes("floor_mid") || id.includes("floor_bazaar")) return "cobble";
  if (id.includes("floor_b_site")) return "floor";
  if (id.includes("floor_west")) return "wood";
  if (id.includes("trim")) return "trim";
  if (id.includes("cover")) return surface === "sand" ? "sand" : "concrete";
  if (id.includes("bazaar") || id.includes("connector")) return "brick";
  if (id.includes("landmark")) return "wall";
  if (surface === "metal") return "metal";
  if (surface === "sand") return "sand";
  if (surface === "concrete") return "concrete";
  if (surface === "wood") return "wood";
  return "wall";
}

export function createWorldBuildPlan(map: MapDef): WorldBuildPlan {
  const blocks: VisualBlock[] = map.colliders.map((c) => {
    const material = inferMaterial(c.id, c.surface);
    const floor = c.id === "floor";
    return {
      id: c.id,
      min: c.min,
      max: c.max,
      surface: c.surface,
      material,
      seedKey: `${material}:${c.id}`,
      uvSide: floor ? 1.6 : material === "trim" ? 2.8 : 1.25,
      uvTop: floor ? 2.4 : material === "trim" ? 3 : 1.35,
      rounded: !floor && (c.max.y - c.min.y) > 0.4
    };
  });

  const props: PlanProp[] = [];
  const next = lcg(hashSeed(`${map.id}:props`));

  const clothPalette = ["#c57b3d", "#c8ab7b", "#9d4f3e", "#5d8f8f", "#687844", "#a86838", "#7a6d52"];

  for (const point of map.points) {
    // --- Tarps: 2 per market area for more overhead coverage ---
    if (point.id.includes("bazaar") || point.id.includes("mid") || point.id.includes("street")) {
      const tarpCount = 1 + (rand01(next) > 0.5 ? 1 : 0);
      for (let t = 0; t < tarpCount; t++) {
        const sizeVariant = rand01(next);
        props.push({
          kind: "tarp",
          id: `tarp:${point.id}:${t}`,
          pos: { x: point.pos.x + (rand01(next) - 0.5) * 10, y: 5.2 + rand01(next) * 1.2, z: point.pos.z + (rand01(next) - 0.5) * 10 },
          size: {
            x: sizeVariant > 0.6 ? 10 + rand01(next) * 4 : 6 + rand01(next) * 4,
            y: 0.08,
            z: sizeVariant > 0.6 ? 3.5 + rand01(next) * 1.5 : 2.2 + rand01(next) * 1.2
          },
          rotY: rand01(next) * Math.PI,
          color: clothPalette[Math.floor(rand01(next) * clothPalette.length)] ?? "#c57b3d"
        });
      }
    }

    // --- Awnings: more variety in sizes ---
    if (point.id.includes("site") || point.id.includes("street") || point.id.includes("alley")) {
      const awningCount = 1 + (rand01(next) > 0.6 ? 1 : 0);
      for (let a = 0; a < awningCount; a++) {
        props.push({
          kind: "awning",
          id: `awning:${point.id}:${a}`,
          pos: { x: point.pos.x + (rand01(next) - 0.5) * 7, y: 2.8 + rand01(next) * 1.4, z: point.pos.z + (rand01(next) - 0.5) * 7 },
          size: { x: 2.8 + rand01(next) * 3.5, y: 0.08, z: 1.4 + rand01(next) * 1.4 },
          rotY: rand01(next) * Math.PI,
          color: clothPalette[Math.floor(rand01(next) * clothPalette.length)] ?? "#9f6f4c"
        });
      }
    }

    // --- Signs: more variety with different sizes ---
    if (point.id.includes("site") || point.id.includes("spawn") || point.id.includes("street") || point.id.includes("bazaar")) {
      const signCount = 1 + (rand01(next) > 0.55 ? 1 : 0);
      for (let s = 0; s < signCount; s++) {
        const small = rand01(next) > 0.6;
        props.push({
          kind: "sign",
          id: `sign:${point.id}:${s}`,
          pos: { x: point.pos.x + (rand01(next) - 0.5) * 5, y: 2.8 + rand01(next) * 2.2, z: point.pos.z + (rand01(next) - 0.5) * 5 },
          width: small ? 1.4 + rand01(next) * 1.2 : 2.4 + rand01(next) * 2.2,
          height: small ? 0.5 + rand01(next) * 0.3 : 0.7 + rand01(next) * 0.5,
          rotY: rand01(next) * Math.PI * 2
        });
      }
    }

    // --- Lanterns: mix of hanging and wall-mounted ---
    if (point.id.includes("bazaar") || point.id.includes("alley") || point.id.includes("street") || point.id.includes("site")) {
      const lanternCount = 1 + (rand01(next) > 0.4 ? 1 : 0);
      for (let l = 0; l < lanternCount; l++) {
        const wallMounted = rand01(next) > 0.55;
        props.push({
          kind: "lantern",
          id: `lantern:${point.id}:${l}`,
          pos: {
            x: point.pos.x + (rand01(next) - 0.5) * (wallMounted ? 5 : 3),
            y: wallMounted ? 2.8 + rand01(next) * 1.0 : 4.4 + rand01(next) * 1.4,
            z: point.pos.z + (rand01(next) - 0.5) * (wallMounted ? 5 : 3)
          },
          radius: wallMounted ? 0.06 + rand01(next) * 0.04 : 0.08 + rand01(next) * 0.08,
          wallMounted
        });
      }
    }

    // --- Hanging cloth strips between buildings ---
    if (point.id.includes("bazaar") || point.id.includes("mid") || point.id.includes("street")) {
      if (rand01(next) > 0.4) {
        const stripLen = 4 + rand01(next) * 6;
        const angle = rand01(next) * Math.PI * 2;
        const cx = point.pos.x + (rand01(next) - 0.5) * 4;
        const cz = point.pos.z + (rand01(next) - 0.5) * 4;
        const h = 5.0 + rand01(next) * 1.5;
        props.push({
          kind: "clothStrip",
          id: `clothstrip:${point.id}`,
          from: { x: cx - Math.cos(angle) * stripLen * 0.5, y: h, z: cz - Math.sin(angle) * stripLen * 0.5 },
          to: { x: cx + Math.cos(angle) * stripLen * 0.5, y: h + (rand01(next) - 0.5) * 0.6, z: cz + Math.sin(angle) * stripLen * 0.5 },
          width: 0.3 + rand01(next) * 0.4,
          color: clothPalette[Math.floor(rand01(next) * clothPalette.length)] ?? "#c8ab7b"
        });
      }
    }
  }

  // --- Cables: connect sequential + some cross-connections ---
  for (let i = 0; i < map.points.length - 1; i++) {
    const a = map.points[i]!;
    const b = map.points[(i + 1) % map.points.length]!;
    props.push({
      kind: "cable",
      id: `cable:${a.id}:${b.id}`,
      from: { x: a.pos.x, y: 6.0 + rand01(next) * 1.0, z: a.pos.z },
      to: { x: b.pos.x, y: 6.0 + rand01(next) * 1.0, z: b.pos.z },
      sag: 0.6 + rand01(next) * 1.4
    });
    // Extra parallel cable with offset
    if (rand01(next) > 0.5) {
      const off = 0.5 + rand01(next) * 1.5;
      props.push({
        kind: "cable",
        id: `cable2:${a.id}:${b.id}`,
        from: { x: a.pos.x + off, y: 6.4 + rand01(next) * 0.6, z: a.pos.z + off },
        to: { x: b.pos.x + off, y: 6.4 + rand01(next) * 0.6, z: b.pos.z + off },
        sag: 0.5 + rand01(next) * 1.0
      });
    }
  }

  // --- Skip-one cross cables for more visual density ---
  for (let i = 0; i < map.points.length - 2; i += 2) {
    const a = map.points[i]!;
    const b = map.points[i + 2]!;
    if (rand01(next) > 0.55) {
      props.push({
        kind: "cable",
        id: `cableX:${a.id}:${b.id}`,
        from: { x: a.pos.x, y: 5.8 + rand01(next) * 1.2, z: a.pos.z },
        to: { x: b.pos.x, y: 5.8 + rand01(next) * 1.2, z: b.pos.z },
        sag: 1.0 + rand01(next) * 1.5
      });
    }
  }

  return { blocks, props };
}
