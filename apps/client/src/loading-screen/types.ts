export type LoadingScreenMode = "human" | "agent";

export type LoadingScreenHandoff = {
  /**
   * Called once the loading screen UI is wired up (DOM, listeners, initial state).
   * Future game boot can use this to kick off runtime initialization in parallel.
   */
  onLoadingReady?: () => void;

  /**
   * Called when the game runtime finishes initializing (assets loaded, systems ready).
   * This branch is loading-screen-only, so it will not be invoked yet.
   */
  onGameRuntimeReady?: () => void;

  /**
   * Called when it's time to transition from the loading UI into gameplay.
   * This branch is loading-screen-only, so callers can override to stub/route later.
   */
  transitionToGame?: () => Promise<void> | void;
};

