import {
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  NoColorSpace,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
} from "three";
import type { RuntimeAnchor, RuntimeAnchorsSpec } from "./types";
import { designToWorldVec3, designYawDegToWorldYawRad } from "./coordinateTransforms";
import { DeterministicRng } from "../utils/Rng";

type PalmTextureQuality = "1k" | "2k";
type FrondVariantId = "full" | "juvenile" | "torn" | "partial";

type PalmTextureSet = {
  albedo: string;
  normal: string;
  arm: string;
};

type PalmTextureVariants = {
  "1k": PalmTextureSet;
  "2k"?: PalmTextureSet;
};

type FrondGeometryProfile = {
  widthM: number;
  lengthM: number;
  archDepthM: number;
  tipScale: number;
  taperStrength: number;
  droopFactor: number;
};

type FrondVariantConfig = {
  id: FrondVariantId;
  textures: Record<PalmTextureQuality, PalmTextureSet>;
  geometry: FrondGeometryProfile;
  hueRange: readonly [number, number];
  saturationRange: readonly [number, number];
  lightnessRange: readonly [number, number];
  roughnessRange: readonly [number, number];
};

type FrondLayerConfig = {
  id: "outer" | "mid" | "inner";
  count: number | readonly [number, number];
  variantPool: readonly FrondVariantId[];
  pitchRange: readonly [number, number];
  twistRange: readonly [number, number];
  radialOffsetRange: readonly [number, number];
  heightOffsetRange: readonly [number, number];
  widthScaleRange: readonly [number, number];
  lengthScaleRange: readonly [number, number];
  bendScaleRange: readonly [number, number];
  yawJitterRad: number;
};

const BARK_TEXTURES: readonly PalmTextureVariants[] = [
  {
    "1k": {
      albedo: "/assets/textures/environment/bazaar/foliage/palms/palm_tree_bark/palm_tree_bark_diff_1k.jpg",
      normal: "/assets/textures/environment/bazaar/foliage/palms/palm_tree_bark/palm_tree_bark_nor_gl_1k.jpg",
      arm: "/assets/textures/environment/bazaar/foliage/palms/palm_tree_bark/palm_tree_bark_arm_1k.jpg",
    },
    "2k": {
      albedo: "/assets/textures/environment/bazaar/foliage/palms/palm_tree_bark/palm_tree_bark_diff_2k.jpg",
      normal: "/assets/textures/environment/bazaar/foliage/palms/palm_tree_bark/palm_tree_bark_nor_gl_2k.jpg",
      arm: "/assets/textures/environment/bazaar/foliage/palms/palm_tree_bark/palm_tree_bark_arm_2k.jpg",
    },
  },
  {
    "1k": {
      albedo: "/assets/textures/environment/bazaar/foliage/palms/palm_bark/palm_bark_diff_1k.jpg",
      normal: "/assets/textures/environment/bazaar/foliage/palms/palm_bark/palm_bark_nor_gl_1k.jpg",
      arm: "/assets/textures/environment/bazaar/foliage/palms/palm_bark/palm_bark_arm_1k.jpg",
    },
  },
];

const SHARED_FROND_DETAILS: Record<PalmTextureQuality, Pick<PalmTextureSet, "normal" | "arm">> = {
  "1k": {
    normal: "/assets/textures/environment/bazaar/foliage/palms/palm_frond_generated/palm_frond_nor_gl_1k.png",
    arm: "/assets/textures/environment/bazaar/foliage/palms/palm_frond_generated/palm_frond_arm_1k.png",
  },
  "2k": {
    normal: "/assets/textures/environment/bazaar/foliage/palms/palm_frond_generated/palm_frond_nor_gl_2k.png",
    arm: "/assets/textures/environment/bazaar/foliage/palms/palm_frond_generated/palm_frond_arm_2k.png",
  },
};

function createFrondTextureSet(
  oneKAlbedo: string,
  twoKAlbedo: string,
): Record<PalmTextureQuality, PalmTextureSet> {
  return {
    "1k": {
      albedo: oneKAlbedo,
      normal: SHARED_FROND_DETAILS["1k"].normal,
      arm: SHARED_FROND_DETAILS["1k"].arm,
    },
    "2k": {
      albedo: twoKAlbedo,
      normal: SHARED_FROND_DETAILS["2k"].normal,
      arm: SHARED_FROND_DETAILS["2k"].arm,
    },
  };
}

