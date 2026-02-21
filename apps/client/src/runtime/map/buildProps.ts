import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  MeshLambertMaterial,
  Object3D,
  type BufferGeometry,
} from "three";
import type { RuntimeColliderAabb } from "../sim/collision/WorldColliders";
import { resolveBlockoutPalette } from "../render/BlockoutMaterials";
import { DeterministicRng, resolveRuntimeSeed } from "../utils/Rng";
import type { RuntimePropChaosOptions, RuntimePropProfile } from "../utils/UrlParams";
import { designToWorldVec3, designYawDegToWorldYawRad, type WorldVec3 } from "./coordinateTransforms";
import type { RuntimeAnchor, RuntimeAnchorsSpec, RuntimeBlockoutSpec, RuntimeRect } from "./types";

const CLEAR_ZONE_EPSILON = 0.0001;
const BOUNDS_EPSILON = 0.0001;
const GAP_RULE_MIN_PASSAGE_M = 1.7;
const STALL_FILLER_EDGE_PADDING_M = 0.28;
const DEG_TO_RAD = designYawDegToWorldYawRad(1);

const PROFILE_DEFAULTS: Record<RuntimePropProfile, { jitter: number; cluster: number; density: number; decorativeDropout: number }> = {
  subtle: { jitter: 0.34, cluster: 0.56, density: 0.44, decorativeDropout: 0.22 },
  medium: { jitter: 0.62, cluster: 0.74, density: 0.6, decorativeDropout: 0.28 },
  high: { jitter: 0.88, cluster: 0.9, density: 0.74, decorativeDropout: 0.34 },
};

type ResolvedChaos = {
  profile: RuntimePropProfile;
  jitter: number;
  cluster: number;
  density: number;
  decorativeDropout: number;
};

type InstanceSpec = {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  yawRad: number;
};

type InstanceBatch = {
  id: string;
  color: number;
  createGeometry: () => BufferGeometry;
  instances: InstanceSpec[];
};

type LineRhythmPoint = {
  anchor: RuntimeAnchor;
  base: WorldVec3;
  along: number;
};

type AnchorLineGroup = {
  key: string;
  points: LineRhythmPoint[];
};

export type PropsBuildStats = {
  seed: number;
  profile: RuntimePropProfile;
  jitter: number;
  cluster: number;
  density: number;
  totalAnchors: number;
  candidatesTotal: number;
  collidersPlaced: number;
  rejectedClearZone: number;
  rejectedBounds: number;
  rejectedGapRule: number;
  visualOnlyLandmarks: number;
  stallFillersPlaced: number;
};

export type PropsBuildResult = {
  root: Group;
  colliders: RuntimeColliderAabb[];
  stats: PropsBuildStats;
};

