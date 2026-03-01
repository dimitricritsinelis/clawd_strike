import "./styles.css";
import type { LoadingScreenHandle } from "./loading-screen/bootstrap";
import { bootstrapLoadingScreen } from "./loading-screen/bootstrap";
import type { LoadingScreenMode, RuntimeLaunchSelection } from "./loading-screen/types";
import type { RuntimeWarmupAssets } from "./runtime/warmup";
import { sanitizeRuntimePlayerName } from "./runtime/utils/UrlParams";

let loadingHandle: LoadingScreenHandle | null = null;
let runtimeHandle: { teardown: () => void } | null = null;
let runtimeBootPromise: Promise<void> | null = null;
let warmupPromise: Promise<RuntimeWarmupAssets | null> | null = null;
let warmupAssets: RuntimeWarmupAssets | null = null;

function startWarmup(): void {
  if (warmupPromise) return;

  warmupPromise = import("./runtime/warmup")
    .then((module) => module.warmupRuntimeAssets())
    .then((assets) => {
      warmupAssets = assets;
      return assets;
    })
    .catch((error: unknown) => {
      warmupAssets = null;
      console.warn(
        `[runtime] visible-asset warmup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    });
}

function parseAutoStartSelection(search: string): RuntimeLaunchSelection | null {
  const params = new URLSearchParams(search);
  const rawMode = params.get("autostart")?.trim().toLowerCase();
  if (rawMode !== "human" && rawMode !== "agent") {
    return null;
  }

  const mode = rawMode as LoadingScreenMode;
  const rawName = params.get("name") ?? params.get("player") ?? params.get("playerName");
  return {
    mode,
    playerName: sanitizeRuntimePlayerName(rawName, mode),
  };
}

let runtimeLaunchSelection: RuntimeLaunchSelection | null = parseAutoStartSelection(window.location.search);

function hideLoadingOverlay(): void {
  const startOverlay = document.querySelector<HTMLElement>("#start");
  if (startOverlay) {
    startOverlay.style.display = "none";
  }

  const overlay = document.querySelector<HTMLElement>("#overlay");
  if (overlay) {
    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
  }
}

async function transitionToGame(selection?: RuntimeLaunchSelection): Promise<void> {
  if (runtimeHandle) return;
  if (runtimeBootPromise) return runtimeBootPromise;

  if (selection) {
    runtimeLaunchSelection = {
      mode: selection.mode,
      playerName: sanitizeRuntimePlayerName(selection.playerName, selection.mode),
    };
  }

  runtimeBootPromise = (async () => {
    const { bootstrapRuntime } = await import("./runtime/bootstrap");
    startWarmup();
    const assets = warmupPromise ? await warmupPromise : warmupAssets;
    const runtimeOptions = runtimeLaunchSelection
      ? {
          controlMode: runtimeLaunchSelection.mode,
          playerName: runtimeLaunchSelection.playerName,
          warmup: assets,
        }
      : {
          warmup: assets,
        };
    runtimeHandle = await bootstrapRuntime(runtimeOptions);
    hideLoadingOverlay();

    loadingHandle?.teardown();
    loadingHandle = null;
  })().finally(() => {
    runtimeBootPromise = null;
  });

  return runtimeBootPromise;
}

loadingHandle = bootstrapLoadingScreen({
  handoff: {
    onLoadingReady: startWarmup,
    transitionToGame,
  },
});

if (runtimeLaunchSelection) {
  void transitionToGame(runtimeLaunchSelection);
}
