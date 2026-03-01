import type { LoadingScreenMode } from "./types";

type LoadingScreenUICallbacks = {
  onWarmupAudio: () => void;
  onMuteToggle: () => void;
  onSelectMode: (mode: LoadingScreenMode, playerName: string) => void;
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

const SKILLS_MD_PLACEHOLDER_URL = "/skills.md";
const AGENT_NAME_STORAGE_KEY = "clawd-strike:last-agent-name";

function getRequiredEl<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing required loading screen element: ${selector}`);
  return el;
}

function clampNameToMaxLength(raw: string, maxLength: number): string {
  if (maxLength <= 0) return raw.trim();
  return raw.trim().slice(0, maxLength);
}

function readPersistedAgentName(maxLength: number): string {
  try {
    const stored = window.localStorage.getItem(AGENT_NAME_STORAGE_KEY);
    if (!stored) return "";
    return clampNameToMaxLength(stored, maxLength);
  } catch {
    return "";
  }
}

function writePersistedAgentName(value: string): void {
  try {
    window.localStorage.setItem(AGENT_NAME_STORAGE_KEY, value);
  } catch {
    // Ignore storage errors in constrained browser contexts.
  }
}

export function createLoadingScreenUI(callbacks: LoadingScreenUICallbacks): LoadingScreenUI {
  const start = getRequiredEl<HTMLDivElement>("#start");
  const muteToggleBtn = getRequiredEl<HTMLButtonElement>("#mute-toggle-btn");
  const singlePlayerBtn = getRequiredEl<HTMLButtonElement>("#single-player-btn");
  const multiPlayerBtn = getRequiredEl<HTMLButtonElement>("#multi-player-btn");
  const infoBtn = getRequiredEl<HTMLButtonElement>("#info-btn");
  const skillsMdBtn = getRequiredEl<HTMLButtonElement>("#skills-md-btn");
  const enterAgentModeBtn = getRequiredEl<HTMLButtonElement>("#enter-agent-mode-btn");
  const modeBanner = getRequiredEl<HTMLDivElement>("#mode-banner");
  const playerNameInput = getRequiredEl<HTMLInputElement>("#player-name-input");

  let disposed = false;
  let bannerTimer: number | null = null;
  let pendingMode: LoadingScreenMode | null = null;
  const playerNameMaxLength = playerNameInput.maxLength > 0 ? playerNameInput.maxLength : 15;
  let persistedAgentName = readPersistedAgentName(playerNameMaxLength);
  if (persistedAgentName.length > 0) {
    playerNameInput.value = persistedAgentName;
  }
  start.dataset.agentSubmenu = "false";
  start.dataset.nameEntryVisible = "false";
  start.dataset.infoVisible = "false";

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

  function resetToPrimaryButtons() {
    pendingMode = null;
    playerNameInput.placeholder = "ENTER NAME";
    start.dataset.nameEntryVisible = "false";
    start.dataset.agentSubmenu = "false";
    start.dataset.infoVisible = "false";
  }

  function revealNameEntry(mode: LoadingScreenMode) {
    pendingMode = mode;
    playerNameInput.placeholder = mode === "agent" ? "AGENT NAME" : "HUMAN NAME";
    if (mode === "agent" && persistedAgentName.length > 0) {
      playerNameInput.value = persistedAgentName;
    }
    start.dataset.agentSubmenu = "false";
    start.dataset.nameEntryVisible = "true";
    window.requestAnimationFrame(() => {
      playerNameInput.focus();
      const caretPos = playerNameInput.value.length;
      playerNameInput.setSelectionRange(caretPos, caretPos);
    });
  }

  function hideNameEntry() {
    closeInfoScreen();
    resetToPrimaryButtons();
    window.requestAnimationFrame(() => {
      singlePlayerBtn.focus();
    });
  }

  function showInfoScreen() {
    if (start.dataset.infoVisible === "true") return;
    start.dataset.infoVisible = "true";
    closeNameAndModePanels();
  }

  function closeInfoScreen() {
    if (start.dataset.infoVisible !== "true") return;
    start.dataset.infoVisible = "false";
  }

  function toggleInfoScreen() {
    if (start.dataset.infoVisible === "true") {
      closeInfoScreen();
      window.requestAnimationFrame(() => {
        singlePlayerBtn.focus();
      });
      return;
    }
    showInfoScreen();
  }

  function closeNameAndModePanels() {
    pendingMode = null;
    playerNameInput.placeholder = "ENTER NAME";
    start.dataset.nameEntryVisible = "false";
    start.dataset.agentSubmenu = "false";
  }

  function submitPendingModeSelection() {
    if (!pendingMode) return;
    const sanitizedPlayerName = clampNameToMaxLength(playerNameInput.value, playerNameMaxLength);
    if (pendingMode === "agent" && sanitizedPlayerName.length > 0) {
      persistedAgentName = sanitizedPlayerName;
      writePersistedAgentName(sanitizedPlayerName);
    }
    callbacks.onSelectMode(pendingMode, sanitizedPlayerName);
  }

  function onSelectHuman() {
    if (disposed) return;
    revealNameEntry("human");
  }

  function onSelectAgent() {
    if (disposed) return;
    pendingMode = null;
    playerNameInput.placeholder = "ENTER NAME";
    start.dataset.nameEntryVisible = "false";
    start.dataset.agentSubmenu = "true";
  }

  function onNameInputKeyDown(event: KeyboardEvent) {
    if (disposed) return;
    if (event.key === "Escape") {
      event.preventDefault();
      hideNameEntry();
      return;
    }
    if (event.key !== "Enter" || !pendingMode) return;
    submitPendingModeSelection();
  }

  function showTransientBanner(message: string) {
    modeBanner.textContent = message;
    modeBanner.classList.add("show");

    clearBannerTimer();
    bannerTimer = window.setTimeout(() => {
      modeBanner.classList.remove("show");
      bannerTimer = null;
    }, 2200);
  }

  function onOpenSkillsMd() {
    if (disposed) return;
    showTransientBanner("Opening skills.md");
    const openedWindow = window.open(SKILLS_MD_PLACEHOLDER_URL, "_blank", "noopener,noreferrer");
    if (!openedWindow) {
      window.location.href = SKILLS_MD_PLACEHOLDER_URL;
    }
  }

  function onEnterAgentMode() {
    if (disposed) return;
    revealNameEntry("agent");
  }

  function onGlobalKeyDown(event: KeyboardEvent) {
    if (disposed || event.key !== "Escape") return;
    if (start.dataset.infoVisible === "true") {
      event.preventDefault();
      closeInfoScreen();
      window.requestAnimationFrame(() => {
        singlePlayerBtn.focus();
      });
      return;
    }
    resetToPrimaryButtons();
    window.requestAnimationFrame(() => {
      singlePlayerBtn.focus();
    });
  }

  start.addEventListener("pointerdown", onWarmupAudio, { passive: true });
  window.addEventListener("keydown", onWarmupAudio);
  window.addEventListener("keydown", onGlobalKeyDown);
  muteToggleBtn.addEventListener("click", onMuteToggleClick);
  infoBtn.addEventListener("click", toggleInfoScreen);
  singlePlayerBtn.addEventListener("click", onSelectHuman);
  multiPlayerBtn.addEventListener("click", onSelectAgent);
  skillsMdBtn.addEventListener("click", onOpenSkillsMd);
  enterAgentModeBtn.addEventListener("click", onEnterAgentMode);
  playerNameInput.addEventListener("keydown", onNameInputKeyDown);

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
      window.removeEventListener("keydown", onGlobalKeyDown);
      muteToggleBtn.removeEventListener("click", onMuteToggleClick);
      infoBtn.removeEventListener("click", toggleInfoScreen);
      singlePlayerBtn.removeEventListener("click", onSelectHuman);
      multiPlayerBtn.removeEventListener("click", onSelectAgent);
      skillsMdBtn.removeEventListener("click", onOpenSkillsMd);
      enterAgentModeBtn.removeEventListener("click", onEnterAgentMode);
      playerNameInput.removeEventListener("keydown", onNameInputKeyDown);
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
      showTransientBanner(message);
    },
    getState() {
      return {
        startVisible: start.style.display !== "none",
        bannerVisible: modeBanner.classList.contains("show"),
      };
    },
  };
}
