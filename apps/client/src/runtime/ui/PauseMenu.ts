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

function applyButtonHover(btn: HTMLButtonElement, restBg: string, hoverBg: string): void {
  btn.addEventListener("mouseenter", () => {
    btn.style.borderColor = "rgba(255, 214, 150, 0.40)";
    btn.style.background = hoverBg;
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.borderColor = "rgba(255, 214, 150, 0.26)";
    btn.style.background = restBg;
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
  /** Called when the player wants to see the How to Play guide. */
  onShowHowToPlay: (() => void) | null = null;
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

    const buttonsGrid = document.createElement("div");
    Object.assign(buttonsGrid.style, {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "12px",
      width: "100%",
    });

    const baseBtnStyle = {
      border: "1px solid rgba(255, 214, 150, 0.26)",
      borderRadius: "8px",
      padding: "10px 14px",
      fontFamily: SANS_FONT,
      fontSize: "13px",
      fontWeight: "600",
      letterSpacing: "0.03em",
      cursor: "pointer",
    };

    const PRIMARY_BG = "rgba(44, 24, 10, 0.86)";
    const PRIMARY_HOVER = "rgba(56, 30, 12, 0.90)";
    const SECONDARY_BG = "rgba(22, 12, 5, 0.82)";
    const SECONDARY_HOVER = "rgba(34, 18, 8, 0.88)";

    const howToPlayBtn = document.createElement("button");
    howToPlayBtn.type = "button";
    howToPlayBtn.textContent = "How to Play";
    Object.assign(howToPlayBtn.style, baseBtnStyle, { background: PRIMARY_BG, color: "rgba(255, 241, 224, 0.94)" });
    applyButtonHover(howToPlayBtn, PRIMARY_BG, PRIMARY_HOVER);

    const controlsBtn = document.createElement("button");
    controlsBtn.type = "button";
    controlsBtn.textContent = "Controls";
    Object.assign(controlsBtn.style, baseBtnStyle, { background: PRIMARY_BG, color: "rgba(255, 241, 224, 0.94)" });
    applyButtonHover(controlsBtn, PRIMARY_BG, PRIMARY_HOVER);

    const gameBtn = document.createElement("button");
    gameBtn.type = "button";
    gameBtn.textContent = "Return to Game";
    Object.assign(gameBtn.style, baseBtnStyle, { background: SECONDARY_BG, color: "rgba(241, 213, 175, 0.70)" });
    applyButtonHover(gameBtn, SECONDARY_BG, SECONDARY_HOVER);

    const lobbyBtn = document.createElement("button");
    lobbyBtn.type = "button";
    lobbyBtn.textContent = "Return to Lobby";
    Object.assign(lobbyBtn.style, baseBtnStyle, { background: SECONDARY_BG, color: "rgba(241, 213, 175, 0.70)" });
    applyButtonHover(lobbyBtn, SECONDARY_BG, SECONDARY_HOVER);

    buttonsGrid.append(howToPlayBtn, controlsBtn, gameBtn, lobbyBtn);

    panel.append(titleEl, divider, hintEl, buttonsGrid);
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

    howToPlayBtn.addEventListener("click", () => {
      if (!this.visible) return;
      this.onShowHowToPlay?.();
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
