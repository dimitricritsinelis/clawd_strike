export type LoadingScreenMode = "human" | "agent";

export type RuntimeLaunchSelection = {
  mode: LoadingScreenMode;
  playerName: string;
};

export type LoadingScreenHandoff = {
  /**
   * Called once the loading screen UI is wired up (DOM, listeners, initial state).
   * Future game boot can use this to kick off runtime initialization in parallel.
   */
  onLoadingReady?: () => void;

  /**
   * Called when the game runtime finishes initializing (assets loaded, systems ready).
   * Optional hook for environments that bootstrap gameplay in parallel.
   */
  onGameRuntimeReady?: () => void;

  /**
   * Called when it's time to transition from the loading UI into gameplay.
   * Callers can stub or override this when gameplay bootstrap is unavailable.
   */
  transitionToGame?: (selection?: RuntimeLaunchSelection) => Promise<void> | void;
};
