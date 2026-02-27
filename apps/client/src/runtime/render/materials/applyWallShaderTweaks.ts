import type { MeshStandardMaterial, WebGLRenderer } from "three";

type MaterialShader = Parameters<NonNullable<MeshStandardMaterial["onBeforeCompile"]>>[0];

type WallShaderUvOffset = {
  x: number;
  y: number;
};

type WallShaderTweakOptions = {
  albedoBoost: number;
  macroColorAmplitude?: number;
  macroRoughnessAmplitude?: number;
  macroFrequency?: number;
  macroSeed?: number;
  tileSizeM?: number;
  uvOffset?: WallShaderUvOffset;
};

const UINT32_MAX = 0xffff_ffff;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return value;
}

function applyVertexWallProjection(shader: MaterialShader): void {
  if (!shader.vertexShader.includes("uniform float uWallTileSizeM;")) {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
varying vec3 vWallWorldPos;
uniform float uWallTileSizeM;
uniform vec2 uWallUvOffset;`,
    );
  }

  if (!shader.vertexShader.includes("vec2 wallProjectedUv = vec2(wallProjectedU, vWallWorldPos.y)")) {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
vWallWorldPos = worldPosition.xyz;
vec3 wallObjectNormal = normal;
#ifdef USE_INSTANCING
wallObjectNormal = mat3(instanceMatrix) * wallObjectNormal;
#endif
vec3 wallWorldNormal = normalize(mat3(modelMatrix) * wallObjectNormal);
float wallProjectedU = abs(wallWorldNormal.x) > abs(wallWorldNormal.z) ? vWallWorldPos.z : vWallWorldPos.x;
vec2 wallProjectedUv = vec2(wallProjectedU, vWallWorldPos.y) / max(uWallTileSizeM, 0.001) + uWallUvOffset;
#if defined( USE_UV ) || defined( USE_ANISOTROPY )
vUv = wallProjectedUv;
#endif
#ifdef USE_MAP
vMapUv = wallProjectedUv;
#endif
#ifdef USE_AOMAP
vAoMapUv = wallProjectedUv;
#endif
#ifdef USE_NORMALMAP
vNormalMapUv = wallProjectedUv;
#endif
#ifdef USE_ROUGHNESSMAP
vRoughnessMapUv = wallProjectedUv;
#endif
#ifdef USE_METALNESSMAP
vMetalnessMapUv = wallProjectedUv;
#endif
#ifdef USE_BUMPMAP
vBumpMapUv = wallProjectedUv;
#endif`,
    );
  }
}