const FROND_VARIANTS: Record<FrondVariantId, FrondVariantConfig> = {
  full: {
    id: "full",
    textures: createFrondTextureSet(
      "/assets/textures/environment/bazaar/foliage/palms/palm_frond_generated/palm_frond_diff_1k.png",
      "/assets/textures/environment/bazaar/foliage/palms/palm_frond_generated/palm_frond_diff_2k.png",
    ),
    geometry: {
      widthM: 1.34,
      lengthM: 4.75,
      archDepthM: 0.38,
      tipScale: 0.16,
      taperStrength: 0.76,
      droopFactor: 0.56,
    },
    hueRange: [-0.010, 0.006],
    saturationRange: [-0.04, 0.03],
    lightnessRange: [-0.02, 0.02],
    roughnessRange: [-0.04, 0.03],
  },
  juvenile: {
    id: "juvenile",
    textures: createFrondTextureSet(
      "/assets/textures/environment/bazaar/foliage/palms/palm_frond_generated/palm_frond_juvenile_diff_1k.png",
      "/assets/textures/environment/bazaar/foliage/palms/palm_frond_generated/palm_frond_juvenile_diff_2k.png",
    ),
    geometry: {
      widthM: 0.9,
      lengthM: 3.8,
      archDepthM: 0.24,
      tipScale: 0.1,
      taperStrength: 0.84,
      droopFactor: 0.42,
    },
    hueRange: [-0.016, 0.004],
    saturationRange: [-0.02, 0.04],
    lightnessRange: [0.0, 0.05],
    roughnessRange: [-0.02, 0.04],
  },
  torn: {
    id: "torn",
    textures: createFrondTextureSet(
      "/assets/textures/environment/bazaar/foliage/palms/palm_frond_generated/palm_frond_torn_diff_1k.png",
      "/assets/textures/environment/bazaar/foliage/palms/palm_frond_generated/palm_frond_torn_diff_2k.png",
    ),
    geometry: {
      widthM: 1.18,
      lengthM: 4.3,
      archDepthM: 0.34,
      tipScale: 0.14,
      taperStrength: 0.8,
      droopFactor: 0.58,
    },
    hueRange: [-0.018, 0.0],
    saturationRange: [-0.08, 0.02],
    lightnessRange: [-0.04, 0.01],
    roughnessRange: [0.0, 0.07],
  },
  partial: {
    id: "partial",
    textures: createFrondTextureSet(
      "/assets/textures/environment/bazaar/foliage/palms/palm_frond_generated/palm_frond_partial_diff_1k.png",
      "/assets/textures/environment/bazaar/foliage/palms/palm_frond_generated/palm_frond_partial_diff_2k.png",
    ),
    geometry: {
      widthM: 1.02,
      lengthM: 3.35,
      archDepthM: 0.22,
      tipScale: 0.12,
      taperStrength: 0.82,
      droopFactor: 0.48,
    },
    hueRange: [-0.02, -0.004],
    saturationRange: [-0.1, 0.0],
    lightnessRange: [-0.05, -0.01],
    roughnessRange: [0.02, 0.09],
  },
};

const FROND_LAYERS: readonly FrondLayerConfig[] = [
  {
    id: "outer",
    count: 8,
    variantPool: ["full", "full", "torn", "partial", "full", "torn", "full", "partial"],
    pitchRange: [-1.26, -1.0],
    twistRange: [-0.22, 0.22],
    radialOffsetRange: [0.12, 0.2],
    heightOffsetRange: [-0.06, 0.04],
    widthScaleRange: [0.94, 1.08],
    lengthScaleRange: [0.94, 1.12],
    bendScaleRange: [0.92, 1.12],
    yawJitterRad: 0.14,
  },
  {
    id: "mid",
    count: 6,
    variantPool: ["full", "juvenile", "torn", "juvenile", "full", "partial"],
    pitchRange: [-0.98, -0.7],
    twistRange: [-0.26, 0.26],
    radialOffsetRange: [0.06, 0.14],
    heightOffsetRange: [0.02, 0.14],
    widthScaleRange: [0.88, 1.02],
    lengthScaleRange: [0.86, 1.0],
    bendScaleRange: [0.84, 1.0],
    yawJitterRad: 0.22,
  },
  {
    id: "inner",
    count: [4, 6],
    variantPool: ["juvenile", "juvenile", "partial", "juvenile", "full"],
    pitchRange: [-0.52, -0.2],
    twistRange: [-0.18, 0.18],
    radialOffsetRange: [0.0, 0.06],
    heightOffsetRange: [0.14, 0.28],
    widthScaleRange: [0.7, 0.9],
    lengthScaleRange: [0.72, 0.92],
    bendScaleRange: [0.56, 0.8],
    yawJitterRad: 0.3,
  },
];

