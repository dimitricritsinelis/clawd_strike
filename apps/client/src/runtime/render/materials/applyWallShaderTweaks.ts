import type { MeshStandardMaterial } from "three";

type WallShaderTweakOptions = {
  albedoBoost: number;
  macroColorAmplitude?: number;
  macroRoughnessAmplitude?: number;
  macroFrequency?: number;
  macroSeed?: number;
};

export function applyWallShaderTweaks(material: MeshStandardMaterial, options: WallShaderTweakOptions): void {
  material.color.multiplyScalar(Math.max(0.25, Math.min(2, options.albedoBoost || 1)));
  material.needsUpdate = true;
}
