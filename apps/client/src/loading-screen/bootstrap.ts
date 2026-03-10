import { LoadingAmbientAudio } from "./audio";
import {
  OVERLAY_PRELOAD_TIMEOUT_MS,
  getLoadingScreenAmbientAudioSources,
  preloadLoadingScreenAssets,
} from "./assets";
import type { LoadingAmbientAudioOptions } from "./audio";
import type { LoadingScreenHandoff, LoadingScreenInitialNameEntry, LoadingScreenMode } from "./types";
import { createLoadingScreenUI } from "./ui";
import { getSharedChampionSnapshot, loadSharedChampion } from "../shared/sharedChampionClient";
import {
  PUBLIC_AGENT_API_VERSION,
  PUBLIC_AGENT_CONTRACT,
} from "../../../shared/publicAgentContract";
import { isLocalhostHostname } from "../shared/hostEnvironment";

export type BootstrapLoadingScreenOptions = {
  handoff?: LoadingScreenHandoff;
  audio?: Partial<LoadingAmbientAudioOptions>;
  initialNameEntry?: LoadingScreenInitialNameEntry | null;
};

export type LoadingScreenHandle = {
  teardown: () => void;
  setTransitioning: (active: boolean) => void;
  showBanner: (message: string) => void;
};

const DEFAULT_AUDIO: LoadingAmbientAudioOptions = {
  sources: getLoadingScreenAmbientAudioSources(),
  gain: 0.45,
  playFromSec: 0,
  loopStartSec: 0,
  loopEndSec: Number.POSITIVE_INFINITY,
  startDelayMs: 0,
};

const OVERLAY_LOADING_BANNER = "Loading menu art...";
const OVERLAY_FAILURE_BANNER = "Menu art unavailable";

