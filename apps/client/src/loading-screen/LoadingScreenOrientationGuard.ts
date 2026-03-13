import { isMobileDevice } from "../runtime/input/MobileDetect";

/**
 * LoadingScreenOrientationGuard — blocks the loading screen when landscape on mobile.
 *
 * Shows a "rotate to portrait" overlay when the device is held in landscape
 * while on the loading/menu screen. Inverse of the gameplay MobileOrientationGuard
 * which enforces landscape.
 *
 * z-index 99 (below gameplay guard at 100, above everything else on loading screen).
 */
export class LoadingScreenOrientationGuard {
  private readonly overlay: HTMLDivElement;
  private showing = false;

  constructor(mountEl: HTMLElement) {
    if (!isMobileDevice()) {
      this.overlay = document.createElement("div");
      return;
    }

    this.overlay = document.createElement("div");
    Object.assign(this.overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "99",
      background: "rgba(6, 4, 2, 0.95)",
      display: "none",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "24px",
      userSelect: "none",
      WebkitUserSelect: "none",
    });

    // Phone icon (landscape orientation, hint to rotate to portrait)
    const icon = document.createElement("div");
    Object.assign(icon.style, {
      width: "120px",
      height: "80px",
      border: "3px solid rgba(255, 214, 150, 0.6)",
      borderRadius: "12px",
      position: "relative",
      animation: "loading-rotate-hint 2s ease-in-out infinite",
    });
    const screen = document.createElement("div");
    Object.assign(screen.style, {
      position: "absolute",
      inset: "8px",
      background: "rgba(255, 214, 150, 0.15)",
      borderRadius: "4px",
    });
    icon.append(screen);

    const text = document.createElement("div");
    Object.assign(text.style, {
      fontFamily: 'Georgia, "Palatino Linotype", Palatino, "Book Antiqua", serif',
      fontSize: "22px",
      fontWeight: "600",
      color: "rgba(255, 241, 224, 0.9)",
      letterSpacing: "0.06em",
      textAlign: "center",
      padding: "0 32px",
    });
    text.textContent = "Rotate your device to portrait";

    const subtext = document.createElement("div");
    Object.assign(subtext.style, {
      fontFamily: '"Segoe UI", Tahoma, Verdana, sans-serif',
      fontSize: "14px",
      color: "rgba(241, 213, 175, 0.5)",
      letterSpacing: "0.03em",
    });
    subtext.textContent = "The menu is best viewed in portrait mode";

    // Keyframe: rotate from landscape (0°) to portrait (-90°)
    const style = document.createElement("style");
    style.textContent = `
      @keyframes loading-rotate-hint {
        0%, 100% { transform: rotate(0deg); }
        25%, 75% { transform: rotate(-90deg); }
      }
    `;

    this.overlay.append(style, icon, text, subtext);
    mountEl.append(this.overlay);

    window.addEventListener("resize", this.check);
    window.addEventListener("orientationchange", this.check);

    // Run initial check
    this.check();
  }

  readonly check = (): void => {
    if (!isMobileDevice()) return;
    const isLandscape = window.innerWidth > window.innerHeight;
    if (isLandscape && !this.showing) {
      this.showing = true;
      this.overlay.style.display = "flex";
    } else if (!isLandscape && this.showing) {
      this.showing = false;
      this.overlay.style.display = "none";
    }
  };

  dispose(): void {
    window.removeEventListener("resize", this.check);
    window.removeEventListener("orientationchange", this.check);
    this.overlay.remove();
  }
}
