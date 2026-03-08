/**
 * ControlsOverlay — shows keybinding reference when opened from the PauseMenu.
 * Sits above the PauseMenu at z-index 35.
 * Closes on Esc (handled in bootstrap) or close button.
 *
 * Desert bazaar theme: warm sand/gold/brown palette matching the PauseMenu and loading screen.
 */

const SERIF_FONT = 'Georgia, "Palatino Linotype", Palatino, "Book Antiqua", serif';
const SANS_FONT = '"Segoe UI", Tahoma, Verdana, sans-serif';

const KEYBINDINGS: Array<{ keys: string[]; action: string }> = [
  { keys: ["W", "A", "S", "D"], action: "Move" },
  { keys: ["Mouse"], action: "Look" },
  { keys: ["Left", "Click"], action: "Fire" },
  { keys: ["R"], action: "Reload" },
  { keys: ["Space"], action: "Jump" },
  { keys: ["Shift"], action: "Crouch" },
  { keys: ["Esc"], action: "Pause / Resume" },
];

function createKeyBadge(label: string): HTMLSpanElement {
  const badge = document.createElement("span");
  Object.assign(badge.style, {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: label.length > 1 ? "auto" : "34px",
    height: "34px",
    padding: label.length > 1 ? "0 12px" : "0",
    borderRadius: "6px",
    background: "rgba(44, 24, 10, 0.72)",
    border: "1px solid rgba(255, 214, 150, 0.30)",
    boxShadow:
      "inset 0 2px 4px rgba(0, 0, 0, 0.3), 0 1px 0 rgba(255, 232, 202, 0.06)",
    fontFamily: SANS_FONT,
    fontSize: "13px",
    fontWeight: "700",
    color: "#ffd78d",
    letterSpacing: "0.02em",
  });
  badge.textContent = label;
  return badge;
}

export class ControlsOverlay {
  readonly root: HTMLDivElement;

  private visible = false;
  private fadeTimerS = 0;
  private readonly FADE_IN_S = 0.2;

  /** Called when the overlay closes. */
  onClose: (() => void) | null = null;

  constructor(mountEl: HTMLElement) {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "fixed",
      inset: "0",
      background: "rgba(10, 6, 3, 0.72)",
      zIndex: "35",
      display: "none",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      pointerEvents: "none",
      opacity: "0",
      userSelect: "none",
      backdropFilter: "blur(3px)",
    });

    // Panel
    const panel = document.createElement("div");
    Object.assign(panel.style, {
      position: "relative",
      background:
        "linear-gradient(180deg, rgba(44, 24, 10, 0.88), rgba(20, 11, 5, 0.84))",
      border: "1px solid rgba(247, 214, 160, 0.22)",
      borderRadius: "14px",
      padding: "32px 48px 36px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "0",
      boxShadow:
        "0 16px 34px rgba(0, 0, 0, 0.40), inset 0 1px 0 rgba(255, 232, 202, 0.08)",
      maxHeight: "80vh",
      overflowY: "auto",
    });

    // Close button (×)
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "\u00D7";
    Object.assign(closeBtn.style, {
      position: "absolute",
      top: "10px",
      right: "14px",
      border: "none",
      background: "transparent",
      color: "rgba(241, 213, 175, 0.55)",
      fontSize: "24px",
      cursor: "pointer",
      padding: "4px 8px",
      lineHeight: "1",
    });
    closeBtn.addEventListener("mouseenter", () => {
      closeBtn.style.color = "rgba(255, 241, 224, 0.90)";
    });
    closeBtn.addEventListener("mouseleave", () => {
      closeBtn.style.color = "rgba(241, 213, 175, 0.55)";
    });

    // Title
    const titleEl = document.createElement("div");
    Object.assign(titleEl.style, {
      fontFamily: SERIF_FONT,
      fontSize: "36px",
      fontWeight: "700",
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: "rgba(255, 241, 224, 0.94)",
      textShadow: "0 0 30px rgba(255, 200, 100, 0.3)",
    });
    titleEl.textContent = "CONTROLS";

    // Ornamental divider
    const divider = document.createElement("div");
    Object.assign(divider.style, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      margin: "16px 0 20px",
      width: "220px",
    });
    const lineLeft = document.createElement("div");
    Object.assign(lineLeft.style, {
      flex: "1",
      height: "1px",
      background:
        "linear-gradient(90deg, transparent, rgba(247, 214, 160, 0.3))",
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
      background:
        "linear-gradient(90deg, rgba(247, 214, 160, 0.3), transparent)",
    });
    divider.append(lineLeft, diamond, lineRight);

    // Keybinding rows
    const bindingsContainer = document.createElement("div");
    Object.assign(bindingsContainer.style, {
      display: "flex",
      flexDirection: "column",
      gap: "0",
      width: "100%",
      minWidth: "320px",
    });

    for (const binding of KEYBINDINGS) {
      const row = document.createElement("div");
      Object.assign(row.style, {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 0",
        borderBottom: "1px solid rgba(247, 214, 160, 0.08)",
        gap: "24px",
      });

      const keysContainer = document.createElement("div");
      Object.assign(keysContainer.style, {
        display: "flex",
        gap: "5px",
        flexShrink: "0",
      });

      for (const key of binding.keys) {
        keysContainer.append(createKeyBadge(key));
      }

      const actionEl = document.createElement("span");
      Object.assign(actionEl.style, {
        fontFamily: SERIF_FONT,
        fontSize: "14px",
        fontWeight: "500",
        color: "rgba(255, 241, 224, 0.82)",
        letterSpacing: "0.04em",
        textAlign: "right",
      });
      actionEl.textContent = binding.action;

      row.append(keysContainer, actionEl);
      bindingsContainer.append(row);
    }

    // Bottom hint
    const hintEl = document.createElement("div");
    Object.assign(hintEl.style, {
      fontFamily: SERIF_FONT,
      fontSize: "13px",
      fontWeight: "400",
      color: "rgba(241, 213, 175, 0.45)",
      letterSpacing: "0.04em",
      marginTop: "18px",
    });
    hintEl.textContent = "Press Escape to close";

    panel.append(closeBtn, titleEl, divider, bindingsContainer, hintEl);
    this.root.append(panel);
    mountEl.append(this.root);

    closeBtn.addEventListener("click", () => {
      if (!this.visible) return;
      this.hide();
      this.onClose?.();
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
