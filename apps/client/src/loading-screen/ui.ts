import type { LoadingScreenMode } from "./types";

type LoadingScreenUICallbacks = {
  onWarmupAudio: () => void;
  onMuteToggle: () => void;
  onSelectMode: (mode: LoadingScreenMode) => void;
};

export type LoadingScreenUI = {
  show: () => void;
  dispose: () => void;
  setAssetReady: (ready: boolean) => void;
  setMuteState: (muted: boolean) => void;
  flashMuteToggle: () => void;
  showBanner: (message: string) => void;
  getState: () => {
    startVisible: boolean;
    bannerVisible: boolean;
  };
};

function getRequiredEl<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing required loading screen element: ${selector}`);
  return el;
}

export function createLoadingScreenUI(callbacks: LoadingScreenUICallbacks): LoadingScreenUI {
  const start = getRequiredEl<HTMLDivElement>("#start");
  const muteToggleBtn = getRequiredEl<HTMLButtonElement>("#mute-toggle-btn");
  const singlePlayerBtn = getRequiredEl<HTMLButtonElement>("#single-player-btn");
  const multiPlayerBtn = getRequiredEl<HTMLButtonElement>("#multi-player-btn");
  const modeBanner = getRequiredEl<HTMLDivElement>("#mode-banner");

  let disposed = false;
  let bannerTimer: number | null = null;

  function clearBannerTimer() {
    if (bannerTimer === null) return;
    window.clearTimeout(bannerTimer);
    bannerTimer = null;
  }

  function onWarmupAudio() {
    if (disposed) return;
    callbacks.onWarmupAudio();
  }

  function onMuteToggleClick() {
    if (disposed) return;
    callbacks.onMuteToggle();
  }

  function onSelectHuman() {
    if (disposed) return;
    callbacks.onSelectMode("human");
  }

  function onSelectAgent() {
    if (disposed) return;
    callbacks.onSelectMode("agent");
  }

  start.addEventListener("pointerdown", onWarmupAudio, { passive: true });
  window.addEventListener("keydown", onWarmupAudio);
  muteToggleBtn.addEventListener("click", onMuteToggleClick);
  singlePlayerBtn.addEventListener("click", onSelectHuman);
  multiPlayerBtn.addEventListener("click", onSelectAgent);

  return {
    show() {
      start.style.display = "grid";
    },
    setAssetReady(ready) {
      const nextValue = ready ? "true" : "false";
      if (start.dataset.assetsReady === nextValue) return;
      start.dataset.assetsReady = nextValue;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearBannerTimer();

      start.removeEventListener("pointerdown", onWarmupAudio);
      window.removeEventListener("keydown", onWarmupAudio);
      muteToggleBtn.removeEventListener("click", onMuteToggleClick);
      singlePlayerBtn.removeEventListener("click", onSelectHuman);
      multiPlayerBtn.removeEventListener("click", onSelectAgent);
    },
    setMuteState(muted) {
      muteToggleBtn.classList.toggle("is-muted", muted);
      muteToggleBtn.classList.toggle("is-unmuted", !muted);
      muteToggleBtn.setAttribute("aria-pressed", muted ? "true" : "false");
      muteToggleBtn.setAttribute("aria-label", muted ? "Unmute loading ambience" : "Mute loading ambience");
    },
    flashMuteToggle() {
      muteToggleBtn.classList.remove("flash");
      void muteToggleBtn.offsetWidth;
      muteToggleBtn.classList.add("flash");
    },
    showBanner(message) {
      modeBanner.textContent = message;
      modeBanner.classList.add("show");

      clearBannerTimer();
      bannerTimer = window.setTimeout(() => {
        modeBanner.classList.remove("show");
        bannerTimer = null;
      }, 2200);
    },
    getState() {
      return {
        startVisible: start.style.display !== "none",
        bannerVisible: modeBanner.classList.contains("show"),
      };
    },
  };
}
