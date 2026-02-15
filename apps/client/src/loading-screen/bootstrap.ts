import { LoadingAmbientAudio } from "./audio";
import type { LoadingAmbientAudioOptions } from "./audio";
import type { LoadingScreenHandoff, LoadingScreenMode } from "./types";
import { createLoadingScreenUI } from "./ui";

export type BootstrapLoadingScreenOptions = {
  handoff?: LoadingScreenHandoff;
  audio?: Partial<LoadingAmbientAudioOptions>;
};

export type LoadingScreenHandle = {
  teardown: () => void;
};

const DEFAULT_AUDIO: LoadingAmbientAudioOptions = {
  src: "/loading-screen/assets/ClawdStriker_Audio_Loading_Trimmed.mp3",
  gain: 0.45,
  playFromSec: 0,
  loopStartSec: 0,
  loopEndSec: Number.POSITIVE_INFINITY,
  startDelayMs: 0,
};

export function bootstrapLoadingScreen(options: BootstrapLoadingScreenOptions = {}): LoadingScreenHandle {
  const isVirtualTime = typeof window.__vt_pending !== "undefined";

  const loadingAmbient = new LoadingAmbientAudio({ ...DEFAULT_AUDIO, ...(options.audio ?? {}) });
  let disposed = false;
  let selectedMode: LoadingScreenMode | null = null;

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
    onSelectMode: (mode) => {
      if (disposed) return;
      selectedMode = mode;
      if (!loadingAmbient.isMuted()) {
        void loadingAmbient.start();
      }

      // Placeholder until the game runtime is reintroduced.
      ui.showBanner("Map rebuild in progress");
      void options.handoff?.transitionToGame?.();
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
  ui.show();
  void loadingAmbient.start();

  if (isVirtualTime) {
    window.advanceTime = async (_ms: number) => {
      // No runtime simulation while this branch is loading-screen-only.
    };
  }

  window.render_game_to_text = () => {
    const uiState = ui.getState();
    return JSON.stringify({
      mode: "loading-screen-only",
      ui: {
        visible: true,
        startVisible: uiState.startVisible,
        muteState: loadingAmbient.isMuted() ? "muted" : "unmuted",
        messageVisible: uiState.bannerVisible,
        selectedMode,
      },
      gameplay: {
        active: false,
        reason: "runtime stripped for loading-screen-only branch",
      },
    });
  };

  options.handoff?.onLoadingReady?.();
  return { teardown };
}
