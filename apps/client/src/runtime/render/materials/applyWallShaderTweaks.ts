import { Color, type MeshStandardMaterial, type WebGLRenderer } from "three";

type MaterialShader = Parameters<NonNullable<MeshStandardMaterial["onBeforeCompile"]>>[0];

type WallShaderUvOffset = {
  x: number;
  y: number;
};

export type WallShaderTweakOptions = {
  albedoBoost: number;
  macroColorAmplitude?: number;
  macroRoughnessAmplitude?: number;
  macroFrequency?: number;
  macroSeed?: number;
  tileSizeM?: number;
  uvOffset?: WallShaderUvOffset;
  dirtEnabled?: boolean;
  dirtHeightM?: number;
  dirtDarken?: number;
  dirtRoughnessBoost?: number;
  floorTopY?: number;
  topBleachAmount?: number;
  topBleachStartY?: number;
  topBleachHeightM?: number;
  topBleachColor?: string | number;
  dustColor?: string | number;
  dustColorAmount?: number;
  contactDarkenAmount?: number;
  contactDarkenDepth?: number;
  useLocalCoords?: boolean;
};

const UINT32_MAX = 0xffff_ffff;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return value;
}

function resolveColor(value: string | number | undefined, fallbackHex: number): Color {
  return new Color(value ?? fallbackHex);
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

  if (!shader.vertexShader.includes("float wallNormalY = abs(wallWorldNormal.y);")) {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
{
  vec4 wallWp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wallWp = instanceMatrix * wallWp;
  #endif
  wallWp = modelMatrix * wallWp;
  vWallWorldPos = wallWp.xyz;
}
vec3 wallObjectNormal = normal;
#ifdef USE_INSTANCING
wallObjectNormal = mat3(instanceMatrix) * wallObjectNormal;
#endif
vec3 wallWorldNormal = normalize(mat3(modelMatrix) * wallObjectNormal);
float wallNormalY = abs(wallWorldNormal.y);
float wallNormalX = abs(wallWorldNormal.x);
float wallNormalZ = abs(wallWorldNormal.z);
vec2 wallProjectedUv;
if (wallNormalY >= wallNormalX && wallNormalY >= wallNormalZ) {
  wallProjectedUv = vec2(vWallWorldPos.x, vWallWorldPos.z) / max(uWallTileSizeM, 0.001) + uWallUvOffset;
} else {
  float wallProjectedU = wallNormalX > wallNormalZ ? vWallWorldPos.z : vWallWorldPos.x;
  wallProjectedUv = vec2(wallProjectedU, vWallWorldPos.y) / max(uWallTileSizeM, 0.001) + uWallUvOffset;
}
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

  const dirtEnabled = options.dirtEnabled === true;
  const dirtHeightM = clamp(toFiniteNumber(options.dirtHeightM, 0.8), 0.1, 4);
  const dirtDarken = clamp(toFiniteNumber(options.dirtDarken, 0.15), 0, 0.5);
  const dirtRoughnessBoost = clamp(toFiniteNumber(options.dirtRoughnessBoost, 0.08), 0, 0.3);
  const floorTopY = toFiniteNumber(options.floorTopY, 0);
  const topBleachAmount = clamp(toFiniteNumber(options.topBleachAmount, 0), 0, 0.2);
  const topBleachStartY = toFiniteNumber(options.topBleachStartY, 2.4);
  const topBleachHeightM = clamp(toFiniteNumber(options.topBleachHeightM, 2.6), 0.1, 12);
  const topBleachColor = resolveColor(options.topBleachColor, 0xf4ead8);
  const dustColorAmount = clamp(toFiniteNumber(options.dustColorAmount, 0), 0, 0.2);
  const dustColor = resolveColor(options.dustColor, 0xd6c2a4);
  const contactDarkenAmount = clamp(toFiniteNumber(options.contactDarkenAmount, 0), 0, 0.25);
  const contactDarkenDepth = clamp(toFiniteNumber(options.contactDarkenDepth, 0.14), 0.02, 0.5);
  const topBleachEnabled = topBleachAmount > 1e-4;
  const dustTintEnabled = dustColorAmount > 1e-4;
  const contactDarkenEnabled = contactDarkenAmount > 1e-4;
  const needsGroundBand = dirtEnabled || dustTintEnabled;
  const needsWorldPos = macroEnabled || needsGroundBand || topBleachEnabled;
  const needsLocalCoords = options.useLocalCoords === true && contactDarkenEnabled;

  const previousOnBeforeCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader: MaterialShader, renderer: WebGLRenderer): void => {
    previousOnBeforeCompile.call(material, shader, renderer);

    applyVertexWallProjection(shader);
    if (needsLocalCoords && !shader.vertexShader.includes("varying vec3 vWallLocalPos;")) {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `#include <common>
varying vec3 vWallLocalPos;`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vWallLocalPos = position;`,
      );
    }
    shader.uniforms.uWallTileSizeM = { value: tileSizeM };
    shader.uniforms.uWallUvOffset = { value: { x: uvOffsetX, y: uvOffsetY } };
    shader.uniforms.uWallAlbedoBoost = { value: albedoBoost };
    if (macroEnabled) {
      shader.uniforms.uWallMacroColorAmplitude = { value: macroColorAmplitude };
      shader.uniforms.uWallMacroRoughnessAmplitude = { value: macroRoughnessAmplitude };
      shader.uniforms.uWallMacroFrequency = { value: macroFrequency };
      shader.uniforms.uWallMacroSeed = { value: macroSeed };
    }
    if (needsGroundBand) {
      shader.uniforms.uWallFloorTopY = { value: floorTopY };
      shader.uniforms.uWallDirtHeightM = { value: dirtHeightM };
    }
    if (dirtEnabled) {
      shader.uniforms.uWallDirtDarken = { value: dirtDarken };
      shader.uniforms.uWallDirtRoughnessBoost = { value: dirtRoughnessBoost };
    }
    if (dustTintEnabled) {
      shader.uniforms.uWallDustColor = { value: dustColor };
      shader.uniforms.uWallDustColorAmount = { value: dustColorAmount };
    }
    if (topBleachEnabled) {
      shader.uniforms.uWallTopBleachAmount = { value: topBleachAmount };
      shader.uniforms.uWallTopBleachStartY = { value: topBleachStartY };
      shader.uniforms.uWallTopBleachHeightM = { value: topBleachHeightM };
      shader.uniforms.uWallTopBleachColor = { value: topBleachColor };
    }
    if (contactDarkenEnabled) {
      shader.uniforms.uWallContactDarkenAmount = { value: contactDarkenAmount };
      shader.uniforms.uWallContactDarkenDepth = { value: contactDarkenDepth };
    }

    if (!shader.fragmentShader.includes("uniform float uWallAlbedoBoost;")) {
      const macroHeader = macroEnabled
        ? `
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

      const worldPosHeader = needsWorldPos ? "\nvarying vec3 vWallWorldPos;" : "";
      const localPosHeader = needsLocalCoords ? "\nvarying vec3 vWallLocalPos;" : "";
      const groundBandHeader = needsGroundBand
        ? `
uniform float uWallFloorTopY;
uniform float uWallDirtHeightM;`
        : "";
      const dirtHeader = dirtEnabled
        ? `
uniform float uWallDirtDarken;
uniform float uWallDirtRoughnessBoost;`
        : "";
      const dustHeader = dustTintEnabled
        ? `
uniform vec3 uWallDustColor;
uniform float uWallDustColorAmount;`
        : "";
      const topBleachHeader = topBleachEnabled
        ? `
uniform float uWallTopBleachAmount;
uniform float uWallTopBleachStartY;
uniform float uWallTopBleachHeightM;
uniform vec3 uWallTopBleachColor;`
        : "";
      const contactDarkenHeader = contactDarkenEnabled
        ? `
uniform float uWallContactDarkenAmount;
uniform float uWallContactDarkenDepth;`
        : "";

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
uniform float uWallAlbedoBoost;${worldPosHeader}${localPosHeader}${macroHeader}${groundBandHeader}${dirtHeader}${dustHeader}${topBleachHeader}${contactDarkenHeader}`,
      );
    }

    if (!shader.fragmentShader.includes("// wall-soft-boost-applied")) {
      const groundBandSnippet = needsGroundBand
        ? `
float wallGroundDist = clamp((vWallWorldPos.y - uWallFloorTopY) / uWallDirtHeightM, 0.0, 1.0);
float wallGroundFactor = 1.0 - wallGroundDist;
wallGroundFactor = wallGroundFactor * wallGroundFactor;`
        : "";
      const dirtColorSnippet = dirtEnabled
        ? `
diffuseColor.rgb *= 1.0 - wallGroundFactor * uWallDirtDarken;`
        : "";
      const dustColorSnippet = dustTintEnabled
        ? `
diffuseColor.rgb = mix(diffuseColor.rgb, uWallDustColor, wallGroundFactor * uWallDustColorAmount);`
        : "";
      const bleachSnippet = topBleachEnabled
        ? `
float wallBleachT = clamp((vWallWorldPos.y - uWallTopBleachStartY) / max(uWallTopBleachHeightM, 0.001), 0.0, 1.0);
wallBleachT = smoothstep(0.0, 1.0, wallBleachT);
diffuseColor.rgb = mix(diffuseColor.rgb, uWallTopBleachColor, wallBleachT * uWallTopBleachAmount);`
        : "";
      const contactDarkenSnippet = contactDarkenEnabled
        ? `
float wallContactFactor = clamp(((-vWallLocalPos.x) - (0.5 - uWallContactDarkenDepth)) / max(uWallContactDarkenDepth, 0.001), 0.0, 1.0);
diffuseColor.rgb *= 1.0 - wallContactFactor * uWallContactDarkenAmount;`
        : "";

      // Soft-saturation boost: f(x,b) = (x*b) / (1 + (b-1)*x)
      // Preserves micro-contrast instead of hard-clamping at 1.0
      const mapPatch = macroEnabled
        ? `#include <map_fragment>
// wall-soft-boost-applied
vec2 wallMacroUv = vec2(vWallWorldPos.x + vWallWorldPos.z, vWallWorldPos.y);
float wallMacro = wallMacroNoise(wallMacroUv);
float wallMacroCentered = (wallMacro - 0.5) * 2.0;
float wallMacroColor = 1.0 + wallMacroCentered * uWallMacroColorAmplitude;
{
  float wallBoostF = uWallAlbedoBoost * wallMacroColor;
  diffuseColor.rgb = (diffuseColor.rgb * wallBoostF) / (1.0 + (wallBoostF - 1.0) * diffuseColor.rgb);
}${groundBandSnippet}${dirtColorSnippet}${dustColorSnippet}${bleachSnippet}${contactDarkenSnippet}`
        : `#include <map_fragment>
// wall-soft-boost-applied
{
  float wallBoostF = uWallAlbedoBoost;
  diffuseColor.rgb = (diffuseColor.rgb * wallBoostF) / (1.0 + (wallBoostF - 1.0) * diffuseColor.rgb);
}${groundBandSnippet}${dirtColorSnippet}${dustColorSnippet}${bleachSnippet}${contactDarkenSnippet}`;
      shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", mapPatch);
    }

    if (
      macroEnabled &&
      !shader.fragmentShader.includes("roughnessFactor = clamp(roughnessFactor + wallMacroCentered")
    ) {
      const dirtRoughnessSnippet = dirtEnabled
        ? `
float wallGroundDistR = clamp((vWallWorldPos.y - uWallFloorTopY) / uWallDirtHeightM, 0.0, 1.0);
float wallGroundFactorR = 1.0 - wallGroundDistR;
wallGroundFactorR = wallGroundFactorR * wallGroundFactorR;
roughnessFactor = clamp(roughnessFactor + wallGroundFactorR * uWallDirtRoughnessBoost, 0.04, 1.0);`
        : "";
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
roughnessFactor = clamp(
  roughnessFactor + wallMacroCentered * uWallMacroRoughnessAmplitude,
  0.04,
  1.0
);${dirtRoughnessSnippet}`,
      );
    }

    // When dirt is enabled but macro is not, we still need the roughness patch.
    if (
      dirtEnabled &&
      !macroEnabled &&
      !shader.fragmentShader.includes("roughnessFactor = clamp(roughnessFactor + wallDirtFactor")
    ) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
float wallGroundDistR = clamp((vWallWorldPos.y - uWallFloorTopY) / uWallDirtHeightM, 0.0, 1.0);
float wallGroundFactorR = 1.0 - wallGroundDistR;
wallGroundFactorR = wallGroundFactorR * wallGroundFactorR;
roughnessFactor = clamp(roughnessFactor + wallGroundFactorR * uWallDirtRoughnessBoost, 0.04, 1.0);`,
      );
    }
  };

  const previousProgramCacheKey = material.customProgramCacheKey.bind(material);
  const dirtCacheSegment = dirtEnabled
    ? `:dirt:${dirtHeightM.toFixed(2)}:${dirtDarken.toFixed(3)}:${dirtRoughnessBoost.toFixed(3)}:${floorTopY.toFixed(2)}`
    : "";
  const dustCacheSegment = dustTintEnabled
    ? `:dust:${dustColorAmount.toFixed(3)}:${dustColor.getHexString()}`
    : "";
  const bleachCacheSegment = topBleachEnabled
    ? `:bleach:${topBleachAmount.toFixed(3)}:${topBleachStartY.toFixed(2)}:${topBleachHeightM.toFixed(2)}:${topBleachColor.getHexString()}`
    : "";
  const contactCacheSegment = contactDarkenEnabled
    ? `:contact:${contactDarkenAmount.toFixed(3)}:${contactDarkenDepth.toFixed(3)}`
    : "";
  const cacheKey = macroEnabled
    ? `wall-tweak:${albedoBoost.toFixed(3)}:${macroColorAmplitude.toFixed(3)}:${macroRoughnessAmplitude.toFixed(3)}:${macroFrequency.toFixed(4)}:${macroSeed.toFixed(0)}:${tileSizeM.toFixed(3)}:${uvOffsetX.toFixed(3)}:${uvOffsetY.toFixed(3)}${dirtCacheSegment}${dustCacheSegment}${bleachCacheSegment}${contactCacheSegment}`
    : `wall-tweak:${albedoBoost.toFixed(3)}:flat:${tileSizeM.toFixed(3)}:${uvOffsetX.toFixed(3)}:${uvOffsetY.toFixed(3)}${dirtCacheSegment}${dustCacheSegment}${bleachCacheSegment}${contactCacheSegment}`;
  material.customProgramCacheKey = (): string => `${previousProgramCacheKey()}|${cacheKey}`;
  material.needsUpdate = true;
}
