/**
 * MobileFullscreenHint — one-time overlay suggesting users hide the Safari
 * address bar or add to home screen for a fullscreen experience.
 *
 * Shows once per session (tracked via sessionStorage). Auto-dismisses after
 * 3 seconds or on tap. z-index 50 (between orientation guard at 100 and
 * HUD at 22).
 */

const STORAGE_KEY = "clawd-strike:fullscreen-hint-shown";
const DISMISS_DELAY_MS = 3000;
const FADE_DURATION_MS = 400;

export class MobileFullscreenHint {
  private readonly root: HTMLDivElement;
  private dismissed = false;
  private timer: number | null = null;

  constructor(private readonly mountEl: HTMLElement) {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "fixed",
      inset: "0",
      zIndex: "50",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0, 0, 0, 0.72)",
      backdropFilter: "blur(2px)",
      opacity: "0",
      transition: `opacity ${FADE_DURATION_MS}ms ease`,
      pointerEvents: "auto",
      touchAction: "none",
      userSelect: "none",
      WebkitUserSelect: "none",
    } as CSSStyleDeclaration);

    const text = document.createElement("div");
    Object.assign(text.style, {
      color: "rgba(255, 255, 255, 0.92)",
      fontFamily: '"Segoe UI", Tahoma, Verdana, sans-serif',
      fontSize: "14px",
      fontWeight: "600",
      letterSpacing: "0.06em",
      textAlign: "center",
      lineHeight: "1.5",
      padding: "0 32px",
      maxWidth: "400px",
    });
    text.textContent = "For the best experience, add this page to your Home Screen for fullscreen play.";

    const subtext = document.createElement("div");
    Object.assign(subtext.style, {
      color: "rgba(255, 255, 255, 0.55)",
      fontFamily: '"Segoe UI", Tahoma, Verdana, sans-serif',
      fontSize: "11px",
      fontWeight: "500",
      letterSpacing: "0.04em",
      textAlign: "center",
      marginTop: "12px",
    });
    subtext.textContent = "Tap anywhere to continue";

    this.root.append(text, subtext);

    // Dismiss on tap
    this.root.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        this.dismiss();
      },
      { passive: false },
    );
    this.root.addEventListener("click", () => this.dismiss());
  }

  show(): void {
    // Only show once per session
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === "true") return;
    } catch {
      // sessionStorage unavailable — skip hint
      return;
    }

    this.mountEl.append(this.root);

    // Fade in on next frame
    requestAnimationFrame(() => {
      this.root.style.opacity = "1";
    });

    // Auto-dismiss after delay
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.dismiss();
    }, DISMISS_DELAY_MS);

    // Mark as shown
    try {
      sessionStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // Ignore storage errors
    }
  }

  private dismiss(): void {
    if (this.dismissed) return;
    this.dismissed = true;

    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }

    this.root.style.opacity = "0";
    this.root.style.pointerEvents = "none";

    setTimeout(() => {
      this.root.remove();
    }, FADE_DURATION_MS);
  }
}
