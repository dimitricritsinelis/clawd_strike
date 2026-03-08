import { LoadingAmbientAudio } from "./audio";
import { OVERLAY_PRELOAD_TIMEOUT_MS, preloadLoadingScreenAssets } from "./assets";
import type { LoadingAmbientAudioOptions } from "./audio";
import type { LoadingScreenHandoff, LoadingScreenMode } from "./types";
import { createLoadingScreenUI } from "./ui";
import { getSharedChampionSnapshot, loadSharedChampion } from "../shared/sharedChampionClient";

export type BootstrapLoadingScreenOptions = {
  handoff?: LoadingScreenHandoff;
  audio?: Partial<LoadingAmbientAudioOptions>;
};

export type LoadingScreenHandle = {
  teardown: () => void;
  setTransitioning: (active: boolean) => void;
  showBanner: (message: string) => void;
};

const DEFAULT_AUDIO: LoadingAmbientAudioOptions = {
  src: "/loading-screen/assets/ClawdStriker_Audio_Loading_Trimmed.mp3",
  gain: 0.45,
  playFromSec: 0,
  loopStartSec: 0,
  loopEndSec: Number.POSITIVE_INFINITY,
  startDelayMs: 0,
};

const PUBLIC_AGENT_API_VERSION = 1;
const PUBLIC_AGENT_CONTRACT = "public-agent-v1";
const INTERNAL_DEBUG_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const OVERLAY_LOADING_BANNER = "Loading menu art...";
const OVERLAY_FAILURE_BANNER = "Menu art unavailable";

export function bootstrapLoadingScreen(options: BootstrapLoadingScreenOptions = {}): LoadingScreenHandle {
  const isVirtualTime = typeof window.__vt_pending !== "undefined";
  const isInternalDebugSurface = import.meta.env.DEV || INTERNAL_DEBUG_HOSTNAMES.has(window.location.hostname);

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

  void (async () => {
    const backgroundPreload = await preloadLoadingScreenAssets("background");
    if (disposed) return;
    if (backgroundPreload.failedUrls.length > 0) {
      console.warn(`[loading-screen] background asset preload failed: ${backgroundPreload.failedUrls.join(", ")}`);
    }

    ui.setBackgroundReady(true);
    ui.hydrateVisibleOverlayAssets();

    let overlayTimedOut = false;
    const overlayTimeoutId = window.setTimeout(() => {
      overlayTimedOut = true;
      if (disposed) return;
      console.warn(`[loading-screen] overlay assets still loading after ${OVERLAY_PRELOAD_TIMEOUT_MS}ms`);
      ui.showBanner(OVERLAY_LOADING_BANNER, { persist: true });
    }, OVERLAY_PRELOAD_TIMEOUT_MS);

    const overlayPreload = await preloadLoadingScreenAssets("overlay");
    window.clearTimeout(overlayTimeoutId);
    if (disposed) return;

    if (overlayPreload.failedUrls.length > 0) {
      console.warn(`[loading-screen] overlay asset preload failed: ${overlayPreload.failedUrls.join(", ")}`);
      ui.showBanner(OVERLAY_FAILURE_BANNER, { persist: true });
      return;
    }

    const overlayImagesReady = await ui.waitForVisibleOverlayAssets();
    if (disposed) return;
    if (!overlayImagesReady) {
      console.warn("[loading-screen] overlay DOM assets failed to resolve after preload");
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
