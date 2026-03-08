/**
 * PauseMenu — shown when the player presses Escape while pointer locked.
 * Displays a semi-transparent overlay with "PAUSED" and actions.
 * Escape always resumes gameplay.
 * z-index 34 (above DeathScreen at 32).
 *
 * Desert bazaar theme: warm sand/gold/brown palette matching the loading screen.
 */

const SERIF_FONT = 'Georgia, "Palatino Linotype", Palatino, "Book Antiqua", serif';
const SANS_FONT = '"Segoe UI", Tahoma, Verdana, sans-serif';

function applyButtonHover(btn: HTMLButtonElement): void {
  btn.addEventListener("mouseenter", () => {
    btn.style.borderColor = "rgba(255, 214, 150, 0.40)";
    btn.style.background = "rgba(56, 30, 12, 0.90)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.borderColor = "rgba(255, 214, 150, 0.26)";
    btn.style.background = "rgba(44, 24, 10, 0.86)";
  });
}

/** Creates the ornamental divider: gradient line – gold diamond – gradient line. */
function createOrnamentalDivider(): HTMLDivElement {
  const divider = document.createElement("div");
  Object.assign(divider.style, {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    margin: "20px 0",
    width: "220px",
  });

  const lineLeft = document.createElement("div");
  Object.assign(lineLeft.style, {
    flex: "1",
    height: "1px",
    background: "linear-gradient(90deg, transparent, rgba(247, 214, 160, 0.3))",
  });

  const diamond = document.createElement("div");
  Object.assign(diamond.style, {
    width: "8px",
    height: "8px",
    background: "rgba(255, 200, 100, 0.4)",
    transform: "rotate(45deg)",
    flexShrink: "0",
  });

  const lineRight = document.createElement("div");
  Object.assign(lineRight.style, {
    flex: "1",
    height: "1px",
    background: "linear-gradient(90deg, rgba(247, 214, 160, 0.3), transparent)",
  });

  divider.append(lineLeft, diamond, lineRight);
  return divider;
}

export class PauseMenu {
  readonly root: HTMLDivElement;

  private visible = false;
  private fadeTimerS = 0;
  private readonly FADE_IN_S = 0.2;

  /** Called when the player resumes (button or Esc). */
  onResume: (() => void) | null = null;
  /** Called when the player wants to return to lobby. */
  onReturnToLobby: (() => void) | null = null;
  /** Called when the player wants to see controls. */
  onShowControls: (() => void) | null = null;

  constructor(mountEl: HTMLElement) {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "fixed",
      inset: "0",
      background: "rgba(10, 6, 3, 0.62)",
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

    // Warm sand panel
    const panel = document.createElement("div");
    Object.assign(panel.style, {
      background: "linear-gradient(180deg, rgba(44, 24, 10, 0.82), rgba(20, 11, 5, 0.78))",
      border: "1px solid rgba(247, 214, 160, 0.22)",
      borderRadius: "14px",
      padding: "38px 64px 36px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "0",
      boxShadow: "0 16px 34px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 232, 202, 0.08)",
    });

    const titleEl = document.createElement("div");
    Object.assign(titleEl.style, {
      fontFamily: SERIF_FONT,
      fontSize: "52px",
      fontWeight: "700",
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: "rgba(255, 241, 224, 0.94)",
      textShadow: "0 0 30px rgba(255, 200, 100, 0.3)",
    });
    titleEl.textContent = "PAUSED";

    const divider = createOrnamentalDivider();

    const hintEl = document.createElement("div");
    Object.assign(hintEl.style, {
      fontFamily: SERIF_FONT,
      fontSize: "15px",
      fontWeight: "400",
      color: "rgba(241, 213, 175, 0.55)",
      letterSpacing: "0.04em",
      marginBottom: "18px",
    });
    hintEl.textContent = "Press Escape to return to game";

    // Top row: Return to Game + Return to Lobby
    const actionsEl = document.createElement("div");
    Object.assign(actionsEl.style, {
      display: "flex",
      gap: "12px",
      alignItems: "center",
      justifyContent: "center",
      flexWrap: "wrap",
    });

    const gameBtn = document.createElement("button");
    gameBtn.type = "button";
    gameBtn.textContent = "Return to Game";
    Object.assign(gameBtn.style, {
      border: "1px solid rgba(255, 214, 150, 0.26)",
      background: "rgba(44, 24, 10, 0.86)",
      color: "rgba(255, 241, 224, 0.94)",
      borderRadius: "8px",
      padding: "10px 14px",
      fontFamily: SANS_FONT,
      fontSize: "13px",
      fontWeight: "600",
      letterSpacing: "0.03em",
      cursor: "pointer",
    });
    applyButtonHover(gameBtn);

    const lobbyBtn = document.createElement("button");
    lobbyBtn.type = "button";
    lobbyBtn.textContent = "Return to Lobby";
    Object.assign(lobbyBtn.style, {
      border: "1px solid rgba(255, 214, 150, 0.26)",
      background: "rgba(44, 24, 10, 0.86)",
      color: "rgba(255, 241, 224, 0.94)",
      borderRadius: "8px",
      padding: "10px 14px",
      fontFamily: SANS_FONT,
      fontSize: "13px",
      fontWeight: "600",
      letterSpacing: "0.03em",
      cursor: "pointer",
    });
    applyButtonHover(lobbyBtn);

    actionsEl.append(gameBtn, lobbyBtn);

    // Controls button on its own row
    const controlsRow = document.createElement("div");
    Object.assign(controlsRow.style, {
      display: "flex",
      justifyContent: "center",
      marginTop: "10px",
    });

    const controlsBtn = document.createElement("button");
    controlsBtn.type = "button";
    controlsBtn.textContent = "Controls";
    Object.assign(controlsBtn.style, {
      border: "1px solid rgba(255, 214, 150, 0.26)",
      background: "rgba(44, 24, 10, 0.86)",
      color: "rgba(255, 241, 224, 0.94)",
      borderRadius: "8px",
      padding: "10px 14px",
      fontFamily: SANS_FONT,
      fontSize: "13px",
      fontWeight: "600",
      letterSpacing: "0.03em",
      cursor: "pointer",
    });
    applyButtonHover(controlsBtn);

    controlsRow.append(controlsBtn);

    panel.append(titleEl, divider, hintEl, actionsEl, controlsRow);
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

    controlsBtn.addEventListener("click", () => {
      if (!this.visible) return;
      this.onShowControls?.();
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