const PLANTER_TRIM_TEXTURES: Record<PalmTextureQuality, PalmTextureSet> = {
  "1k": {
    albedo: "/assets/textures/environment/bazaar/walls/bazaar_wall_textures_pack_v5/white_sandstone_blocks_02/white_sandstone_blocks_02_diff_1k.jpg",
    normal: "/assets/textures/environment/bazaar/walls/bazaar_wall_textures_pack_v5/white_sandstone_blocks_02/white_sandstone_blocks_02_nor_gl_1k.jpg",
    arm: "/assets/textures/environment/bazaar/walls/bazaar_wall_textures_pack_v5/white_sandstone_blocks_02/white_sandstone_blocks_02_arm_1k.jpg",
  },
  "2k": {
    albedo: "/assets/textures/environment/bazaar/walls/bazaar_wall_textures_pack_v5/white_sandstone_blocks_02/white_sandstone_blocks_02_diff_2k.jpg",
    normal: "/assets/textures/environment/bazaar/walls/bazaar_wall_textures_pack_v5/white_sandstone_blocks_02/white_sandstone_blocks_02_nor_gl_2k.jpg",
    arm: "/assets/textures/environment/bazaar/walls/bazaar_wall_textures_pack_v5/white_sandstone_blocks_02/white_sandstone_blocks_02_arm_2k.jpg",
  },
};

const textureLoader = new TextureLoader();
const textureCache = new Map<string, Texture>();
const trunkMaterialCache = new Map<string, MeshStandardMaterial>();
const frondBaseMaterialCache = new Map<string, MeshStandardMaterial>();
const planterShellMaterialCache = new Map<string, MeshStandardMaterial>();
let planterSoilMaterial: MeshStandardMaterial | null = null;

const frondGeometryCache = new Map<string, PlaneGeometry>();

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function loadTexture(
  url: string,
  colorSpace: Texture["colorSpace"],
  repeat: Vector2 | null,
): Texture {
  const cacheKey = `${url}|${colorSpace}|${repeat ? `${repeat.x}:${repeat.y}` : "none"}`;
  const cached = textureCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const texture = textureLoader.load(url);
  texture.colorSpace = colorSpace;
  if (repeat) {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.copy(repeat);
  }
  texture.anisotropy = 4;
  textureCache.set(cacheKey, texture);
  return texture;
}

function resolveTextureVariant(variants: PalmTextureVariants, quality: PalmTextureQuality): PalmTextureSet {
  return variants[quality] ?? variants["1k"];
}

function getTrunkMaterial(
  variantIndex: number,
  quality: PalmTextureQuality,
  brightness: number,
): MeshStandardMaterial {
  const key = `${variantIndex}:${quality}:${brightness.toFixed(3)}`;
  const cached = trunkMaterialCache.get(key);
  if (cached) {
    return cached;
  }

  const textures = resolveTextureVariant(BARK_TEXTURES[variantIndex] ?? BARK_TEXTURES[0]!, quality);
  const material = new MeshStandardMaterial({
    color: brightness,
    map: loadTexture(textures.albedo, SRGBColorSpace, new Vector2(1.15, 4.8)),
    normalMap: loadTexture(textures.normal, NoColorSpace, new Vector2(1.15, 4.8)),
    normalScale: new Vector2(0.7, 0.7),
    roughnessMap: loadTexture(textures.arm, NoColorSpace, new Vector2(1.15, 4.8)),
    metalnessMap: loadTexture(textures.arm, NoColorSpace, new Vector2(1.15, 4.8)),
    roughness: 1,
    metalness: 0,
  });

  trunkMaterialCache.set(key, material);
  return material;
}

function getFrondBaseMaterial(quality: PalmTextureQuality, variantId: FrondVariantId): MeshStandardMaterial {
  const key = `${quality}:${variantId}`;
  const cached = frondBaseMaterialCache.get(key);
  if (cached) {
    return cached;
  }

  const textures = FROND_VARIANTS[variantId].textures[quality];
  const material = new MeshStandardMaterial({
    color: 0xffffff,
    map: loadTexture(textures.albedo, SRGBColorSpace, null),
    normalMap: loadTexture(textures.normal, NoColorSpace, null),
    normalScale: new Vector2(0.58, 0.58),
    roughnessMap: loadTexture(textures.arm, NoColorSpace, null),
    metalnessMap: loadTexture(textures.arm, NoColorSpace, null),
    roughness: 0.96,
    metalness: 0,
    side: DoubleSide,
    alphaTest: 0.34,
    dithering: true,
  });

  frondBaseMaterialCache.set(key, material);
  return material;
}

