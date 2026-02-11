import * as THREE from "three";

import { createProceduralPbr } from "./proceduralPbr";

export type WorldMaterialKind =
  | "wall"
  | "plaster"
  | "concrete"
  | "brick"
  | "floor"
  | "cobble"
  | "cloth"
  | "ceramic"
  | "reed"
  | "rug"
  | "produce"
  | "spice"
  | "trim"
  | "metal"
  | "wood"
  | "sand";

type MaterialPreset = Readonly<{
  baseColor: readonly [number, number, number];
  contrast: number;
  grime: number;
  roughness: number;
  metalness: number;
  normalScale: number;
  aoIntensity: number;
  style: "default" | "stucco" | "cobble" | "tile" | "cloth" | "wood" | "sand" | "metal" | "rug";
}>;

const PRESETS: Readonly<Record<WorldMaterialKind, MaterialPreset>> = {
  wall: {
    baseColor: [196, 162, 118],
    contrast: 32,
    grime: 0.82,
    roughness: 0.92,
    metalness: 0.01,
    normalScale: 1.0,
    aoIntensity: 0.65,
    style: "stucco"
  },
  plaster: {
    baseColor: [208, 192, 168],
    contrast: 26,
    grime: 0.72,
    roughness: 0.94,
    metalness: 0.01,
    normalScale: 0.8,
    aoIntensity: 0.55,
    style: "stucco"
  },
  concrete: {
    baseColor: [148, 136, 118],
    contrast: 30,
    grime: 0.78,
    roughness: 0.9,
    metalness: 0.02,
    normalScale: 0.9,
    aoIntensity: 0.6,
    style: "default"
  },
  brick: {
    baseColor: [168, 128, 96],
    contrast: 35,
    grime: 0.82,
    roughness: 0.88,
    metalness: 0.01,
    normalScale: 1.1,
    aoIntensity: 0.7,
    style: "cobble"
  },
  floor: {
    baseColor: [172, 144, 104],
    contrast: 38,
    grime: 0.85,
    roughness: 0.93,
    metalness: 0.01,
    normalScale: 0.95,
    aoIntensity: 0.6,
    style: "sand"
  },
  cobble: {
    baseColor: [168, 132, 92],
    contrast: 34,
    grime: 0.88,
    roughness: 0.92,
    metalness: 0.01,
    normalScale: 1.2,
    aoIntensity: 0.75,
    style: "cobble"
  },
  cloth: {
    baseColor: [170, 122, 75],
    contrast: 28,
    grime: 0.6,
    roughness: 0.96,
    metalness: 0.01,
    normalScale: 0.55,
    aoIntensity: 0.35,
    style: "cloth"
  },
  ceramic: {
    baseColor: [186, 164, 140],
    contrast: 22,
    grime: 0.42,
    roughness: 0.42,
    metalness: 0.04,
    normalScale: 0.35,
    aoIntensity: 0.4,
    style: "tile"
  },
  reed: {
    baseColor: [158, 134, 88],
    contrast: 26,
    grime: 0.4,
    roughness: 0.93,
    metalness: 0.01,
    normalScale: 0.65,
    aoIntensity: 0.4,
    style: "cloth"
  },
  rug: {
    baseColor: [138, 58, 48],
    contrast: 34,
    grime: 0.55,
    roughness: 0.88,
    metalness: 0.01,
    normalScale: 0.45,
    aoIntensity: 0.35,
    style: "rug"
  },
  produce: {
    baseColor: [150, 85, 50],
    contrast: 32,
    grime: 0.3,
    roughness: 0.7,
    metalness: 0.02,
    normalScale: 0.35,
    aoIntensity: 0.3,
    style: "default"
  },
  spice: {
    baseColor: [185, 92, 48],
    contrast: 34,
    grime: 0.28,
    roughness: 0.84,
    metalness: 0.01,
    normalScale: 0.5,
    aoIntensity: 0.3,
    style: "sand"
  },
  trim: {
    baseColor: [68, 120, 132],
    contrast: 42,
    grime: 0.6,
    roughness: 0.68,
    metalness: 0.06,
    normalScale: 0.8,
    aoIntensity: 0.55,
    style: "tile"
  },
  metal: {
    baseColor: [98, 97, 93],
    contrast: 28,
    grime: 0.62,
    roughness: 0.55,
    metalness: 0.62,
    normalScale: 0.7,
    aoIntensity: 0.5,
    style: "metal"
  },
  wood: {
    baseColor: [112, 82, 54],
    contrast: 34,
    grime: 0.7,
    roughness: 0.82,
    metalness: 0.03,
    normalScale: 0.85,
    aoIntensity: 0.55,
    style: "wood"
  },
  sand: {
    baseColor: [185, 156, 112],
    contrast: 26,
    grime: 0.48,
    roughness: 0.96,
    metalness: 0,
    normalScale: 0.55,
    aoIntensity: 0.35,
    style: "sand"
  }
};

export class MaterialLibrary {
  private readonly cache = new Map<string, THREE.MeshStandardMaterial>();

  get(kind: WorldMaterialKind, seedKey: string, repeatX: number, repeatY: number): THREE.MeshStandardMaterial {
    const key = `${kind}:${seedKey}:${repeatX.toFixed(3)}:${repeatY.toFixed(3)}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const preset = PRESETS[kind];
    const pbr = createProceduralPbr({
      seedKey: `${seedKey}:${kind}`,
      baseColor: preset.baseColor,
      contrast: preset.contrast,
      grime: preset.grime,
      style: preset.style
    });

    pbr.map.repeat.set(repeatX, repeatY);
    pbr.roughnessMap.repeat.set(repeatX, repeatY);
    pbr.normalMap.repeat.set(repeatX, repeatY);
    pbr.aoMap.repeat.set(repeatX, repeatY);

    const material = new THREE.MeshStandardMaterial({
      map: pbr.map,
      roughnessMap: pbr.roughnessMap,
      normalMap: pbr.normalMap,
      normalScale: new THREE.Vector2(preset.normalScale, preset.normalScale),
      roughness: preset.roughness,
      metalness: preset.metalness,
      aoMap: pbr.aoMap,
      aoMapIntensity: preset.aoIntensity
    });

    this.cache.set(key, material);
    return material;
  }

  dispose() {
    for (const mat of this.cache.values()) {
      mat.map?.dispose();
      mat.roughnessMap?.dispose();
      mat.normalMap?.dispose();
      mat.aoMap?.dispose();
      mat.dispose();
    }
    this.cache.clear();
  }
}