export type BuildPropsOptions = {
  mapId: string;
  blockout: RuntimeBlockoutSpec;
  anchors: RuntimeAnchorsSpec;
  seedOverride: number | null;
  propChaos: RuntimePropChaosOptions;
  highVis: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toWorldPosition(anchor: RuntimeAnchor): WorldVec3 {
  return designToWorldVec3(anchor.pos);
}

function yawDegToRad(yawDeg: number | undefined): number {
  return designYawDegToWorldYawRad(yawDeg);
}

function overlapsRect2d(collider: RuntimeColliderAabb, rect: RuntimeRect): boolean {
  const minX = collider.min.x + CLEAR_ZONE_EPSILON;
  const maxX = collider.max.x - CLEAR_ZONE_EPSILON;
  const minZ = collider.min.z + CLEAR_ZONE_EPSILON;
  const maxZ = collider.max.z - CLEAR_ZONE_EPSILON;

  if (maxX <= rect.x || minX >= rect.x + rect.w) return false;
  if (maxZ <= rect.y || minZ >= rect.y + rect.h) return false;
  return true;
}

function pointInRect2d(x: number, z: number, rect: RuntimeRect): boolean {
  return x >= rect.x && x <= rect.x + rect.w && z >= rect.y && z <= rect.y + rect.h;
}

function overlapLength(minA: number, maxA: number, minB: number, maxB: number): number {
  return Math.max(0, Math.min(maxA, maxB) - Math.max(minA, minB));
}

function createColliderFromOrientedBox(
  id: string,
  center: WorldVec3,
  size: { x: number; y: number; z: number },
  yawRad: number,
): RuntimeColliderAabb {
  const halfY = size.y * 0.5;
  const absCos = Math.abs(Math.cos(yawRad));
  const absSin = Math.abs(Math.sin(yawRad));
  const halfX = absCos * size.x * 0.5 + absSin * size.z * 0.5;
  const halfZ = absSin * size.x * 0.5 + absCos * size.z * 0.5;

  return {
    id,
    kind: "prop",
    min: {
      x: center.x - halfX,
      y: center.y - halfY,
      z: center.z - halfZ,
    },
    max: {
      x: center.x + halfX,
      y: center.y + halfY,
      z: center.z + halfZ,
    },
  };
}

function createBatch(id: string, color: number, createGeometry: () => BufferGeometry): InstanceBatch {
  return { id, color, createGeometry, instances: [] };
}

function pushInstance(
  batch: InstanceBatch,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  yawRad: number,
): void {
  batch.instances.push({ x, y, z, sx, sy, sz, yawRad });
}

function resolveChaos(input: RuntimePropChaosOptions): ResolvedChaos {
  const defaults = PROFILE_DEFAULTS[input.profile];
  const jitter = clamp(input.jitter ?? defaults.jitter, 0, 1);
  const cluster = clamp(input.cluster ?? defaults.cluster, 0, 1);
  const density = clamp(input.density ?? defaults.density, 0, 1);
  const decorativeDropout = clamp(defaults.decorativeDropout * (1.2 - density * 0.75), 0.02, 0.55);

  return {
    profile: input.profile,
    jitter,
    cluster,
    density,
    decorativeDropout,
  };
}

function pickWeightedCount(rng: DeterministicRng, soloWeight: number, duoWeight: number, trioWeight: number): 1 | 2 | 3 {
  const total = soloWeight + duoWeight + trioWeight;
  if (total <= 0) return 1;
  const roll = rng.range(0, total);
  if (roll < soloWeight) return 1;
  if (roll < soloWeight + duoWeight) return 2;
  return 3;
}

function shouldDropDecorative(rng: DeterministicRng, chaos: ResolvedChaos, bonusKeep = 0): boolean {
  const chance = clamp(chaos.decorativeDropout - bonusKeep, 0, 0.8);
  return rng.next() < chance;
}

function createRunMask(count: number, chaos: ResolvedChaos, rng: DeterministicRng): boolean[] {
  if (count <= 0) return [];

  const targetFill = clamp(0.46 + 0.36 * chaos.density, 0.35, 0.84);
  const desiredFilled = clamp(Math.round(targetFill * count), 0, count);
  const fillMax = 1 + Math.round(1 + 3 * chaos.cluster);
  const gapMax = 1 + Math.round(2 + 6 * chaos.cluster);
  const mask = Array.from({ length: count }, () => false);

  let cursor = 0;
  let filled = 0;
  let runIsFill = rng.next() < targetFill;

  while (cursor < count) {
    const remaining = count - cursor;
    const remainingFillNeeded = desiredFilled - filled;

    if (remainingFillNeeded <= 0) {
      runIsFill = false;
    } else if (remainingFillNeeded >= remaining) {
      runIsFill = true;
    } else {
      const adaptiveFill = clamp(remainingFillNeeded / remaining, 0.05, 0.95);
      const noisyFill = clamp(
        adaptiveFill + rng.range(-0.28, 0.28) * (1 - chaos.cluster * 0.45),
        0.05,
        0.95,
      );
      runIsFill = rng.next() < noisyFill;
    }

    const runMax = runIsFill ? fillMax : gapMax;
    const runLength = Math.min(remaining, rng.int(1, runMax + 1));
    if (runIsFill) {
      for (let i = 0; i < runLength; i += 1) {
        mask[cursor + i] = true;
      }
      filled += runLength;
    }

    cursor += runLength;
    if (rng.next() < 0.8) {
      runIsFill = !runIsFill;
    }
  }

  if (filled === desiredFilled) {
    return mask;
  }

  const adjustRng = rng.fork("adjust");
  const order = Array.from({ length: count }, (_, index) => index);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = adjustRng.int(0, i + 1);
    const temp = order[i]!;
    order[i] = order[j]!;
    order[j] = temp;
  }

  if (filled < desiredFilled) {
    for (const index of order) {
      if (mask[index]) continue;
      mask[index] = true;
      filled += 1;
      if (filled >= desiredFilled) break;
    }
  } else {
    for (const index of order) {
      if (!mask[index]) continue;
      mask[index] = false;
      filled -= 1;
      if (filled <= desiredFilled) break;
    }
  }

  return mask;
}