function createFrondMaterial(
  quality: PalmTextureQuality,
  variantId: FrondVariantId,
  rng: DeterministicRng,
): MeshStandardMaterial {
  const spec = FROND_VARIANTS[variantId];
  const material = getFrondBaseMaterial(quality, variantId).clone();
  material.color.offsetHSL(
    rng.range(spec.hueRange[0], spec.hueRange[1]),
    rng.range(spec.saturationRange[0], spec.saturationRange[1]),
    rng.range(spec.lightnessRange[0], spec.lightnessRange[1]),
  );
  material.roughness = clamp(0.96 + rng.range(spec.roughnessRange[0], spec.roughnessRange[1]), 0.72, 1.0);
  material.needsUpdate = true;
  return material;
}

function getPlanterShellMaterial(quality: PalmTextureQuality, sizeM: number): MeshStandardMaterial {
  const key = `${quality}:${sizeM.toFixed(2)}`;
  const cached = planterShellMaterialCache.get(key);
  if (cached) {
    return cached;
  }

  const textures = PLANTER_TRIM_TEXTURES[quality];
  const repeat = new Vector2(
    Math.max(1.2, sizeM / 0.9),
    1.18,
  );
  const material = new MeshStandardMaterial({
    color: 0xdbc49c,
    map: loadTexture(textures.albedo, SRGBColorSpace, repeat),
    normalMap: loadTexture(textures.normal, NoColorSpace, repeat),
    normalScale: new Vector2(0.42, 0.42),
    roughnessMap: loadTexture(textures.arm, NoColorSpace, repeat),
    metalnessMap: loadTexture(textures.arm, NoColorSpace, repeat),
    roughness: 0.94,
    metalness: 0,
  });

  planterShellMaterialCache.set(key, material);
  return material;
}

function getPlanterSoilMaterial(): MeshStandardMaterial {
  if (!planterSoilMaterial) {
    planterSoilMaterial = new MeshStandardMaterial({ color: 0x5c4330, roughness: 1.0, metalness: 0.0 });
  }
  return planterSoilMaterial;
}

