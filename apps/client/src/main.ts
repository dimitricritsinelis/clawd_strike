import "./styles.css";
import type { LoadingScreenHandle } from "./loading-screen/bootstrap";
import { bootstrapLoadingScreen } from "./loading-screen/bootstrap";
import type {
  LoadingScreenInitialNameEntry,
  LoadingScreenMode,
  RuntimeLaunchSelection,
} from "./loading-screen/types";
import type { RuntimeWarmupAssets } from "./runtime/warmup";
import { clampPlayerNameInput, validatePlayerName } from "../../shared/playerName";

type LaunchState = "idle" | "warming" | "revealing" | "active";
type RuntimeHandle = {
  teardown: () => void;
  getRootElement: () => HTMLDivElement;
  beginReveal: () => void;
  activate: () => void;
};

const REVEAL_DURATION_MS = 280;
const REVEAL_BUFFER_MS = 96;

let loadingHandle: LoadingScreenHandle | null = null;
let runtimeHandle: RuntimeHandle | null = null;
let runtimeBootPromise: Promise<void> | null = null;
let warmupPromise: Promise<RuntimeWarmupAssets | null> | null = null;
let warmupAssets: RuntimeWarmupAssets | null = null;
let launchState: LaunchState = "idle";

type AutoStartResolution = {
  runtimeLaunchSelection: RuntimeLaunchSelection | null;
  initialNameEntry: LoadingScreenInitialNameEntry | null;
};

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

function parseAutoStartSelection(search: string): AutoStartResolution {
  const params = new URLSearchParams(search);
  const rawMode = params.get("autostart")?.trim().toLowerCase();
  if (rawMode !== "human" && rawMode !== "agent") {
    return {
      runtimeLaunchSelection: null,
      initialNameEntry: null,
    };
  }

  const mode = rawMode as LoadingScreenMode;
  const rawName = params.get("name") ?? params.get("player") ?? params.get("playerName");
  const validation = validatePlayerName(rawName);
  if (!validation.ok) {
    return {
      runtimeLaunchSelection: null,
      initialNameEntry: {
        mode,
        playerName: clampPlayerNameInput(rawName),
        validationReason: validation.reason,
      },
    };
  }

  return {
    runtimeLaunchSelection: {
      mode,
      playerName: validation.normalized,
    },
    initialNameEntry: null,
  };
}

const autoStartResolution = parseAutoStartSelection(window.location.search);
let runtimeLaunchSelection: RuntimeLaunchSelection | null = autoStartResolution.runtimeLaunchSelection;

function getOverlayElement(): HTMLElement | null {
  const overlay = document.querySelector<HTMLElement>("#overlay");
  return overlay;
}

function waitForRevealTransition(overlay: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      overlay.removeEventListener("transitionend", onTransitionEnd);
      resolve();
    };
    const onTransitionEnd = (event: Event) => {
      if (event.target !== overlay) return;
      finish();
    };
    const timeoutId = window.setTimeout(finish, REVEAL_DURATION_MS + REVEAL_BUFFER_MS);
    overlay.addEventListener("transitionend", onTransitionEnd);
  });
}

async function revealRuntime(handle: RuntimeHandle): Promise<void> {
  const overlay = getOverlayElement();
  const runtimeRoot = handle.getRootElement();

  launchState = "revealing";
  loadingHandle?.setTransitioning(true);
  handle.beginReveal();

  if (!overlay) {
    handle.activate();
    loadingHandle?.teardown();
    loadingHandle = null;
    launchState = "active";
    return;
  }

  overlay.style.pointerEvents = "none";
  runtimeRoot.style.transition = `opacity ${REVEAL_DURATION_MS}ms ease`;
  overlay.style.transition = `opacity ${REVEAL_DURATION_MS}ms ease`;

  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      runtimeRoot.style.opacity = "1";
      overlay.style.opacity = "0";
      resolve();
    });
  });
  await waitForRevealTransition(overlay);

  handle.activate();
  overlay.style.display = "none";
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.opacity = "";
  overlay.style.transition = "";
  overlay.style.pointerEvents = "";
  runtimeRoot.style.transition = "";

  loadingHandle?.teardown();
  loadingHandle = null;
  launchState = "active";
}

async function transitionToGame(selection?: RuntimeLaunchSelection): Promise<void> {
  if (runtimeHandle) return;
  if (runtimeBootPromise) return runtimeBootPromise;

  if (selection) {
    runtimeLaunchSelection = {
      mode: selection.mode,
      playerName: selection.playerName,
    };
  }
  launchState = "warming";
  loadingHandle?.setTransitioning(true);

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
    await revealRuntime(runtimeHandle);
  })().catch((error: unknown) => {
    if (launchState !== "active") {
      console.error("[runtime] launch failed", error);
      runtimeHandle?.teardown();
      runtimeHandle = null;
      launchState = "idle";
      loadingHandle?.setTransitioning(false);
      loadingHandle?.showBanner("Runtime launch failed");
    }
    throw error;
  }).finally(() => {
    runtimeBootPromise = null;
  });

  return runtimeBootPromise ?? Promise.resolve();
}

loadingHandle = bootstrapLoadingScreen({
  initialNameEntry: autoStartResolution.initialNameEntry,
  handoff: {
    onLoadingReady: startWarmup,
    transitionToGame,
  },
});

if (runtimeLaunchSelection) {
  void transitionToGame(runtimeLaunchSelection);
}