export function bootstrapLoadingScreen(options: BootstrapLoadingScreenOptions = {}): LoadingScreenHandle {
  const isVirtualTime = typeof window.__vt_pending !== "undefined";
  const isInternalDebugSurface = import.meta.env.DEV || isLocalhostHostname(window.location.hostname);

  const loadingAmbient = new LoadingAmbientAudio({ ...DEFAULT_AUDIO, ...(options.audio ?? {}) });
  let disposed = false;
  let selectedMode: LoadingScreenMode | null = null;
  let selectedPlayerName: string = "";
  let sharedChampionSnapshot = getSharedChampionSnapshot();

  const ui = createLoadingScreenUI({
    onWarmupAudio: () => {
      if (disposed) return;
      if (loadingAmbient.isMuted()) return;
      void loadingAmbient.start();
    },
    onMuteToggle: () => {
      if (disposed) return;
      const nextMuted = !loadingAmbient.isMuted();
      loadingAmbient.setMuted(nextMuted);
      if (!nextMuted) {
        // User gesture: attempt playback immediately (or after configured delay).
        void loadingAmbient.start();
      }
      ui.setMuteState(loadingAmbient.isMuted());
      ui.flashMuteToggle();
    },
    onSelectMode: (mode, playerName) => {
      if (disposed) return;
      selectedMode = mode;
      selectedPlayerName = playerName;
      const runtimeUrl = new URL(window.location.href);
      runtimeUrl.searchParams.set("mode", mode);
      if (playerName.trim().length > 0) {
        runtimeUrl.searchParams.set("name", playerName.trim());
      } else {
        runtimeUrl.searchParams.delete("name");
      }
      window.history.replaceState(window.history.state, "", `${runtimeUrl.pathname}${runtimeUrl.search}${runtimeUrl.hash}`);
      if (!loadingAmbient.isMuted()) {
        void loadingAmbient.start();
      }

      const transitionToGame = options.handoff?.transitionToGame;
      if (transitionToGame) {
        ui.setTransitioning(true);
        void transitionToGame({
          mode,
          playerName,
        });
        return;
      }

      ui.showBanner("Runtime unavailable");
    },
  });

  function teardown() {
    if (disposed) return;
    disposed = true;

    window.removeEventListener("pagehide", teardown);
    window.removeEventListener("beforeunload", teardown);

    ui.dispose();
    loadingAmbient.stop();
  }

  window.addEventListener("pagehide", teardown);
  window.addEventListener("beforeunload", teardown);

  loadingAmbient.setMuted(false);
  ui.setMuteState(loadingAmbient.isMuted());
  ui.setSharedChampion(sharedChampionSnapshot);
  ui.show();
  ui.setBackgroundReady(false);
  ui.setAssetReady(false);
  ui.setTransitioning(false);
  if (options.initialNameEntry) {
    ui.primeNameEntry(options.initialNameEntry);
  }

  void (async () => {
    const backgroundPreloadPromise = preloadLoadingScreenAssets("background").then((backgroundPreload) => {
      if (disposed) return backgroundPreload;
      if (backgroundPreload.failedUrls.length > 0) {
        console.warn(`[loading-screen] background asset preload failed: ${backgroundPreload.failedUrls.join(", ")}`);
      }
      ui.setBackgroundReady(true);
      return backgroundPreload;
    });
    const mainMenuSurfacePromise = ui.prepareMainMenuSurface();

    let overlayTimedOut = false;
    const overlayTimeoutId = window.setTimeout(() => {
      overlayTimedOut = true;
      if (disposed) return;
      console.warn(`[loading-screen] overlay assets still loading after ${OVERLAY_PRELOAD_TIMEOUT_MS}ms`);
      ui.showBanner(OVERLAY_LOADING_BANNER, { persist: true });
    }, OVERLAY_PRELOAD_TIMEOUT_MS);

    const mainMenuReady = await mainMenuSurfacePromise;
    window.clearTimeout(overlayTimeoutId);
    if (disposed) return;

    await backgroundPreloadPromise;
    if (disposed) return;
    if (!mainMenuReady) {
      console.warn("[loading-screen] main menu surface failed to resolve");
      ui.showBanner(OVERLAY_FAILURE_BANNER, { persist: true });
      return;
    }

    if (overlayTimedOut) {
      ui.hideBanner();
    }
    ui.setAssetReady(true);
    ui.warmLazyAssets();
  })();

  void loadSharedChampion().then((snapshot) => {
    if (disposed) return;
    sharedChampionSnapshot = snapshot;
    ui.setSharedChampion(snapshot);
  });

  void loadingAmbient.start();

  if (isVirtualTime) {
    window.advanceTime = async (_ms: number) => {
      // Virtual-time harness: loading-screen mode intentionally has no simulation step.
    };
  }

  window.agent_apply_action = (_action: unknown) => {
    // Runtime-only API. Loading screen intentionally ignores agent actions.
  };

  const publicObserveState = () => ({
    apiVersion: PUBLIC_AGENT_API_VERSION,
    contract: PUBLIC_AGENT_CONTRACT,
    mode: "loading-screen" as const,
    runtimeReady: false,
    gameplay: {
      alive: false,
      gameOverVisible: false,
    },
    health: null,
    ammo: null,
    score: {
      current: 0,
      best: 0,
      lastRun: null,
      scope: "browser-session" as const,
    },
    sharedChampion: sharedChampionSnapshot.champion,
    lastRunSummary: null,
  });

  window.agent_observe = () => JSON.stringify(publicObserveState());

  window.render_game_to_text = () => {
    if (!isInternalDebugSurface) {
      return JSON.stringify(publicObserveState());
    }

    const uiState = ui.getState();
    return JSON.stringify({
      apiVersion: 4,
      mode: "loading-screen",
      ui: {
        visible: true,
        startVisible: uiState.startVisible,
        backgroundReady: uiState.backgroundReady,
        assetsReady: uiState.assetsReady,
        nameEntryReady: uiState.nameEntryReady,
        infoReady: uiState.infoReady,
        transitioning: uiState.transitioning,
        muteState: loadingAmbient.isMuted() ? "muted" : "unmuted",
        messageVisible: uiState.bannerVisible,
        selectedMode,
        selectedPlayerName,
      },
      sharedChampion: sharedChampionSnapshot,
      gameplay: {
        active: false,
        reason: "runtime not bootstrapped yet",
      },
    });
  };

  options.handoff?.onLoadingReady?.();
  return {
    teardown,
    setTransitioning(active) {
      if (disposed) return;
      ui.setTransitioning(active);
    },
    showBanner(message) {
      if (disposed) return;
      ui.showBanner(message);
    },
  };
}