function createFrondGeometry(profile: FrondGeometryProfile): PlaneGeometry {
  const geometry = new PlaneGeometry(profile.widthM, profile.lengthM, 8, 16);
  geometry.translate(0, profile.lengthM * 0.5, 0);

  const positions = geometry.attributes.position;
  if (!positions) {
    return geometry;
  }
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const t = Math.max(0, Math.min(1, y / profile.lengthM));
    const taper = Math.max(profile.tipScale, 1 - t * profile.taperStrength);
    const bend = Math.sin(Math.pow(t, 0.92) * Math.PI) * profile.archDepthM;
    const droop = t * t * profile.archDepthM * profile.droopFactor;
    positions.setX(index, x * taper);
    positions.setZ(index, bend - droop);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function getFrondGeometry(variantId: FrondVariantId): PlaneGeometry {
  const cached = frondGeometryCache.get(variantId);
  if (cached) {
    return cached;
  }
  const geometry = createFrondGeometry(FROND_VARIANTS[variantId].geometry);
  frondGeometryCache.set(variantId, geometry);
  return geometry;
}

function createPlanterGroup(sizeM: number, quality: PalmTextureQuality): Group {
  const root = new Group();
  root.name = "decorative-palm-planter";

  const outer = new Mesh(new BoxGeometry(sizeM, 0.68, sizeM), getPlanterShellMaterial(quality, sizeM));
  outer.position.y = 0.34;
  outer.castShadow = true;
  outer.receiveShadow = true;
  root.add(outer);

  const soil = new Mesh(new BoxGeometry(sizeM * 0.72, 0.18, sizeM * 0.72), getPlanterSoilMaterial());
  soil.position.y = 0.62;
  soil.castShadow = false;
  soil.receiveShadow = true;
  root.add(soil);

  return root;
}

function resolveLayerCount(layer: FrondLayerConfig, rng: DeterministicRng): number {
  if (typeof layer.count === "number") {
    return layer.count;
  }
  return rng.int(layer.count[0], layer.count[1] + 1);
}

function createFrondPivot(
  quality: PalmTextureQuality,
  layer: FrondLayerConfig,
  azimuthRad: number,
  variantId: FrondVariantId,
  rng: DeterministicRng,
): Group {
  const pivot = new Group();
  pivot.rotation.y = azimuthRad;
  pivot.position.y = rng.range(layer.heightOffsetRange[0], layer.heightOffsetRange[1]);

  const frond = new Mesh(getFrondGeometry(variantId), createFrondMaterial(quality, variantId, rng));
  frond.rotation.order = "XYZ";
  frond.rotation.x = rng.range(layer.pitchRange[0], layer.pitchRange[1]);
  frond.rotation.y = rng.range(-0.08, 0.08);
  frond.rotation.z = rng.range(layer.twistRange[0], layer.twistRange[1]);
  frond.position.z = rng.range(layer.radialOffsetRange[0], layer.radialOffsetRange[1]);
  frond.scale.set(
    rng.range(layer.widthScaleRange[0], layer.widthScaleRange[1]),
    rng.range(layer.lengthScaleRange[0], layer.lengthScaleRange[1]),
    rng.range(layer.bendScaleRange[0], layer.bendScaleRange[1]),
  );
  frond.castShadow = false;
  frond.receiveShadow = true;

  pivot.add(frond);
  return pivot;
}

function populateCrown(frondRoot: Group, quality: PalmTextureQuality, rngRoot: DeterministicRng): void {
  for (const layer of FROND_LAYERS) {
    const layerRng = rngRoot.fork(`layer:${layer.id}`);
    const count = resolveLayerCount(layer, layerRng);

    for (let index = 0; index < count; index += 1) {
      const frondRng = layerRng.fork(`frond:${index}`);
      const variantId = layer.variantPool[frondRng.int(0, layer.variantPool.length)] ?? "full";
      const azimuth = (index / count) * Math.PI * 2 + frondRng.range(-layer.yawJitterRad, layer.yawJitterRad);
      frondRoot.add(createFrondPivot(quality, layer, azimuth, variantId, frondRng));
    }
  }
}

function createPalm(anchor: RuntimeAnchor, seed: number, quality: PalmTextureQuality): Group {
  const rng = new DeterministicRng(seed).fork(anchor.id);
  const worldPos = designToWorldVec3(anchor.pos);
  const baseYaw = designYawDegToWorldYawRad(anchor.yawDeg);
  const planterSize = anchor.widthM ?? 1.8;
  const totalHeight = anchor.heightM ?? 6.4;
  const trunkHeight = Math.max(4.4, totalHeight - rng.range(0.85, 1.25));
  const trunkRadiusTop = rng.range(0.12, 0.16);
  const trunkRadiusBottom = rng.range(0.19, 0.24);
  const barkVariant = rng.int(0, BARK_TEXTURES.length);
  const trunkColor = barkVariant === 0 ? 0xd8ccb3 : 0xc9b18e;

  const root = new Group();
  root.name = `decorative-palm-${anchor.id}`;
  root.position.set(worldPos.x, Math.max(0, worldPos.y), worldPos.z);
  root.rotation.y = baseYaw;

  const planter = createPlanterGroup(planterSize, quality);
  root.add(planter);

  const trunk = new Mesh(
    new CylinderGeometry(trunkRadiusTop, trunkRadiusBottom, trunkHeight, 10, 18, false),
    getTrunkMaterial(barkVariant, quality, trunkColor),
  );
  trunk.position.y = 0.68 + trunkHeight * 0.5;
  trunk.rotation.y = rng.range(-0.08, 0.08);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  root.add(trunk);

  const frondRoot = new Group();
  frondRoot.name = `${anchor.id}-fronds`;
  frondRoot.position.y = 0.68 + trunkHeight;
  frondRoot.rotation.y = rng.range(0, Math.PI * 2);
  root.add(frondRoot);

  populateCrown(frondRoot, quality, rng.fork("crown"));
  return root;
}

export function buildDecorativePalms(
  anchors: RuntimeAnchorsSpec | null,
  seed: number,
  quality: PalmTextureQuality,
): Group | null {
  if (!anchors) {
    return null;
  }

  const palmAnchors = anchors.anchors
    .filter((anchor) => anchor.type.toLowerCase() === "decorative_palm")
    .sort((left, right) => left.id.localeCompare(right.id));

  if (palmAnchors.length === 0) {
    return null;
  }

  const root = new Group();
  root.name = "decorative-palms";

  for (const anchor of palmAnchors) {
    root.add(createPalm(anchor, seed, quality));
  }

  return root;
}
