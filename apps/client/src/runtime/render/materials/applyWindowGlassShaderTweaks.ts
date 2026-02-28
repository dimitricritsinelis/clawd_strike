import type { MeshPhysicalMaterial, WebGLRenderer } from "three";

type MaterialShader = Parameters<NonNullable<MeshPhysicalMaterial["onBeforeCompile"]>>[0];

type WindowGlassShaderTweakOptions = {
  highVis: boolean;
};

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return value;
}

function applyVertexGlassVaryings(shader: MaterialShader): void {
  if (!shader.vertexShader.includes("varying vec3 vGlassWorldPos;")) {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
varying vec3 vGlassWorldPos;
varying vec3 vGlassWorldNormal;`,
    );
  }

  if (!shader.vertexShader.includes("vGlassWorldPos = worldPosition.xyz;")) {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
vGlassWorldPos = worldPosition.xyz;
vec3 glassObjectNormal = normal;
#ifdef USE_BATCHING
glassObjectNormal = mat3( batchingMatrix ) * glassObjectNormal;
#endif
#ifdef USE_INSTANCING
glassObjectNormal = mat3( instanceMatrix ) * glassObjectNormal;
#endif
vGlassWorldNormal = normalize( mat3( modelMatrix ) * glassObjectNormal );`,
    );
  }
}

export function applyWindowGlassShaderTweaks(
  material: MeshPhysicalMaterial,
  options: WindowGlassShaderTweakOptions,
): void {
  const highVis = Boolean(options.highVis);
  const gridCols = 2;
  const gridRows = 3;
  const lineWidth = 0.03;
  const lineFeather = 0.018;
  const borderFadeInner = 0.04;
  const borderFadeOuter = 0.13;
  const gridRoughnessBoost = 0.05;
  const smudgeRoughnessBoost = highVis ? 0.045 : 0.055;
  const smudgeStrength = highVis ? 0.48 : 0.58;
  const fresnelPower = highVis ? 3.5 : 4.0;
  const reflectStrength = highVis ? 0.52 : 0.58;
  const paneDarkening = highVis ? 0.08 : 0.10;
  const grimeDarkening = highVis ? 0.03 : 0.04;
  const groundColor: readonly [number, number, number] = highVis ? [0.82, 0.75, 0.63] : [0.78, 0.70, 0.58];
  const skyColor: readonly [number, number, number] = highVis ? [0.82, 0.90, 0.98] : [0.74, 0.85, 0.97];

  const previousOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader: MaterialShader, renderer: WebGLRenderer): void => {
    previousOnBeforeCompile.call(material, shader, renderer);

    applyVertexGlassVaryings(shader);

    if (!shader.fragmentShader.includes("varying vec3 vGlassWorldPos;")) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
varying vec3 vGlassWorldPos;
varying vec3 vGlassWorldNormal;

float glassHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float glassValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = glassHash12(i);
  float b = glassHash12(i + vec2(1.0, 0.0));
  float c = glassHash12(i + vec2(0.0, 1.0));
  float d = glassHash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}`,
      );
    }

    if (!shader.fragmentShader.includes("float glassGridMask = 0.0;")) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
float glassGridMask = 0.0;
float glassSmudge = 0.0;
#ifdef USE_UV
  vec2 glassUv = clamp(vUv, 0.0, 1.0);
  vec2 paneCount = vec2(${gridCols.toFixed(1)}, ${gridRows.toFixed(1)});
  vec2 cellUv = fract(glassUv * paneCount);
  vec2 lineDist = min(cellUv, 1.0 - cellUv);
  float lineMask = 1.0 - smoothstep(${lineWidth.toFixed(3)}, ${(lineWidth + lineFeather).toFixed(3)}, min(lineDist.x, lineDist.y));
  float borderDist = min(min(glassUv.x, 1.0 - glassUv.x), min(glassUv.y, 1.0 - glassUv.y));
  float borderFade = smoothstep(${borderFadeInner.toFixed(3)}, ${borderFadeOuter.toFixed(3)}, borderDist);
  glassGridMask = lineMask * borderFade;

  float smudgeLo = glassValueNoise(glassUv * 14.0 + vec2(3.1, 9.7));
  float smudgeHi = glassValueNoise(glassUv * 31.0 + vec2(-4.7, 12.4));
  float streakNoise = glassValueNoise(vec2(glassUv.x * 19.0 + smudgeHi * 1.8, glassUv.y * 3.8 + 27.1));
  float streaks = smoothstep(0.68, 0.97, streakNoise) * (1.0 - smoothstep(0.0, 0.22, glassUv.y));
  glassSmudge = clamp((smudgeLo * 0.55 + smudgeHi * 0.28 + streaks * 0.72) * ${smudgeStrength.toFixed(3)}, 0.0, 1.0);
#endif
roughnessFactor = clamp(
  roughnessFactor + glassGridMask * ${gridRoughnessBoost.toFixed(3)} + glassSmudge * ${smudgeRoughnessBoost.toFixed(3)},
  0.04,
  1.0
);`,
      );
    }

    if (!shader.fragmentShader.includes("vec3 worldV = normalize(cameraPosition - vGlassWorldPos);")) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        `vec3 worldN = normalize(vGlassWorldNormal);
vec3 worldV = normalize(cameraPosition - vGlassWorldPos);
float fresnel = pow(1.0 - saturate(dot(worldN, worldV)), ${fresnelPower.toFixed(3)});
vec3 reflectionDir = reflect(-worldV, worldN);
float reflectionMix = clamp(reflectionDir.y * 0.5 + 0.5, 0.0, 1.0);
vec3 groundColor = vec3(${groundColor[0].toFixed(3)}, ${groundColor[1].toFixed(3)}, ${groundColor[2].toFixed(3)});
vec3 skyColor = vec3(${skyColor[0].toFixed(3)}, ${skyColor[1].toFixed(3)}, ${skyColor[2].toFixed(3)});
vec3 fakeReflection = mix(groundColor, skyColor, reflectionMix);
float paneOcclusion = clamp(
  1.0 - glassGridMask * ${paneDarkening.toFixed(3)} - glassSmudge * ${grimeDarkening.toFixed(3)},
  0.72,
  1.0
);
outgoingLight *= paneOcclusion;
outgoingLight = mix(outgoingLight, fakeReflection, fresnel * ${reflectStrength.toFixed(3)});
#include <opaque_fragment>`,
      );
    }
  };

  const previousProgramCacheKey = material.customProgramCacheKey.bind(material);
  const cacheKey = [
    "window-glass",
    highVis ? "1" : "0",
    `${gridCols}x${gridRows}`,
    toFiniteNumber(lineWidth, 0).toFixed(3),
    toFiniteNumber(lineFeather, 0).toFixed(3),
    toFiniteNumber(reflectStrength, 0).toFixed(3),
    toFiniteNumber(fresnelPower, 0).toFixed(3),
    toFiniteNumber(gridRoughnessBoost, 0).toFixed(3),
    toFiniteNumber(smudgeRoughnessBoost, 0).toFixed(3),
    toFiniteNumber(paneDarkening, 0).toFixed(3),
    toFiniteNumber(grimeDarkening, 0).toFixed(3),
  ].join(":");
  material.customProgramCacheKey = (): string => `${previousProgramCacheKey()}|${cacheKey}`;
  material.needsUpdate = true;
}
