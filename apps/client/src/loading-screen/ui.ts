import type { LoadingScreenInitialNameEntry, LoadingScreenMode } from "./types";
import { LoadingScreenOrientationGuard } from "./LoadingScreenOrientationGuard";
import {
  getDeviceVariant,
  getLoadingScreenFallbackAssetUrl,
  getLoadingScreenImageSetValue,
  preloadLoadingScreenAsset,
  type LoadingScreenImageAssetKey,
} from "./assets";
import {
  type SharedChampionSnapshot,
} from "../../../shared/highScore";
import {
  clampPlayerNameInput,
  validatePlayerName,
  type PlayerNameValidationReason,
} from "../../../shared/playerName";

type LoadingScreenUICallbacks = {
  onWarmupAudio: () => void;
  onMuteToggle: () => void;
  onSelectMode: (mode: LoadingScreenMode, playerName: string) => void;
};

type BannerOptions = {
  persist?: boolean;
};

export type LoadingScreenUI = {
  show: () => void;
  dispose: () => void;
  primeNameEntry: (state: LoadingScreenInitialNameEntry) => void;
  setBackgroundReady: (ready: boolean) => void;
  setAssetReady: (ready: boolean) => void;
  setTransitioning: (active: boolean) => void;
  prepareMainMenuSurface: () => Promise<boolean>;
  prepareNameEntrySurface: () => Promise<boolean>;
  prepareInfoSurface: () => Promise<boolean>;
  warmLazyAssets: () => void;
  setSharedChampion: (snapshot: SharedChampionSnapshot) => void;
  setMuteState: (muted: boolean) => void;
  flashMuteToggle: () => void;
  showBanner: (message: string, options?: BannerOptions) => void;
  hideBanner: () => void;
  getState: () => {
    startVisible: boolean;
    bannerVisible: boolean;
    backgroundReady: boolean;
    assetsReady: boolean;
    nameEntryReady: boolean;
    infoReady: boolean;
    transitioning: boolean;
  };
};

const SKILLS_MD_PLACEHOLDER_URL = "/skills.md";
const AGENT_NAME_STORAGE_KEY = "clawd-strike:last-agent-name";
const NAME_INPUT_DEFAULT_PLACEHOLDER = "ENTER NAME";
const MENU_ART_FAILURE_BANNER = "Menu art unavailable";