function buildAnchorLineGroups(
  anchors: RuntimeAnchor[],
  typeTag: "shopfront_anchor" | "signage_anchor",
): AnchorLineGroup[] {
  const pointsByGroup = new Map<string, LineRhythmPoint[]>();

  for (const anchor of anchors) {
    const base = toWorldPosition(anchor);
    const yawDeg = Math.round(anchor.yawDeg ?? 0);
    const yawRad = yawDegToRad(anchor.yawDeg);
    const tangentX = Math.cos(yawRad);
    const tangentZ = -Math.sin(yawRad);
    const along = base.x * tangentX + base.z * tangentZ;
    const groupKey = `${anchor.zone}|${typeTag}|${yawDeg}`;
    const points = pointsByGroup.get(groupKey);

    const point: LineRhythmPoint = {
      anchor,
      base,
      along,
    };
    if (points) {
      points.push(point);
    } else {
      pointsByGroup.set(groupKey, [point]);
    }
  }

  const sortedGroupKeys = [...pointsByGroup.keys()].sort((a, b) => a.localeCompare(b));
  const groups: AnchorLineGroup[] = [];
  for (const groupKey of sortedGroupKeys) {
    const points = pointsByGroup.get(groupKey)!;
    points.sort((a, b) => {
      if (a.along !== b.along) return a.along - b.along;
      return a.anchor.id.localeCompare(b.anchor.id);
    });
    groups.push({
      key: groupKey,
      points,
    });
  }

  return groups;
}

function buildLinePresenceMask(
  groups: AnchorLineGroup[],
  chaos: ResolvedChaos,
  rngRoot: DeterministicRng,
): Set<string> {
  const visible = new Set<string>();

  for (const group of groups) {
    const groupRng = rngRoot.fork(group.key);
    const points = group.points;
    const mask = createRunMask(points.length, chaos, groupRng);
    for (let i = 0; i < points.length; i += 1) {
      if (!mask[i]) continue;
      visible.add(points[i]!.anchor.id);
    }
  }

  return visible;
}

function sampleClusteredGroupTs(rng: DeterministicRng, count: number, cluster: number): number[] {
  if (count <= 0) return [];
  const centerCount = count === 1 ? 1 : (rng.next() < 0.62 + cluster * 0.28 ? 1 : 2);
  const centers: number[] = [];

  for (let i = 0; i < centerCount; i += 1) {
    let center = rng.range(0.12, 0.88);
    if (centerCount === 2 && i === 1 && Math.abs(center - centers[0]!) < 0.22) {
      center = clamp(center + (center < 0.5 ? 0.22 : -0.22), 0.12, 0.88);
    }
    centers.push(center);
  }

  const spread = clamp(0.34 - cluster * 0.22, 0.08, 0.34);
  const values: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const center = centers[rng.int(0, centers.length)]!;
    const t = clamp(center + rng.range(-spread, spread), 0.08, 0.92);
    values.push(t);
  }

  values.sort((a, b) => a - b);
  return values;
}

