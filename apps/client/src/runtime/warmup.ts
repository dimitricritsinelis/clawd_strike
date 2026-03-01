import { FloorMaterialLibrary } from "./render/materials/FloorMaterialLibrary";
import { parseRuntimeUrlParams } from "./utils/UrlParams";
import { Ak47ViewModel } from "./weapons/Ak47ViewModel";

const FLOOR_MANIFEST_URL =
  "/assets/textures/environment/bazaar/floors/bazaar_floor_textures_pack_v4/materials.json";
const PBR_FLOORS_ENABLED = true;

export type RuntimeWarmupAssets = {
  floorMaterials: FloorMaterialLibrary | null;
  viewModel: Ak47ViewModel | null;
};

export async function warmupRuntimeAssets(): Promise<RuntimeWarmupAssets> {
  const parsed = parseRuntimeUrlParams(window.location.search);

  let floorMaterials: FloorMaterialLibrary | null = null;
  let viewModel: Ak47ViewModel | null = null;

  if (PBR_FLOORS_ENABLED && parsed.floorMode === "pbr") {
    try {
      floorMaterials = await FloorMaterialLibrary.load(FLOOR_MANIFEST_URL);
      await floorMaterials.preloadAllTextures(parsed.floorQuality);
    } catch (error) {
      floorMaterials = null;
      console.warn(
        `[runtime:warmup] failed to preload floor textures: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (parsed.vm) {
    let warmedViewModel: Ak47ViewModel | null = null;
    try {
      warmedViewModel = new Ak47ViewModel({
        vmDebug: parsed.vmDebug && parsed.debug,
      });
      await warmedViewModel.load();
      viewModel = warmedViewModel;
      warmedViewModel = null;
    } catch (error) {
      warmedViewModel?.dispose();
      viewModel = null;
      console.warn(
        `[runtime:warmup] failed to preload AK viewmodel: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    floorMaterials,
    viewModel,
  };
}