function getRequiredEl<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing required loading screen element: ${selector}`);
  return el;
}

function readPersistedAgentName(): string {
  try {
    const stored = window.localStorage.getItem(AGENT_NAME_STORAGE_KEY);
    if (!stored) return "";
    return clampPlayerNameInput(stored);
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

function targetIsWithinInput(target: EventTarget | null, input: HTMLInputElement): boolean {
  return target instanceof Node && input.contains(target);
}

function clearDocumentSelection(): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  selection.removeAllRanges();
}

function formatLoadingChampionScore(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Math.max(0, Math.round(value)).toLocaleString("en-US");
}

function getPreferredPictureSource(image: HTMLImageElement): string | null {
  const picture = image.closest("picture");
  if (!(picture instanceof HTMLPictureElement)) return null;

  const sourceEls = Array.from(picture.querySelectorAll<HTMLSourceElement>("source[data-srcset]"));
  for (const sourceEl of sourceEls) {
    const deferredSrcset = sourceEl.dataset.srcset?.trim();
    if (!deferredSrcset) continue;
    if (sourceEl.media && !window.matchMedia(sourceEl.media).matches) continue;
    return deferredSrcset.split(",")[0]?.trim().split(/\s+/)[0] ?? null;
  }

  return null;
}

function bindFallbackImage(image: HTMLImageElement, fallbackSrc: string | undefined): void {
  if (!fallbackSrc || image.dataset.fallbackBound === "true") return;

  image.dataset.fallbackBound = "true";
  image.addEventListener(
    "error",
    () => {
      if (image.getAttribute("src") === fallbackSrc) return;
      image.src = fallbackSrc;
    },
    { once: true },
  );
}

function hydrateDeferredSources(root: ParentNode): HTMLImageElement[] {
  root.querySelectorAll<HTMLSourceElement>("source[data-srcset]").forEach((sourceEl) => {
    const deferredSrcset = sourceEl.dataset.srcset;
    if (!deferredSrcset || sourceEl.srcset === deferredSrcset) return;
    sourceEl.srcset = deferredSrcset;
  });

  const images = Array.from(root.querySelectorAll<HTMLImageElement>("img[data-src]"));
  for (const imageEl of images) {
    const fallbackSrc = imageEl.dataset.src;
    bindFallbackImage(imageEl, fallbackSrc);
    const preferredSrc = getPreferredPictureSource(imageEl) ?? fallbackSrc;
    if (!preferredSrc || imageEl.getAttribute("src") === preferredSrc) continue;
    imageEl.src = preferredSrc;
  }

  return images;
}

function isImageReady(image: HTMLImageElement): boolean {
  return image.currentSrc.length > 0 && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
}

function hasImageFailed(image: HTMLImageElement): boolean {
  return image.complete && (image.currentSrc.length === 0 || image.naturalWidth === 0 || image.naturalHeight === 0);
}

function waitForHydratedImages(images: HTMLImageElement[]): Promise<boolean> {
  if (images.length === 0) return Promise.resolve(true);

  return new Promise((resolve) => {
    const tick = () => {
      if (images.every((image) => isImageReady(image))) {
        resolve(true);
        return;
      }

      if (images.some((image) => hasImageFailed(image))) {
        resolve(false);
        return;
      }

      window.requestAnimationFrame(tick);
    };

    tick();
  });
}

const deferredBackgroundImageLoads = new WeakMap<HTMLElement, Promise<boolean>>();

function loadDeferredBackgroundImage(element: HTMLElement): Promise<boolean> {
  const existingPromise = deferredBackgroundImageLoads.get(element);
  if (existingPromise) return existingPromise;

  const assetKey = element.dataset.bgAssetKey?.trim() as LoadingScreenImageAssetKey | undefined;
  if (!assetKey) {
    return Promise.resolve(true);
  }
  if (element.style.backgroundImage.length > 0) {
    return Promise.resolve(true);
  }

  const loadPromise = preloadLoadingScreenAsset({ key: assetKey }).then((loaded) => {
    if (!loaded) {
      deferredBackgroundImageLoads.delete(element);
      return false;
    }

    if (element.style.backgroundImage.length === 0) {
      const variant = getDeviceVariant();
      element.style.backgroundImage = `url("${getLoadingScreenFallbackAssetUrl(assetKey, variant)}")`;
      element.style.backgroundImage = getLoadingScreenImageSetValue(assetKey, variant);
    }
    return true;
  });

  deferredBackgroundImageLoads.set(element, loadPromise);
  return loadPromise;
}

type IdleCapableWindow = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function scheduleIdleWork(task: () => void): number {
  const idleWindow = window as IdleCapableWindow;
  if (typeof idleWindow.requestIdleCallback === "function") {
    return idleWindow.requestIdleCallback(task, { timeout: 1200 });
  }

  return window.setTimeout(task, 180);
}

function cancelIdleWork(handle: number): void {
  const idleWindow = window as IdleCapableWindow;
  if (typeof idleWindow.cancelIdleCallback === "function") {
    idleWindow.cancelIdleCallback(handle);
    return;
  }

  window.clearTimeout(handle);
}

export function createLoadingScreenUI(callbacks: LoadingScreenUICallbacks): LoadingScreenUI {
  const start = getRequiredEl<HTMLDivElement>("#start");
  const loadingScreenOverlay = getRequiredEl<HTMLDivElement>("#loading-screen-overlay");
  const muteToggleBtn = getRequiredEl<HTMLButtonElement>("#mute-toggle-btn");
  const singlePlayerBtn = getRequiredEl<HTMLButtonElement>("#single-player-btn");
  const multiPlayerBtn = getRequiredEl<HTMLButtonElement>("#multi-player-btn");
  const infoBtn = getRequiredEl<HTMLButtonElement>("#info-btn");
  const skillsMdBtn = getRequiredEl<HTMLButtonElement>("#skills-md-btn");
  const enterAgentModeBtn = getRequiredEl<HTMLButtonElement>("#enter-agent-mode-btn");
  const infoScreen = getRequiredEl<HTMLDivElement>("#info-screen");
  const modeBanner = getRequiredEl<HTMLDivElement>("#mode-banner");
  const playerNameInput = getRequiredEl<HTMLInputElement>("#player-name-input");
  const nameEntry = getRequiredEl<HTMLDivElement>(".name-entry");
  const sharedChampionCard = getRequiredEl<HTMLElement>("#shared-champion-card");
  const sharedChampionNameEl = getRequiredEl<HTMLElement>("#shared-champion-name");
  const sharedChampionScoreEl = getRequiredEl<HTMLElement>("#shared-champion-score");

  let disposed = false;
  let bannerTimer: number | null = null;
  let pendingMode: LoadingScreenMode | null = null;
  let mainMenuSurfacePromise: Promise<boolean> | null = null;
  let nameEntrySurfacePromise: Promise<boolean> | null = null;
  let infoSurfacePromise: Promise<boolean> | null = null;
  let lazyWarmupHandle: number | null = null;
  let surfaceRequestToken = 0;
  let persistedAgentName = readPersistedAgentName();
  if (persistedAgentName.length > 0) {
    playerNameInput.value = persistedAgentName;
  }
  start.dataset.agentSubmenu = "false";
  start.dataset.nameEntryVisible = "false";
  start.dataset.nameEntryReady = "false";
  start.dataset.infoVisible = "false";
  start.dataset.infoReady = "false";
  start.dataset.backgroundReady = "false";
  start.dataset.assetsReady = "false";
  start.dataset.transitioning = "false";
  loadingScreenOverlay.setAttribute("aria-hidden", "true");

  // Portrait lock: show overlay when mobile user rotates to landscape on loading screen
  const loadingOrientationGuard = new LoadingScreenOrientationGuard(start);

  function setNameInputValidationState(reason: PlayerNameValidationReason): void {
    const invalid = reason !== "valid";
    playerNameInput.setAttribute("aria-invalid", invalid ? "true" : "false");
    if (invalid) {
      playerNameInput.dataset.validationReason = reason;
      return;
    }

    delete playerNameInput.dataset.validationReason;
  }

  function syncNameInputValidationState() {
    const result = validatePlayerName(playerNameInput.value);
    setNameInputValidationState(result.reason);
    return result;
  }

  function clearBannerTimer() {
    if (bannerTimer === null) return;
    window.clearTimeout(bannerTimer);
    bannerTimer = null;
  }

  function clearLazyWarmupHandle() {
    if (lazyWarmupHandle === null) return;
    cancelIdleWork(lazyWarmupHandle);
    lazyWarmupHandle = null;
  }

  function showBanner(message: string, options: BannerOptions = {}) {
    modeBanner.textContent = message;
    modeBanner.classList.add("show");

    clearBannerTimer();
    if (options.persist) return;

    bannerTimer = window.setTimeout(() => {
      modeBanner.classList.remove("show");
      bannerTimer = null;
    }, 2200);
  }

  function hideBanner() {
    clearBannerTimer();
    modeBanner.classList.remove("show");
    modeBanner.textContent = "";
  }

  function cancelPendingSurfaceReveal() {
    surfaceRequestToken += 1;
  }

  function prepareMainMenuSurface(): Promise<boolean> {
    if (mainMenuSurfacePromise) return mainMenuSurfacePromise;

    const overlayImages = hydrateDeferredSources(loadingScreenOverlay);
    mainMenuSurfacePromise = Promise.all([
      waitForHydratedImages(overlayImages),
      loadDeferredBackgroundImage(sharedChampionCard),
    ]).then(([imagesReady, championReady]) => imagesReady && championReady);
    return mainMenuSurfacePromise;
  }

  function prepareNameEntrySurface(): Promise<boolean> {
    if (nameEntrySurfacePromise) return nameEntrySurfacePromise;

    nameEntrySurfacePromise = loadDeferredBackgroundImage(nameEntry).then((ready) => {
      start.dataset.nameEntryReady = ready ? "true" : "false";
      if (!ready) {
        nameEntrySurfacePromise = null;
      }
      return ready;
    });
    return nameEntrySurfacePromise;
  }

  function prepareInfoSurface(): Promise<boolean> {
    if (infoSurfacePromise) return infoSurfacePromise;

    const surfaceImages = hydrateDeferredSources(infoScreen);
    infoSurfacePromise = waitForHydratedImages(surfaceImages).then((ready) => {
      start.dataset.infoReady = ready ? "true" : "false";
      if (!ready) {
        infoSurfacePromise = null;
      }
      return ready;
    });
    return infoSurfacePromise;
  }

  function queueLazyAssetWarmup() {
    if (lazyWarmupHandle !== null) return;
    lazyWarmupHandle = scheduleIdleWork(() => {
      lazyWarmupHandle = null;
      if (disposed) return;
      void prepareInfoSurface();
      void prepareNameEntrySurface();
    });
  }

  function onWarmupAudio() {
    if (disposed) return;
    callbacks.onWarmupAudio();
  }

  function onMuteToggleClick() {
    if (disposed) return;
    callbacks.onMuteToggle();
  }

  function allowNativeSelection(target: EventTarget | null): boolean {
    return targetIsWithinInput(target, playerNameInput);
  }

  function onStartPointerDown(event: PointerEvent) {
    if (disposed) return;
    if (!allowNativeSelection(event.target)) {
      clearDocumentSelection();
    }
    callbacks.onWarmupAudio();
  }

  function onStartSelectStart(event: Event) {
    if (disposed || allowNativeSelection(event.target)) return;
    clearDocumentSelection();
    event.preventDefault();
  }

  function onStartDragStart(event: DragEvent) {
    if (disposed || allowNativeSelection(event.target)) return;
    clearDocumentSelection();
    event.preventDefault();
  }

  function onStartPointerUp(event: PointerEvent) {
    if (disposed || allowNativeSelection(event.target)) return;
    clearDocumentSelection();
  }

  function resetToPrimaryButtons() {
    cancelPendingSurfaceReveal();
    pendingMode = null;
    playerNameInput.placeholder = NAME_INPUT_DEFAULT_PLACEHOLDER;
    setNameInputValidationState("valid");
    start.dataset.nameEntryVisible = "false";
    start.dataset.agentSubmenu = "false";
    start.dataset.infoVisible = "false";
    infoScreen.setAttribute("aria-hidden", "true");
  }

  function revealNameEntry(
    mode: LoadingScreenMode,
    options: {
      prefillValue?: string;
      shouldFocus?: boolean;
    } = {},
  ) {
    pendingMode = mode;
    playerNameInput.placeholder = mode === "agent" ? "AGENT NAME" : "HUMAN NAME";
    if (typeof options.prefillValue === "string") {
      playerNameInput.value = clampPlayerNameInput(options.prefillValue);
    } else if (mode === "agent" && persistedAgentName.length > 0) {
      playerNameInput.value = persistedAgentName;
    }
    syncNameInputValidationState();
    start.dataset.agentSubmenu = "false";
    start.dataset.nameEntryVisible = "true";
    if (options.shouldFocus !== false) {
      const focusInput = () => {
        if (disposed) return;
        if (start.dataset.assetsReady !== "true") {
          window.requestAnimationFrame(focusInput);
          return;
        }
        playerNameInput.focus();
        const caretPos = playerNameInput.value.length;
        playerNameInput.setSelectionRange(caretPos, caretPos);
      };
      window.requestAnimationFrame(focusInput);
    }
  }

  async function revealNameEntryWhenReady(
    mode: LoadingScreenMode,
    options: {
      prefillValue?: string;
      shouldFocus?: boolean;
    } = {},
  ): Promise<boolean> {
    const requestToken = ++surfaceRequestToken;
    const ready = await prepareNameEntrySurface();
    if (disposed || requestToken !== surfaceRequestToken) {
      return false;
    }
    if (!ready) {
      showBanner(MENU_ART_FAILURE_BANNER);
      return false;
    }

    revealNameEntry(mode, options);
    return true;
  }

  function hideNameEntry() {
    closeInfoScreen();
    resetToPrimaryButtons();
    window.requestAnimationFrame(() => {
      singlePlayerBtn.focus();
    });
  }

  async function showInfoScreenWhenReady(): Promise<boolean> {
    if (start.dataset.infoVisible === "true") return true;
    const requestToken = ++surfaceRequestToken;
    const ready = await prepareInfoSurface();
    if (disposed || requestToken !== surfaceRequestToken) {
      return false;
    }
    if (!ready) {
      showBanner(MENU_ART_FAILURE_BANNER);
      return false;
    }

    start.dataset.infoVisible = "true";
    infoScreen.setAttribute("aria-hidden", "false");
    closeNameAndModePanels();
    return true;
  }

  function closeInfoScreen() {
    cancelPendingSurfaceReveal();
    if (start.dataset.infoVisible !== "true") return;
    start.dataset.infoVisible = "false";
    infoScreen.setAttribute("aria-hidden", "true");
  }

  function toggleInfoScreen() {
    if (start.dataset.infoVisible === "true") {
      closeInfoScreen();
      window.requestAnimationFrame(() => {
        singlePlayerBtn.focus();
      });
      return;
    }
    void showInfoScreenWhenReady();
  }

  function closeNameAndModePanels() {
    pendingMode = null;
    playerNameInput.placeholder = NAME_INPUT_DEFAULT_PLACEHOLDER;
    setNameInputValidationState("valid");
    start.dataset.nameEntryVisible = "false";
    start.dataset.agentSubmenu = "false";
  }

  function submitPendingModeSelection() {
    if (!pendingMode) return;
    const validation = syncNameInputValidationState();
    if (!validation.ok) {
      return;
    }

    playerNameInput.value = validation.normalized;
    if (pendingMode === "agent") {
      persistedAgentName = validation.normalized;
      writePersistedAgentName(validation.normalized);
    }
    callbacks.onSelectMode(pendingMode, validation.normalized);
  }

  function onSelectHuman() {
    if (disposed) return;
    void revealNameEntryWhenReady("human");
  }

  function onSelectAgent() {
    if (disposed) return;
    cancelPendingSurfaceReveal();
    pendingMode = null;
    playerNameInput.placeholder = NAME_INPUT_DEFAULT_PLACEHOLDER;
    setNameInputValidationState("valid");
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

  function onNameInput(event: Event) {
    if (disposed) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    syncNameInputValidationState();
  }

  function onOpenSkillsMd() {
    if (disposed) return;
    showBanner("Opening skills.md");
    window.open(SKILLS_MD_PLACEHOLDER_URL, "_blank", "noopener,noreferrer");
  }

  function onEnterAgentMode() {
    if (disposed) return;
    void revealNameEntryWhenReady("agent");
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

  start.addEventListener("pointerdown", onStartPointerDown, { passive: true });
  start.addEventListener("pointerup", onStartPointerUp, { passive: true });
  start.addEventListener("selectstart", onStartSelectStart);
  start.addEventListener("dragstart", onStartDragStart);
  window.addEventListener("keydown", onWarmupAudio);
  window.addEventListener("keydown", onGlobalKeyDown);
  muteToggleBtn.addEventListener("click", onMuteToggleClick);
  infoBtn.addEventListener("click", toggleInfoScreen);
  singlePlayerBtn.addEventListener("click", onSelectHuman);
  multiPlayerBtn.addEventListener("click", onSelectAgent);
  skillsMdBtn.addEventListener("click", onOpenSkillsMd);
  enterAgentModeBtn.addEventListener("click", onEnterAgentMode);
  playerNameInput.addEventListener("input", onNameInput);
  playerNameInput.addEventListener("keydown", onNameInputKeyDown);

  function setSharedChampion(snapshot: SharedChampionSnapshot) {
    if (disposed) return;

    const champion = snapshot.champion;
    if (snapshot.status === "unavailable") {
      sharedChampionCard.dataset.state = "unavailable";
      sharedChampionNameEl.textContent = "RECORD OFFLINE";
      sharedChampionScoreEl.textContent = "N/A";
      return;
    }

    if (champion) {
      sharedChampionCard.dataset.state = "ready";
      sharedChampionNameEl.textContent = champion.holderName.toUpperCase();
      sharedChampionScoreEl.textContent = formatLoadingChampionScore(champion.score);
      return;
    }

    if (snapshot.status === "loading" || snapshot.status === "idle") {
      sharedChampionCard.dataset.state = "loading";
      sharedChampionNameEl.textContent = "SCANNING LEGENDS";
      sharedChampionScoreEl.textContent = "...";
      return;
    }

    sharedChampionCard.dataset.state = "empty";
    sharedChampionNameEl.textContent = "CLAIM THE CROWN";
    sharedChampionScoreEl.textContent = "9999";
  }

  return {
    show() {
      start.style.display = "grid";
    },
    primeNameEntry(state) {
      void revealNameEntryWhenReady(state.mode, {
        prefillValue: state.playerName,
      }).then((revealed) => {
        if (!revealed || disposed || pendingMode !== state.mode) return;
        setNameInputValidationState(state.validationReason);
      });
    },
    setBackgroundReady(ready) {
      const nextValue = ready ? "true" : "false";
      if (start.dataset.backgroundReady === nextValue) return;
      start.dataset.backgroundReady = nextValue;
    },
    setAssetReady(ready) {
      const nextValue = ready ? "true" : "false";
      if (start.dataset.assetsReady === nextValue) return;
      start.dataset.assetsReady = nextValue;
      loadingScreenOverlay.setAttribute("aria-hidden", ready ? "false" : "true");
      if (ready) {
        queueLazyAssetWarmup();
      }
    },
    setTransitioning(active) {
      const nextValue = active ? "true" : "false";
      if (start.dataset.transitioning === nextValue) return;
      start.dataset.transitioning = nextValue;
    },
    prepareMainMenuSurface() {
      return prepareMainMenuSurface();
    },
    prepareNameEntrySurface() {
      return prepareNameEntrySurface();
    },
    prepareInfoSurface() {
      return prepareInfoSurface();
    },
    warmLazyAssets() {
      queueLazyAssetWarmup();
    },
    setSharedChampion,
    dispose() {
      if (disposed) return;
      disposed = true;
      clearBannerTimer();
      clearLazyWarmupHandle();

      start.removeEventListener("pointerdown", onStartPointerDown);
      start.removeEventListener("pointerup", onStartPointerUp);
      start.removeEventListener("selectstart", onStartSelectStart);
      start.removeEventListener("dragstart", onStartDragStart);
      window.removeEventListener("keydown", onWarmupAudio);
      window.removeEventListener("keydown", onGlobalKeyDown);
      muteToggleBtn.removeEventListener("click", onMuteToggleClick);
      infoBtn.removeEventListener("click", toggleInfoScreen);
      singlePlayerBtn.removeEventListener("click", onSelectHuman);
      multiPlayerBtn.removeEventListener("click", onSelectAgent);
      skillsMdBtn.removeEventListener("click", onOpenSkillsMd);
      enterAgentModeBtn.removeEventListener("click", onEnterAgentMode);
      playerNameInput.removeEventListener("input", onNameInput);
      playerNameInput.removeEventListener("keydown", onNameInputKeyDown);
      loadingOrientationGuard.dispose();
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
    showBanner(message, options) {
      showBanner(message, options);
    },
    hideBanner() {
      hideBanner();
    },
    getState() {
      return {
        startVisible: start.style.display !== "none",
        bannerVisible: modeBanner.classList.contains("show"),
        backgroundReady: start.dataset.backgroundReady === "true",
        assetsReady: start.dataset.assetsReady === "true",
        nameEntryReady: start.dataset.nameEntryReady === "true",
        infoReady: start.dataset.infoReady === "true",
        transitioning: start.dataset.transitioning === "true",
      };
    },
  };
}
