/**
 * PauseMenu — shown when the player presses Escape while pointer locked.
 * Displays a semi-transparent overlay with "PAUSED" and actions.
 * Escape always resumes gameplay.
 * z-index 34 (above DeathScreen at 32).
 */
export class PauseMenu {
  readonly root: HTMLDivElement;

  private visible = false;
  private fadeTimerS = 0;
  private readonly FADE_IN_S = 0.2;

  /** Called when the player resumes (button or Esc). */
  onResume: (() => void) | null = null;
  /** Called when the player wants to return to lobby. */
  onReturnToLobby: (() => void) | null = null;

  constructor(mountEl: HTMLElement) {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "fixed",
      inset: "0",
      background: "rgba(0, 0, 0, 0.58)",
      zIndex: "34",
      display: "none",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      pointerEvents: "none",
      opacity: "0",
      userSelect: "none",
      backdropFilter: "blur(2px)",
    });

    // Glass panel
    const panel = document.createElement("div");
    Object.assign(panel.style, {
      background: "rgba(8, 16, 28, 0.82)",
      border: "1px solid rgba(255,255,255,0.10)",
      borderRadius: "12px",
      padding: "38px 64px 36px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "0",
    });

    const titleEl = document.createElement("div");
    Object.assign(titleEl.style, {
      fontFamily: '"Segoe UI", Tahoma, Verdana, sans-serif',
      fontSize: "52px",
      fontWeight: "780",
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color: "#e8f0ff",
      textShadow: "0 0 30px rgba(100,160,255,0.3)",
    });
    titleEl.textContent = "PAUSED";

    const divider = document.createElement("div");
    Object.assign(divider.style, {
      width: "180px",
      height: "1px",
      background: "rgba(255,255,255,0.10)",
      margin: "20px 0",
    });

    const hintEl = document.createElement("div");
    Object.assign(hintEl.style, {
      fontFamily: '"Segoe UI", Tahoma, Verdana, sans-serif',
      fontSize: "15px",
      fontWeight: "400",
      color: "rgba(180, 200, 230, 0.55)",
      letterSpacing: "0.04em",
      marginBottom: "18px",
    });
    hintEl.textContent = "Press Escape to return to game";

    const actionsEl = document.createElement("div");
    Object.assign(actionsEl.style, {
      display: "flex",
      gap: "12px",
      alignItems: "center",
      justifyContent: "center",
    });

    const gameBtn = document.createElement("button");
    gameBtn.type = "button";
    gameBtn.textContent = "Return to Game";
    Object.assign(gameBtn.style, {
      border: "1px solid rgba(182, 206, 232, 0.26)",
      background: "rgba(18, 36, 58, 0.86)",
      color: "#e8f0ff",
      borderRadius: "8px",
      padding: "10px 14px",
      fontFamily: '"Segoe UI", Tahoma, Verdana, sans-serif',
      fontSize: "13px",
      fontWeight: "600",
      letterSpacing: "0.03em",
      cursor: "pointer",
    });

    const lobbyBtn = document.createElement("button");
    lobbyBtn.type = "button";
    lobbyBtn.textContent = "Return to Lobby";
    Object.assign(lobbyBtn.style, {
      border: "1px solid rgba(182, 206, 232, 0.20)",
      background: "rgba(8, 14, 24, 0.86)",
      color: "rgba(224, 236, 252, 0.92)",
      borderRadius: "8px",
      padding: "10px 14px",
      fontFamily: '"Segoe UI", Tahoma, Verdana, sans-serif',
      fontSize: "13px",
      fontWeight: "600",
      letterSpacing: "0.03em",
      cursor: "pointer",
    });

    actionsEl.append(gameBtn, lobbyBtn);
    panel.append(titleEl, divider, hintEl, actionsEl);
    this.root.append(panel);
    mountEl.append(this.root);

    gameBtn.addEventListener("click", () => {
      if (!this.visible) return;
      this.hide();
      this.onResume?.();
    });

    lobbyBtn.addEventListener("click", () => {
      if (!this.visible) return;
      this.hide();
      this.onReturnToLobby?.();
    });
  }

  show(): void {
    if (this.visible) return;
    this.visible = true;
    this.fadeTimerS = 0;
    this.root.style.display = "flex";
    this.root.style.opacity = "0";
    this.root.style.pointerEvents = "auto";
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.root.style.display = "none";
    this.root.style.opacity = "0";
    this.root.style.pointerEvents = "none";
  }

  toggle(): void {
    if (this.visible) {
      this.hide();
      this.onResume?.();
    } else {
      this.show();
    }
  }

  update(deltaSeconds: number): void {
    if (!this.visible) return;
    this.fadeTimerS = Math.min(this.FADE_IN_S, this.fadeTimerS + deltaSeconds);
    this.root.style.opacity = (this.fadeTimerS / this.FADE_IN_S).toFixed(3);
  }

  isVisible(): boolean {
    return this.visible;
  }

  dispose(): void {
    this.root.remove();
  }
}
