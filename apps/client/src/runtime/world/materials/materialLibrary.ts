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
  envMapIntensity: number;
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
    envMapIntensity: 0.25,
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
    envMapIntensity: 0.25,
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
    envMapIntensity: 0.3,
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
    envMapIntensity: 0.2,
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
    envMapIntensity: 0.15,
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
    envMapIntensity: 0.2,
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
    envMapIntensity: 0.1,
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
    envMapIntensity: 0.5,
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
    envMapIntensity: 0.1,
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
    envMapIntensity: 0.1,
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
    envMapIntensity: 0.15,
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
    envMapIntensity: 0.1,
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
    envMapIntensity: 0.4,
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
    envMapIntensity: 0.8,
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
    envMapIntensity: 0.3,
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
    envMapIntensity: 0.1,
    style: "sand"
  }
};

export class MaterialLibrary {
  private readonly highQuality: boolean;
  private readonly cache = new Map<string, THREE.MeshStandardMaterial>();

  constructor(highQuality: boolean) {
    this.highQuality = highQuality;
  }

  get(kind: WorldMaterialKind, seedKey: string, repeatX: number, repeatY: number): THREE.MeshStandardMaterial {
    const repeatStep = this.highQuality ? 0.25 : 0.5;
    const quantize = (v: number) => Math.max(repeatStep, Math.round(v / repeatStep) * repeatStep);
    const repeatXQ = quantize(repeatX);
    const repeatYQ = quantize(repeatY);
    const key = `${kind}:${seedKey}:${repeatXQ.toFixed(2)}:${repeatYQ.toFixed(2)}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const preset = PRESETS[kind];
    const pbr = createProceduralPbr({
      seedKey: `${seedKey}:${kind}`,
      baseColor: preset.baseColor,
      contrast: preset.contrast,
      grime: preset.grime,
      style: preset.style,
      tileSize: this.highQuality ? 512 : 256
    });

    pbr.map.repeat.set(repeatXQ, repeatYQ);
    pbr.roughnessMap.repeat.set(repeatXQ, repeatYQ);
    pbr.normalMap.repeat.set(repeatXQ, repeatYQ);
    pbr.aoMap.repeat.set(repeatXQ, repeatYQ);

    const material = new THREE.MeshStandardMaterial({
      map: pbr.map,
      roughnessMap: pbr.roughnessMap,
      normalMap: pbr.normalMap,
      normalScale: new THREE.Vector2(preset.normalScale, preset.normalScale),
      roughness: preset.roughness,
      metalness: preset.metalness,
      aoMap: pbr.aoMap,
      aoMapIntensity: preset.aoIntensity,
      envMapIntensity: preset.envMapIntensity
    });

    if (this.highQuality) {
      material.onBeforeCompile = (shader) => {
        // Inject world-space noise to break tiling on large surfaces
        shader.vertexShader = shader.vertexShader.replace(
          "#include <common>",
          "varying vec3 vWorldPos;\n#include <common>"
        );
        shader.vertexShader = shader.vertexShader.replace(
          "#include <worldpos_vertex>",
          "#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;"
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <common>",
          `varying vec3 vWorldPos;
float macroNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
  float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
#include <common>`
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <map_fragment>",
          `#include <map_fragment>
{
  float n = macroNoise(vWorldPos.xz * 0.05) * 2.0 - 1.0;
  diffuseColor.rgb *= 1.0 + n * 0.08;
}`
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <roughnessmap_fragment>",
          `#include <roughnessmap_fragment>
{
  float nr = macroNoise(vWorldPos.xz * 0.04 + 73.1) * 2.0 - 1.0;
  roughnessFactor = clamp(roughnessFactor + nr * 0.04, 0.0, 1.0);
}`
        );
      };
    }

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
