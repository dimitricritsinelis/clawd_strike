import "./styles.css";
import type { LoadingScreenHandle } from "./loading-screen/bootstrap";
import { bootstrapLoadingScreen } from "./loading-screen/bootstrap";

let loadingHandle: LoadingScreenHandle | null = null;
let runtimeHandle: { teardown: () => void } | null = null;
let runtimeBootPromise: Promise<void> | null = null;
const autoStartMode = new URLSearchParams(window.location.search).get("autostart");

function hideLoadingOverlay(): void {
  const startOverlay = document.querySelector<HTMLElement>("#start");
  if (startOverlay) {
    startOverlay.style.display = "none";
  }

  const overlay = document.querySelector<HTMLElement>("#overlay");
  if (overlay) {
    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
  }
}

async function transitionToGame(): Promise<void> {
  if (runtimeHandle) return;
  if (runtimeBootPromise) return runtimeBootPromise;

  runtimeBootPromise = (async () => {
    const { bootstrapRuntime } = await import("./runtime/bootstrap");
    runtimeHandle = await bootstrapRuntime();
    hideLoadingOverlay();

    loadingHandle?.teardown();
    loadingHandle = null;
  })().finally(() => {
    runtimeBootPromise = null;
  });

  return runtimeBootPromise;
}

loadingHandle = bootstrapLoadingScreen({
  handoff: {
    transitionToGame,
  },
});

if (autoStartMode === "human") {
  void transitionToGame();
}
