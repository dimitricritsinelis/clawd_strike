import type { MeshStandardMaterial, WebGLRenderer } from "three";

type MaterialShader = Parameters<NonNullable<MeshStandardMaterial["onBeforeCompile"]>>[0];

type FloorShaderTweakOptions = {
  albedoBoost: number;
  albedoGamma?: number;
  dustStrength?: number;
  macroColorAmplitude?: number;
  macroRoughnessAmplitude?: number;
  macroFrequency?: number;
  macroSeed?: number;
};

const UINT32_MAX = 0xffff_ffff;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return value;
}

function applyVertexWorldPositionVarying(shader: MaterialShader): void {
  if (!shader.vertexShader.includes("varying vec3 vFloorWorldPos;")) {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
varying vec3 vFloorWorldPos;`,
    );
  }

  if (!shader.vertexShader.includes("vFloorWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;")) {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
vFloorWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    );
  }
}

export function applyFloorShaderTweaks(
  material: MeshStandardMaterial,
  options: FloorShaderTweakOptions,
): void {
  const albedoBoost = clamp(toFiniteNumber(options.albedoBoost, 1), 0, 2);
  const albedoGamma = clamp(toFiniteNumber(options.albedoGamma, 1), 0.65, 1.25);
  const dustStrength = clamp(toFiniteNumber(options.dustStrength, 0), 0, 0.8);
  const macroColorAmplitude = clamp(toFiniteNumber(options.macroColorAmplitude, 0), 0, 0.25);
  const macroRoughnessAmplitude = clamp(toFiniteNumber(options.macroRoughnessAmplitude, 0), 0, 0.25);
  const macroFrequency = clamp(toFiniteNumber(options.macroFrequency, 0.08), 0.005, 2.5);
  const macroSeed = clamp(toFiniteNumber(options.macroSeed, 0), 0, UINT32_MAX);
  const macroEnabled = macroColorAmplitude > 1e-4 || macroRoughnessAmplitude > 1e-4;

  const previousOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader: MaterialShader, renderer: WebGLRenderer): void => {
    previousOnBeforeCompile.call(material, shader, renderer);

    shader.uniforms.uFloorAlbedoBoost = { value: albedoBoost };
    shader.uniforms.uFloorAlbedoGamma = { value: albedoGamma };
    shader.uniforms.uFloorDustStrength = { value: dustStrength };
    if (macroEnabled) {
      shader.uniforms.uFloorMacroColorAmplitude = { value: macroColorAmplitude };
      shader.uniforms.uFloorMacroRoughnessAmplitude = { value: macroRoughnessAmplitude };
      shader.uniforms.uFloorMacroFrequency = { value: macroFrequency };
      shader.uniforms.uFloorMacroSeed = { value: macroSeed };
      applyVertexWorldPositionVarying(shader);
    }

    if (!shader.fragmentShader.includes("uniform float uFloorAlbedoBoost;")) {
      const macroHeader = macroEnabled
        ? `
varying vec3 vFloorWorldPos;
uniform float uFloorMacroColorAmplitude;
uniform float uFloorMacroRoughnessAmplitude;
uniform float uFloorMacroFrequency;
uniform float uFloorMacroSeed;

float floorHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float floorValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 seedOffset = vec2(uFloorMacroSeed * 0.011, uFloorMacroSeed * 0.017);
  float a = floorHash12(i + seedOffset);
  float b = floorHash12(i + vec2(1.0, 0.0) + seedOffset);
  float c = floorHash12(i + vec2(0.0, 1.0) + seedOffset);
  float d = floorHash12(i + vec2(1.0, 1.0) + seedOffset);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float floorMacroNoise(vec2 worldXZ) {
  vec2 p = worldXZ * uFloorMacroFrequency;
  float low = floorValueNoise(p);
  float high = floorValueNoise(p * 0.47 + vec2(19.7, -13.3));
  return mix(low, high, 0.35);
}`
        : "";

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
uniform float uFloorAlbedoBoost;
uniform float uFloorAlbedoGamma;
uniform float uFloorDustStrength;
const vec3 uFloorDustColor = vec3(1.0, 0.96, 0.88);${macroHeader}`,
      );
    }

    if (!shader.fragmentShader.includes("diffuseColor.rgb = clamp(diffuseColor.rgb * uFloorAlbedoBoost")) {
      const mapPatch = macroEnabled
        ? `#include <map_fragment>
diffuseColor.rgb = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(uFloorAlbedoGamma));
diffuseColor.rgb = mix(diffuseColor.rgb, uFloorDustColor, uFloorDustStrength);
float floorMacro = floorMacroNoise(vFloorWorldPos.xz);
float floorMacroCentered = (floorMacro - 0.5) * 2.0;
float floorMacroColor = 1.0 + floorMacroCentered * uFloorMacroColorAmplitude;
diffuseColor.rgb = clamp(diffuseColor.rgb * uFloorAlbedoBoost * floorMacroColor, 0.0, 1.0);`
        : `#include <map_fragment>
diffuseColor.rgb = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(uFloorAlbedoGamma));
diffuseColor.rgb = mix(diffuseColor.rgb, uFloorDustColor, uFloorDustStrength);
diffuseColor.rgb = clamp(diffuseColor.rgb * uFloorAlbedoBoost, 0.0, 1.0);`;
      shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", mapPatch);
    }

    if (
      macroEnabled &&
      !shader.fragmentShader.includes("roughnessFactor = clamp(roughnessFactor + floorMacroCentered")
    ) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
roughnessFactor = clamp(
  roughnessFactor + floorMacroCentered * uFloorMacroRoughnessAmplitude,
  0.04,
  1.0
);`,
      );
    }
  };

  const previousProgramCacheKey = material.customProgramCacheKey.bind(material);
  const cacheKey = macroEnabled
    ? `floor-tweak:${albedoBoost.toFixed(3)}:${albedoGamma.toFixed(3)}:${dustStrength.toFixed(3)}:${macroColorAmplitude.toFixed(3)}:${macroRoughnessAmplitude.toFixed(3)}:${macroFrequency.toFixed(4)}:${macroSeed.toFixed(0)}`
    : `floor-tweak:${albedoBoost.toFixed(3)}:${albedoGamma.toFixed(3)}:${dustStrength.toFixed(3)}:flat`;
  material.customProgramCacheKey = (): string => `${previousProgramCacheKey()}|${cacheKey}`;
  material.needsUpdate = true;
}
