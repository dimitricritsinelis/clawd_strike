import { LoadingAmbientAudio } from "./runtime/audio/LoadingAmbientAudio";
const startEl = document.querySelector<HTMLDivElement>("#start");
const muteToggleBtnEl = document.querySelector<HTMLButtonElement>("#mute-toggle-btn");
const singlePlayerBtnEl = document.querySelector<HTMLButtonElement>("#single-player-btn");
const multiPlayerBtnEl = document.querySelector<HTMLButtonElement>("#multi-player-btn");
const modeBannerEl = document.querySelector<HTMLDivElement>("#mode-banner");

if (!startEl || !muteToggleBtnEl || !singlePlayerBtnEl || !multiPlayerBtnEl || !modeBannerEl) {
  throw new Error("Missing required loading screen DOM elements.");
}

const start = startEl;
const muteToggleBtn = muteToggleBtnEl;
const singlePlayerBtn = singlePlayerBtnEl;
const multiPlayerBtn = multiPlayerBtnEl;
const modeBanner = modeBannerEl;
const isVirtualTime = typeof window.__vt_pending !== "undefined";

const loadingAmbient = new LoadingAmbientAudio({
  src: "/loading-screen/ClawdStriker_Audio.mp3",
  playFromSec: 0,
  loopStartSec: 0,
  loopEndSec: Number.POSITIVE_INFINITY,
  crossfadeSec: 0.22,
  gain: 0.45,
});

let disposed = false;
let bannerTimer: number | null = null;

function syncMuteButtonState() {
  const muted = loadingAmbient.isMuted();
  muteToggleBtn.classList.toggle("is-muted", muted);
  muteToggleBtn.classList.toggle("is-unmuted", !muted);
  muteToggleBtn.setAttribute("aria-pressed", muted ? "true" : "false");
  muteToggleBtn.setAttribute("aria-label", muted ? "Unmute loading ambience" : "Mute loading ambience");
}

function flashMuteButton() {
  muteToggleBtn.classList.remove("flash");
  void muteToggleBtn.offsetWidth;
  muteToggleBtn.classList.add("flash");
}

function showBanner(message: string) {
  modeBanner.textContent = message;
  modeBanner.classList.add("show");

  if (bannerTimer !== null) {
    window.clearTimeout(bannerTimer);
  }

  bannerTimer = window.setTimeout(() => {
    modeBanner.classList.remove("show");
    bannerTimer = null;
  }, 2200);
}

function warmupLoadingAmbientAudio() {
  if (disposed) return;
  void loadingAmbient.start();
}

function onMuteToggleClick() {
  if (disposed) return;
  const nextMuted = !loadingAmbient.isMuted();
  loadingAmbient.setMuted(nextMuted);
  if (!nextMuted) {
    void loadingAmbient.start();
  }
  syncMuteButtonState();
  flashMuteButton();
}

function onSinglePlayerClick() {
  if (disposed) return;
  void loadingAmbient.start();
  showBanner("Map rebuild in progress");
}

function onMultiPlayerClick() {
  if (disposed) return;
  void loadingAmbient.start();
  showBanner("Map rebuild in progress");
}

function teardown() {
  if (disposed) return;
  disposed = true;

  if (bannerTimer !== null) {
    window.clearTimeout(bannerTimer);
    bannerTimer = null;
  }

  start.removeEventListener("pointerdown", warmupLoadingAmbientAudio);
  window.removeEventListener("keydown", warmupLoadingAmbientAudio);
  muteToggleBtn.removeEventListener("click", onMuteToggleClick);
  singlePlayerBtn.removeEventListener("click", onSinglePlayerClick);
  multiPlayerBtn.removeEventListener("click", onMultiPlayerClick);

  loadingAmbient.stop();
}

start.addEventListener("pointerdown", warmupLoadingAmbientAudio, { passive: true });
window.addEventListener("keydown", warmupLoadingAmbientAudio);
muteToggleBtn.addEventListener("click", onMuteToggleClick);
singlePlayerBtn.addEventListener("click", onSinglePlayerClick);
multiPlayerBtn.addEventListener("click", onMultiPlayerClick);
window.addEventListener("pagehide", teardown);
window.addEventListener("beforeunload", teardown);

start.style.display = "grid";
loadingAmbient.setMuted(false);
syncMuteButtonState();
void loadingAmbient.start();

if (isVirtualTime) {
  window.advanceTime = async () => {
    // No runtime simulation while this branch is loading-screen-only.
  };
}

window.render_game_to_text = () =>
  JSON.stringify({
    mode: "loading-screen-only",
    ui: {
      visible: true,
      startVisible: start.style.display !== "none",
      muteState: loadingAmbient.isMuted() ? "muted" : "unmuted",
      messageVisible: modeBanner.classList.contains("show"),
    },
    gameplay: {
      active: false,
      reason: "runtime stripped for map rebuild branch",
    },
  });