export function buildProps(options: BuildPropsOptions): PropsBuildResult {
  const root = new Group();
  root.name = "map-props";

  const seed = resolveRuntimeSeed(options.mapId, options.seedOverride);
  const chaos = resolveChaos(options.propChaos);
  const rngRoot = new DeterministicRng(seed);
  const palette = resolveBlockoutPalette(options.highVis);

  const clearTravelRects = options.blockout.zones
    .filter((zone) => zone.type === "clear_travel_zone")
    .map((zone) => zone.rect);
  const stallStripRects = options.blockout.zones
    .filter((zone) => zone.type === "stall_strip")
    .map((zone) => zone.rect);
  const narrowPassageRects = options.blockout.zones
    .filter((zone) => zone.type === "cut" || zone.type === "connector")
    .map((zone) => zone.rect);

  const boundary = options.blockout.playable_boundary;
  const boundaryCenterX = boundary.x + boundary.w * 0.5;
  const boundaryCenterZ = boundary.y + boundary.h * 0.5;

  const batches = {
    shopfront: createBatch("prop-shopfront", palette.shopfront, () => new BoxGeometry(1, 1, 1)),
    signage: createBatch("prop-signage", palette.signage, () => new BoxGeometry(1, 1, 1)),
    cover: createBatch("prop-cover", palette.cover, () => new BoxGeometry(1, 1, 1)),
    spawnCover: createBatch("prop-spawn-cover", palette.spawnCover, () => new BoxGeometry(1, 1, 1)),
    serviceDoor: createBatch("prop-service-door", palette.serviceDoor, () => new BoxGeometry(1, 1, 1)),
    canopy: createBatch("prop-canopy", palette.canopy, () => new BoxGeometry(1, 1, 1)),
    heroPillar: createBatch("prop-hero-pillar", palette.heroPillar, () => new BoxGeometry(1, 1, 1)),
    heroLintel: createBatch("prop-hero-lintel", palette.heroLintel, () => new BoxGeometry(1, 1, 1)),
    landmarkWell: createBatch("prop-landmark-well", palette.landmarkWell, () => new CylinderGeometry(0.5, 0.62, 1, 14)),
    filler: createBatch("prop-stall-filler", palette.filler, () => new BoxGeometry(1, 1, 1)),
  };

  const stats: PropsBuildStats = {
    seed,
    profile: chaos.profile,
    jitter: chaos.jitter,
    cluster: chaos.cluster,
    density: chaos.density,
    totalAnchors: options.anchors.anchors.length,
    candidatesTotal: 0,
    collidersPlaced: 0,
    rejectedClearZone: 0,
    rejectedBounds: 0,
    rejectedGapRule: 0,
    visualOnlyLandmarks: 0,
    stallFillersPlaced: 0,
  };

  const colliders: RuntimeColliderAabb[] = [];

  function rejectReason(collider: RuntimeColliderAabb): "clear" | "bounds" | "gap" | null {
    for (const rect of clearTravelRects) {
      if (overlapsRect2d(collider, rect)) {
        return "clear";
      }
    }

    const minX = boundary.x + BOUNDS_EPSILON;
    const maxX = boundary.x + boundary.w - BOUNDS_EPSILON;
    const minZ = boundary.y + BOUNDS_EPSILON;
    const maxZ = boundary.y + boundary.h - BOUNDS_EPSILON;
    if (collider.min.x < minX || collider.max.x > maxX || collider.min.z < minZ || collider.max.z > maxZ) {
      return "bounds";
    }

    for (const rect of narrowPassageRects) {
      if (!overlapsRect2d(collider, rect)) {
        continue;
      }

      const overlapX = overlapLength(collider.min.x, collider.max.x, rect.x, rect.x + rect.w);
      const overlapZ = overlapLength(collider.min.z, collider.max.z, rect.y, rect.y + rect.h);
      if (overlapX <= 0 || overlapZ <= 0) {
        continue;
      }

      const narrowAlongX = rect.w <= rect.h;
      const occupiedAcross = narrowAlongX ? overlapX : overlapZ;
      const availableAcross = (narrowAlongX ? rect.w : rect.h) - occupiedAcross;
      if (availableAcross < GAP_RULE_MIN_PASSAGE_M) {
        return "gap";
      }
    }

    return null;
  }

  function registerRejection(reason: "clear" | "bounds" | "gap"): void {
    if (reason === "clear") {
      stats.rejectedClearZone += 1;
    } else if (reason === "bounds") {
      stats.rejectedBounds += 1;
    } else {
      stats.rejectedGapRule += 1;
    }
  }

  function placeCollidingBox(
    anchorId: string,
    suffix: string,
    batch: InstanceBatch,
    center: WorldVec3,
    size: { x: number; y: number; z: number },
    yawRad: number,
  ): void {
    const collider = createColliderFromOrientedBox(`${anchorId}-${suffix}`, center, size, yawRad);
    stats.candidatesTotal += 1;

    const reason = rejectReason(collider);
    if (reason) {
      registerRejection(reason);
      return;
    }

    pushInstance(batch, center.x, center.y, center.z, size.x, size.y, size.z, yawRad);
    colliders.push(collider);
    stats.collidersPlaced += 1;
  }

  const streamByType = {
    shopfront: rngRoot.fork("shopfront"),
    signage: rngRoot.fork("signage"),
    cover: rngRoot.fork("cover"),
    spawnCover: rngRoot.fork("spawn-cover"),
    serviceDoor: rngRoot.fork("service-door"),
    canopy: rngRoot.fork("canopy"),
    hero: rngRoot.fork("hero"),
    landmark: rngRoot.fork("landmark"),
    filler: rngRoot.fork("filler"),
  };

  const sortedAnchors = [...options.anchors.anchors].sort((a, b) => a.id.localeCompare(b.id));

  // Build open-node exclusion list — intentional market gap zones.
  // widthM on an open_node encodes the exclusion radius in design space.
  type OpenNodeCircle = { x: number; z: number; radiusSq: number };
  const openNodeCircles: OpenNodeCircle[] = sortedAnchors
    .filter((a) => a.type.toLowerCase() === "open_node")
    .map((a) => {
      const w = toWorldPosition(a);
      const r = a.widthM ?? 2.5;
      return { x: w.x, z: w.z, radiusSq: r * r };
    });

  function isNearOpenNode(x: number, z: number): boolean {
    for (const circle of openNodeCircles) {
      const dx = x - circle.x;
      const dz = z - circle.z;
      if (dx * dx + dz * dz < circle.radiusSq) return true;
    }
    return false;
  }

  const shopfrontLines = buildAnchorLineGroups(
    sortedAnchors.filter((anchor) => anchor.type.toLowerCase() === "shopfront_anchor"),
    "shopfront_anchor",
  );
  const signageLines = buildAnchorLineGroups(
    sortedAnchors.filter((anchor) => anchor.type.toLowerCase() === "signage_anchor"),
    "signage_anchor",
  );

  const shopfrontLineSpan = new Map<string, number>();
  for (const line of shopfrontLines) {
    const points = line.points;
    for (let i = 0; i < points.length; i += 1) {
      const current = points[i]!;
      const prevGap = i > 0 ? Math.abs(current.along - points[i - 1]!.along) : 0;
      const nextGap = i < points.length - 1 ? Math.abs(points[i + 1]!.along - current.along) : 0;
      const averageGap = prevGap > 0 && nextGap > 0
        ? (prevGap + nextGap) * 0.5
        : Math.max(prevGap, nextGap, 1.35);
      shopfrontLineSpan.set(current.anchor.id, clamp(averageGap, 0.95, 3.2));
    }
  }

  const shopfrontVisibility = buildLinePresenceMask(
    shopfrontLines,
    chaos,
    rngRoot.fork("rhythm-shopfront"),
  );
  const signageVisibility = buildLinePresenceMask(
    signageLines,
    chaos,
    rngRoot.fork("rhythm-signage"),
  );

  for (const anchor of sortedAnchors) {
    const type = anchor.type.toLowerCase();
    const base = toWorldPosition(anchor);
    const baseYaw = yawDegToRad(anchor.yawDeg);

    if (type === "open_node") {
      // Open nodes define intentional market gaps. No geometry placed.
      continue;
    }

    if (type === "shopfront_anchor") {
      if (!shopfrontVisibility.has(anchor.id)) {
        continue;
      }

      const rng = streamByType.shopfront.fork(anchor.id);
      const extraGapChance = clamp(0.32 - chaos.density * 0.22 + (1 - chaos.cluster) * 0.08, 0.08, 0.34);
      if (rng.next() < extraGapChance) {
        continue;
      }

      const forwardX = -Math.sin(baseYaw);
      const forwardZ = -Math.cos(baseYaw);
      const tangentX = Math.cos(baseYaw);
      const tangentZ = -Math.sin(baseYaw);
      const lineSpan = shopfrontLineSpan.get(anchor.id) ?? 1.4;

      const alongJitter = (rng.next() - 0.5) * 2 * (0.5 + 0.75 * chaos.jitter + 0.5 * chaos.cluster);
      const inwardJitter = (rng.next() - 0.5) * 2 * (0.01 + 0.05 * chaos.jitter);
      const yawJitter = (rng.next() - 0.5) * 2 * (4 + 8 * chaos.jitter) * DEG_TO_RAD;

      // Use anchor.widthM as the authoritative stall width (±20% jitter) when provided.
      // Fall back to neighbor-gap heuristic for anchors without an explicit width.
      const baseWidth = anchor.widthM ?? lineSpan;
      const widthJitter = anchor.widthM
        ? rng.range(0.82, 1.18)
        : rng.range(0.42, 1.75) * (0.82 + chaos.cluster * 0.52);

      const baseHeight = anchor.heightM ?? (2.2 + rng.range(-0.5, 0.95) * (0.65 + chaos.jitter * 0.75));

      const size = {
        x: clamp(baseWidth * widthJitter, 0.55, 3.45),
        y: clamp(baseHeight, 1.75, 3.8),
        z: clamp(0.28 + rng.range(-0.08, 0.18) * (0.55 + chaos.jitter * 0.8), 0.2, 0.62),
      };
      const center = {
        x: base.x + tangentX * alongJitter + forwardX * inwardJitter,
        y: Math.max(0, base.y) + size.y * 0.5,
        z: base.z + tangentZ * alongJitter + forwardZ * inwardJitter,
      };

      placeCollidingBox(anchor.id, "shop", batches.shopfront, center, size, baseYaw + yawJitter);
      continue;
    }

    if (type === "signage_anchor") {
      if (!signageVisibility.has(anchor.id)) {
        continue;
      }

      const rng = streamByType.signage.fork(anchor.id);
      if (shouldDropDecorative(rng, chaos, -0.16)) {
        continue;
      }

      const tangentX = Math.cos(baseYaw);
      const tangentZ = -Math.sin(baseYaw);
      const forwardX = -Math.sin(baseYaw);
      const forwardZ = -Math.cos(baseYaw);

      const size = {
        x: clamp(0.52 + rng.range(0.22, 1.6) * (0.55 + chaos.density), 0.45, 2.85),
        y: clamp(0.35 + rng.range(0.1, 0.78) * (0.55 + chaos.jitter * 0.95), 0.3, 1.45),
        z: 0.1 + rng.range(0.02, 0.1),
      };

      const alongJitter = rng.range(-0.72, 0.72) * (0.4 + chaos.cluster * 1.08);
      const inwardJitter = rng.range(-0.48, 0.48) * (0.3 + chaos.jitter * 1.1);
      const center = {
        x: base.x + tangentX * alongJitter + forwardX * inwardJitter,
        y: Math.max(2.45, base.y + rng.range(-0.35, 1.05) * (0.65 + chaos.jitter * 0.85)),
        z: base.z + tangentZ * alongJitter + forwardZ * inwardJitter,
      };
      const yaw = baseYaw + rng.range(-1, 1) * (12 + 28 * chaos.jitter) * DEG_TO_RAD;

      pushInstance(batches.signage, center.x, center.y, center.z, size.x, size.y, size.z, yaw);
      continue;
    }

    if (type === "cover_cluster") {
      const rng = streamByType.cover.fork(anchor.id);
      const count = pickWeightedCount(
        rng,
        1.1 - chaos.cluster * 0.55,
        1.0,
        0.25 + chaos.cluster * 1.35,
      );
      const clusterRadius = 0.28 + chaos.cluster * 0.75;

      for (let i = 0; i < count; i += 1) {
        const pieceSeed = rng.fork(`piece-${i}`);
        const angle = pieceSeed.range(0, Math.PI * 2);
        const radius = pieceSeed.range(0.18, clusterRadius);
        const size = {
          x: pieceSeed.range(0.72, 1.34),
          y: pieceSeed.range(1.04, 1.32),
          z: pieceSeed.range(0.62, 1.18),
        };

        const center = {
          x: base.x + Math.cos(angle) * radius,
          y: size.y * 0.5,
          z: base.z + Math.sin(angle) * radius,
        };
        const yaw = baseYaw + pieceSeed.range(-1, 1) * (10 + 28 * chaos.jitter) * DEG_TO_RAD;
        placeCollidingBox(anchor.id, `cover-${i + 1}`, batches.cover, center, size, yaw);
      }
      continue;
    }

    if (type === "spawn_cover") {
      const rng = streamByType.spawnCover.fork(anchor.id);
      const count = rng.next() < 0.55 + chaos.cluster * 0.25 ? 2 : 1;
      const spread = 0.35 + 0.55 * chaos.cluster;

      for (let i = 0; i < count; i += 1) {
        const pieceRng = rng.fork(`piece-${i}`);
        const angle = pieceRng.range(0, Math.PI * 2);
        const radius = count === 1 ? 0 : pieceRng.range(0.2, spread);
        const size = {
          x: pieceRng.range(1.2, 1.9),
          y: pieceRng.range(1.0, 1.25),
          z: pieceRng.range(0.68, 1.15),
        };
        const center = {
          x: base.x + Math.cos(angle) * radius,
          y: size.y * 0.5,
          z: base.z + Math.sin(angle) * radius,
        };
        const yaw = baseYaw + pieceRng.range(-1, 1) * (9 + 18 * chaos.jitter) * DEG_TO_RAD;
        placeCollidingBox(anchor.id, `spawn-cover-${i + 1}`, batches.spawnCover, center, size, yaw);
      }
      continue;
    }

    if (type === "service_door_anchor") {
      const rng = streamByType.serviceDoor.fork(anchor.id);
      if (shouldDropDecorative(rng, chaos, 0.08)) {
        continue;
      }

      const size = {
        x: 0.86 + rng.range(-0.05, 0.05) * chaos.jitter,
        y: 2.2 + rng.range(-0.12, 0.12) * chaos.jitter,
        z: 0.12,
      };
      const center = {
        x: base.x + rng.range(-0.08, 0.08) * chaos.jitter,
        y: size.y * 0.5,
        z: base.z + rng.range(-0.2, 0.2) * chaos.jitter,
      };
      const yaw = baseYaw + rng.range(-1, 1) * (2 + 4 * chaos.jitter) * DEG_TO_RAD;
      pushInstance(batches.serviceDoor, center.x, center.y, center.z, size.x, size.y, size.z, yaw);
      continue;
    }

    if (type === "cloth_canopy_span") {
      const rng = streamByType.canopy.fork(anchor.id);
      if (shouldDropDecorative(rng, chaos, 0.02)) {
        continue;
      }

      if (anchor.endPos) {
        const end = {
          x: anchor.endPos.x,
          y: anchor.endPos.z,
          z: anchor.endPos.y,
        };
        const dx = end.x - base.x;
        const dz = end.z - base.z;
        const length = Math.max(0.25, Math.hypot(dx, dz));
        const yaw = Math.atan2(dz, dx) + rng.range(-1, 1) * (2 + 5 * chaos.jitter) * DEG_TO_RAD;
        const center = {
          x: (base.x + end.x) * 0.5 + rng.range(-0.18, 0.18) * chaos.jitter,
          y: (base.y + end.y) * 0.5 - rng.range(0.1, 0.28) * (0.4 + chaos.cluster),
          z: (base.z + end.z) * 0.5 + rng.range(-0.18, 0.18) * chaos.jitter,
        };
        const size = {
          x: length,
          y: 0.1 + rng.range(0, 0.06),
          z: clamp((anchor.heightM ?? 0.8) * (0.82 + rng.range(0, 0.4) * chaos.density), 0.4, 1.5),
        };
        pushInstance(batches.canopy, center.x, center.y, center.z, size.x, size.y, size.z, yaw);
      } else {
        const size = {
          x: clamp(anchor.widthM ?? 2.6, 1.8, 8),
          y: 0.12,
          z: 0.75 + rng.range(-0.1, 0.16) * chaos.jitter,
        };
        const center = {
          x: base.x + rng.range(-0.2, 0.2) * chaos.jitter,
          y: Math.max(3.2, base.y - rng.range(0.05, 0.2) * (0.4 + chaos.cluster)),
          z: base.z + rng.range(-0.2, 0.2) * chaos.jitter,
        };
        pushInstance(batches.canopy, center.x, center.y, center.z, size.x, size.y, size.z, baseYaw);
      }
      continue;
    }

    if (type === "hero_landmark") {
      const rng = streamByType.hero.fork(anchor.id);
      const structuralJitter = 0.06 + 0.1 * chaos.jitter;
      const yaw = baseYaw + rng.range(-1, 1) * 2.2 * DEG_TO_RAD;

      const pillarSize = {
        x: 0.8 + rng.range(-0.03, 0.03) * chaos.jitter,
        y: 4.8 + rng.range(-0.1, 0.12) * chaos.jitter,
        z: 0.8 + rng.range(-0.03, 0.03) * chaos.jitter,
      };
      const lintelSize = {
        x: 8,
        y: 0.65,
        z: 0.9,
      };
      const clearHalf = 3.0;
      const lateralOffset = clearHalf + pillarSize.x * 0.5;
      const rightX = Math.cos(yaw);
      const rightZ = -Math.sin(yaw);

      const leftPillarCenter = {
        x: base.x - rightX * lateralOffset + rng.range(-structuralJitter, structuralJitter),
        y: pillarSize.y * 0.5,
        z: base.z - rightZ * lateralOffset + rng.range(-structuralJitter, structuralJitter),
      };
      const rightPillarCenter = {
        x: base.x + rightX * lateralOffset + rng.range(-structuralJitter, structuralJitter),
        y: pillarSize.y * 0.5,
        z: base.z + rightZ * lateralOffset + rng.range(-structuralJitter, structuralJitter),
      };

      placeCollidingBox(anchor.id, "pillar-l", batches.heroPillar, leftPillarCenter, pillarSize, yaw);
      placeCollidingBox(anchor.id, "pillar-r", batches.heroPillar, rightPillarCenter, pillarSize, yaw);

      const lintelCenter = {
        x: base.x,
        y: pillarSize.y + lintelSize.y * 0.5,
        z: base.z,
      };
      pushInstance(
        batches.heroLintel,
        lintelCenter.x,
        lintelCenter.y,
        lintelCenter.z,
        lintelSize.x,
        lintelSize.y,
        lintelSize.z,
        yaw,
      );
      continue;
    }

    if (type === "landmark") {
      const rng = streamByType.landmark.fork(anchor.id);
      const size = {
        x: 1.8,
        y: 1.1 + rng.range(0, 0.2),
        z: 1.8,
      };
      const center = {
        x: base.x + rng.range(-0.06, 0.06) * chaos.jitter,
        y: size.y * 0.5,
        z: base.z + rng.range(-0.06, 0.06) * chaos.jitter,
      };
      const inClearZone = clearTravelRects.some((rect) => pointInRect2d(center.x, center.z, rect));

      pushInstance(batches.landmarkWell, center.x, center.y, center.z, 1.4, size.y, 1.4, rng.range(0, Math.PI));

      if (inClearZone) {
        stats.visualOnlyLandmarks += 1;
      } else {
        placeCollidingBox(anchor.id, "well", batches.cover, center, size, 0);
      }
      continue;
    }
  }

  // Side hall strips (x < 10 or x > 40) use larger, wall-aligned filler groups.
  // Main lane strips use the original small scattered pieces.
  const SIDE_HALL_X_MAX = 10.0;
  const SIDE_HALL_X_MIN = 40.0;

  for (const strip of stallStripRects) {
    const rng = streamByType.filler.fork(`${strip.x}:${strip.y}:${strip.w}:${strip.h}`);
    const isLongitudinal = strip.h >= strip.w;
    const stripCenterX = strip.x + strip.w * 0.5;
    const isSideHall = stripCenterX < SIDE_HALL_X_MAX || stripCenterX > SIDE_HALL_X_MIN;

    const stripDropoutChance = clamp(0.45 - chaos.density * 0.3 + (1 - chaos.cluster) * 0.07, 0.14, 0.5);
    if (rng.next() < stripDropoutChance) {
      continue;
    }

    const groupCountBase = 1 + Math.round(chaos.density * 0.9);
    const groupVariance = rng.int(0, 2 + Math.round(chaos.cluster * 1.4));
    const groupCount = clamp(groupCountBase + groupVariance - 1, 1, 3);
    const groupTs = sampleClusteredGroupTs(rng.fork("group-ts"), groupCount, chaos.cluster);

    for (let g = 0; g < groupTs.length; g += 1) {
      const groupRng = rng.fork(`group-${g}`);
      const pieces = pickWeightedCount(
        groupRng,
        1.15 - chaos.cluster * 0.38,
        0.72 + chaos.cluster * 0.55,
        0.08 + chaos.cluster * 0.55,
      );

      for (let p = 0; p < pieces; p += 1) {
        if (shouldDropDecorative(groupRng.fork(`drop-${p}`), chaos, 0.03)) {
          continue;
        }

        const pieceRng = groupRng.fork(`piece-${p}`);

        // Side hall fillers: larger crate/barrel groups, wall-aligned.
        const size = isSideHall
          ? {
              x: pieceRng.range(1.0, 1.8),
              y: pieceRng.range(0.55, 1.15),
              z: pieceRng.range(0.8, 1.2),
            }
          : {
              x: pieceRng.range(0.24, 0.62),
              y: pieceRng.range(0.28, 0.95),
              z: pieceRng.range(0.24, 0.62),
            };

        let centerX = strip.x + strip.w * 0.5;
        let centerZ = strip.y + strip.h * 0.5;

        // Side hall fillers hug the outer wall (within 0.4m of wall face).
        const sideOffset = isSideHall
          ? pieceRng.range(-0.15, 0.15) * chaos.jitter
          : pieceRng.range(-0.45, 0.45) * (0.2 + chaos.jitter * 0.7);
        const alongOffset = pieceRng.range(-1.05, 1.05) * (0.2 + (1 - chaos.cluster) * 0.58);

        if (isLongitudinal) {
          const outerX = stripCenterX < boundaryCenterX
            ? strip.x + STALL_FILLER_EDGE_PADDING_M
            : strip.x + strip.w - STALL_FILLER_EDGE_PADDING_M;
          centerX = outerX + sideOffset;
          centerZ = clamp(
            strip.y + strip.h * groupTs[g]! + alongOffset,
            strip.y + 0.45,
            strip.y + strip.h - 0.45,
          );
        } else {
          const outerZ = strip.y + strip.h * 0.5 < boundaryCenterZ
            ? strip.y + STALL_FILLER_EDGE_PADDING_M
            : strip.y + strip.h - STALL_FILLER_EDGE_PADDING_M;
          centerX = clamp(
            strip.x + strip.w * groupTs[g]! + alongOffset,
            strip.x + 0.45,
            strip.x + strip.w - 0.45,
          );
          centerZ = outerZ + sideOffset;
        }

        // Skip filler placement in open node exclusion zones.
        if (isNearOpenNode(centerX, centerZ)) {
          continue;
        }

        pushInstance(
          batches.filler,
          centerX,
          size.y * 0.5,
          centerZ,
          size.x,
          size.y,
          size.z,
          pieceRng.range(-1, 1) * (7 + chaos.jitter * 20) * DEG_TO_RAD,
        );
        stats.stallFillersPlaced += 1;
      }
    }
  }

  const instanceDummy = new Object3D();
  const orderedBatches = [
    batches.shopfront,
    batches.signage,
    batches.cover,
    batches.spawnCover,
    batches.serviceDoor,
    batches.canopy,
    batches.heroPillar,
    batches.heroLintel,
    batches.landmarkWell,
    batches.filler,
  ];

  for (const batch of orderedBatches) {
    if (batch.instances.length === 0) {
      continue;
    }

    const geometry = batch.createGeometry();
    const material = new MeshLambertMaterial({ color: batch.color });
    const mesh = new InstancedMesh(geometry, material, batch.instances.length);
    mesh.frustumCulled = false;
    mesh.name = batch.id;

    for (let i = 0; i < batch.instances.length; i += 1) {
      const instance = batch.instances[i]!;
      instanceDummy.position.set(instance.x, instance.y, instance.z);
      instanceDummy.rotation.set(0, instance.yawRad, 0);
      instanceDummy.scale.set(instance.sx, instance.sy, instance.sz);
      instanceDummy.updateMatrix();
      mesh.setMatrixAt(i, instanceDummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    root.add(mesh);
  }

  return {
    root,
    colliders,
    stats,
  };
}