export function applyWallShaderTweaks(
  material: MeshStandardMaterial,
  options: WallShaderTweakOptions,
): void {
  const albedoBoost = clamp(toFiniteNumber(options.albedoBoost, 1), 0, 2);
  const macroColorAmplitude = clamp(toFiniteNumber(options.macroColorAmplitude, 0), 0, 0.25);
  const macroRoughnessAmplitude = clamp(toFiniteNumber(options.macroRoughnessAmplitude, 0), 0, 0.25);
  const macroFrequency = clamp(toFiniteNumber(options.macroFrequency, 0.06), 0.005, 2.5);
  const macroSeed = clamp(toFiniteNumber(options.macroSeed, 0), 0, UINT32_MAX);
  const tileSizeM = clamp(toFiniteNumber(options.tileSizeM, 2), 0.05, 64);
  const uvOffsetX = clamp(toFiniteNumber(options.uvOffset?.x, 0), -64, 64);
  const uvOffsetY = clamp(toFiniteNumber(options.uvOffset?.y, 0), -64, 64);
  const macroEnabled = macroColorAmplitude > 1e-4 || macroRoughnessAmplitude > 1e-4;

  const previousOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader: MaterialShader, renderer: WebGLRenderer): void => {
    previousOnBeforeCompile.call(material, shader, renderer);

    applyVertexWallProjection(shader);
    shader.uniforms.uWallTileSizeM = { value: tileSizeM };
    shader.uniforms.uWallUvOffset = { value: { x: uvOffsetX, y: uvOffsetY } };
    shader.uniforms.uWallAlbedoBoost = { value: albedoBoost };
    if (macroEnabled) {
      shader.uniforms.uWallMacroColorAmplitude = { value: macroColorAmplitude };
      shader.uniforms.uWallMacroRoughnessAmplitude = { value: macroRoughnessAmplitude };
      shader.uniforms.uWallMacroFrequency = { value: macroFrequency };
      shader.uniforms.uWallMacroSeed = { value: macroSeed };
    }

    if (!shader.fragmentShader.includes("uniform float uWallAlbedoBoost;")) {
      const macroHeader = macroEnabled
        ? `
varying vec3 vWallWorldPos;
uniform float uWallMacroColorAmplitude;
uniform float uWallMacroRoughnessAmplitude;
uniform float uWallMacroFrequency;
uniform float uWallMacroSeed;

float wallHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float wallValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 seedOffset = vec2(uWallMacroSeed * 0.011, uWallMacroSeed * 0.017);
  float a = wallHash12(i + seedOffset);
  float b = wallHash12(i + vec2(1.0, 0.0) + seedOffset);
  float c = wallHash12(i + vec2(0.0, 1.0) + seedOffset);
  float d = wallHash12(i + vec2(1.0, 1.0) + seedOffset);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float wallMacroNoise(vec2 wallMacroUv) {
  vec2 p = wallMacroUv * uWallMacroFrequency;
  float low = wallValueNoise(p);
  float high = wallValueNoise(p * 0.47 + vec2(19.7, -13.3));
  return mix(low, high, 0.35);
}`
        : "";

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
uniform float uWallAlbedoBoost;${macroHeader}`,
      );
    }

    if (!shader.fragmentShader.includes("diffuseColor.rgb = clamp(diffuseColor.rgb * uWallAlbedoBoost")) {
      const mapPatch = macroEnabled
        ? `#include <map_fragment>
vec2 wallMacroUv = vec2(vWallWorldPos.x + vWallWorldPos.z, vWallWorldPos.y);
float wallMacro = wallMacroNoise(wallMacroUv);
float wallMacroCentered = (wallMacro - 0.5) * 2.0;
float wallMacroColor = 1.0 + wallMacroCentered * uWallMacroColorAmplitude;
diffuseColor.rgb = clamp(diffuseColor.rgb * uWallAlbedoBoost * wallMacroColor, 0.0, 1.0);`
        : `#include <map_fragment>
diffuseColor.rgb = clamp(diffuseColor.rgb * uWallAlbedoBoost, 0.0, 1.0);`;
      shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", mapPatch);
    }

    if (
      macroEnabled &&
      !shader.fragmentShader.includes("roughnessFactor = clamp(roughnessFactor + wallMacroCentered")
    ) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
roughnessFactor = clamp(
  roughnessFactor + wallMacroCentered * uWallMacroRoughnessAmplitude,
  0.04,
  1.0
);`,
      );
    }
  };

  const previousProgramCacheKey = material.customProgramCacheKey.bind(material);
  const cacheKey = macroEnabled
    ? `wall-tweak:${albedoBoost.toFixed(3)}:${macroColorAmplitude.toFixed(3)}:${macroRoughnessAmplitude.toFixed(3)}:${macroFrequency.toFixed(4)}:${macroSeed.toFixed(0)}:${tileSizeM.toFixed(3)}:${uvOffsetX.toFixed(3)}:${uvOffsetY.toFixed(3)}`
    : `wall-tweak:${albedoBoost.toFixed(3)}:flat:${tileSizeM.toFixed(3)}:${uvOffsetX.toFixed(3)}:${uvOffsetY.toFixed(3)}`;
  material.customProgramCacheKey = (): string => `${previousProgramCacheKey()}|${cacheKey}`;
  material.needsUpdate = true;
}
