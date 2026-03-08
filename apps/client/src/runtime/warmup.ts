import { FloorMaterialLibrary } from "./render/materials/FloorMaterialLibrary";
import { preloadEnemyVisualAssets } from "./enemies/EnemyVisual";
import { WallMaterialLibrary } from "./render/materials/WallMaterialLibrary";
import { parseRuntimeUrlParams } from "./utils/UrlParams";
import { Ak47ViewModel } from "./weapons/Ak47ViewModel";

const FLOOR_MANIFEST_URL =
  "/assets/textures/environment/bazaar/floors/bazaar_floor_textures_pack_v4/materials.json";
const WALL_MANIFEST_URL =
  "/assets/textures/environment/bazaar/walls/bazaar_wall_textures_pack_v5/materials.json";
const PBR_FLOORS_ENABLED = true;
const PBR_WALLS_ENABLED = true;
const RUNTIME_WARMUP_TIMEOUT_MS = 8_000;

export type RuntimeWarmupAssets = {
  floorMaterials: FloorMaterialLibrary | null;
  wallMaterials: WallMaterialLibrary | null;
  viewModel: Ak47ViewModel | null;
  enemyVisualsReady: boolean;
  timedOut: boolean;
};

function createEmptyWarmupAssets(timedOut: boolean): RuntimeWarmupAssets {
  return {
    floorMaterials: null,
    wallMaterials: null,
    viewModel: null,
    enemyVisualsReady: false,
    timedOut,
  };
}

async function performWarmup(search: string): Promise<RuntimeWarmupAssets> {
  const parsed = parseRuntimeUrlParams(search);
  let floorMaterials: FloorMaterialLibrary | null = null;
  let wallMaterials: WallMaterialLibrary | null = null;
  let viewModel: Ak47ViewModel | null = null;
  let enemyVisualsReady = false;
  const warmupTasks: Promise<void>[] = [];

  if (PBR_FLOORS_ENABLED && parsed.floorMode === "pbr") {
    warmupTasks.push((async () => {
      try {
        floorMaterials = await FloorMaterialLibrary.load(FLOOR_MANIFEST_URL);
        await floorMaterials.preloadAllTextures(parsed.floorQuality);
      } catch (error) {
        floorMaterials = null;
        console.warn(
          `[runtime:warmup] failed to preload floor textures: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    })());
  }

  if (PBR_WALLS_ENABLED && parsed.wallMode === "pbr") {
    warmupTasks.push((async () => {
      try {
        const wallQuality = parsed.floorQuality === "1k" ? "1k" : "2k";
        wallMaterials = await WallMaterialLibrary.load(WALL_MANIFEST_URL);
        await wallMaterials.preloadAllTextures(wallQuality);
      } catch (error) {
        wallMaterials = null;
        console.warn(
          `[runtime:warmup] failed to preload wall textures: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    })());
  }

  if (parsed.vm) {
    warmupTasks.push((async () => {
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
    })());
  }

  warmupTasks.push((async () => {
    try {
      await preloadEnemyVisualAssets();
      enemyVisualsReady = true;
    } catch (error) {
      enemyVisualsReady = false;
      console.warn(
        `[runtime:warmup] failed to preload enemy visuals: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  })());

  await Promise.all(warmupTasks);

  return {
    floorMaterials,
    wallMaterials,
    viewModel,
    enemyVisualsReady,
    timedOut: false,
  };
}

export async function warmupRuntimeAssets(): Promise<RuntimeWarmupAssets> {
  let timeoutId = 0;
  const timeoutToken = Symbol("runtime-warmup-timeout");
  const timeoutResult = await Promise.race<RuntimeWarmupAssets | symbol>([
    performWarmup(window.location.search),
    new Promise<symbol>((resolve) => {
      timeoutId = window.setTimeout(() => resolve(timeoutToken), RUNTIME_WARMUP_TIMEOUT_MS);
    }),
  ]);
  window.clearTimeout(timeoutId);

  if (typeof timeoutResult === "symbol") {
    console.warn(`[runtime:warmup] timed out after ${RUNTIME_WARMUP_TIMEOUT_MS}ms; using safe fallback`);
    return createEmptyWarmupAssets(true);
  }

  return timeoutResult;
}
