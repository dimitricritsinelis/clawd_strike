/**
 * MobileTouchHud — on-screen touch controls for mobile FPS gameplay.
 *
 * Creates DOM elements for:
 *  - Floating virtual joystick (left half)
 *  - Fire button (right side, large)
 *  - Reload, Jump, Crouch buttons (right side, smaller)
 *  - Pause button (top-left)
 *
 * Coordinates with TouchInputManager for button registration and joystick
 * visual callbacks. All elements use inline styles matching the existing
 * DOM-based HUD pattern.
 *
 * z-index 20 (below HUD elements at 22+, above canvas).
 */
import type { TouchInputManager } from "../input/TouchInputManager";

// ── Shared style helpers ─────────────────────────────────────────────

const SANS_FONT = '"Segoe UI", Tahoma, Verdana, sans-serif';

function applyButtonBase(el: HTMLElement, size: number): void {
  Object.assign(el.style, {
    position: "absolute",
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none",
    WebkitUserSelect: "none",
    WebkitTouchCallout: "none",
    touchAction: "none",
    pointerEvents: "auto",
    fontFamily: SANS_FONT,
    fontWeight: "700",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    boxSizing: "border-box",
  });
}

export class MobileTouchHud {
  private readonly root: HTMLDivElement;

  // Joystick visual elements
  private readonly joystickBase: HTMLDivElement;
  private readonly joystickKnob: HTMLDivElement;

  // Action buttons
  private readonly fireBtn: HTMLDivElement;
  private readonly reloadBtn: HTMLDivElement;
  private readonly jumpBtn: HTMLDivElement;
  private readonly crouchBtn: HTMLDivElement;
  private readonly pauseBtn: HTMLDivElement;

  private visible = true;
  private crouchActive = false;

  /** Called when pause button is tapped. Set by bootstrap. */
  onPause: (() => void) | null = null;

  constructor(mountEl: HTMLElement, private readonly touchInput: TouchInputManager) {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "fixed",
      inset: "0",
      zIndex: "20",
      pointerEvents: "none", // Passthrough by default; buttons opt in
      userSelect: "none",
      WebkitUserSelect: "none",
      WebkitTouchCallout: "none",
      touchAction: "none",
    });

    // ── Joystick base (hidden until touch) ────────────────────────────
    this.joystickBase = document.createElement("div");
    Object.assign(this.joystickBase.style, {
      position: "absolute",
      width: "90px",
      height: "90px",
      borderRadius: "50%",
      border: "2px solid rgba(255, 255, 255, 0.25)",
      background: "rgba(255, 255, 255, 0.08)",
      opacity: "0",
      pointerEvents: "none",
      transition: "opacity 0.1s",
      transform: "translate(-50%, -50%)",
    });

    this.joystickKnob = document.createElement("div");
    Object.assign(this.joystickKnob.style, {
      position: "absolute",
      width: "38px",
      height: "38px",
      borderRadius: "50%",
      background: "rgba(255, 255, 255, 0.35)",
      border: "2px solid rgba(255, 255, 255, 0.5)",
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      pointerEvents: "none",
    });
    this.joystickBase.append(this.joystickKnob);
    this.root.append(this.joystickBase);

    // ── Fire button ───────────────────────────────────────────────────
    this.fireBtn = document.createElement("div");
    applyButtonBase(this.fireBtn, 88);
    Object.assign(this.fireBtn.style, {
      right: "calc(16px + env(safe-area-inset-right, 0px))",
      bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
      background: "rgba(220, 60, 40, 0.45)",
      border: "4px solid rgba(255, 100, 80, 0.5)",
      fontSize: "13px",
      color: "rgba(255, 255, 255, 0.85)",
      boxShadow: "0 0 24px rgba(220, 60, 40, 0.35)",
    });
    this.fireBtn.textContent = "FIRE";
    this.root.append(this.fireBtn);
    touchInput.registerButton("fire", this.fireBtn);

    // ── Reload button ─────────────────────────────────────────────────
    this.reloadBtn = document.createElement("div");
    applyButtonBase(this.reloadBtn, 40);
    Object.assign(this.reloadBtn.style, {
      right: "calc(95px + env(safe-area-inset-right, 0px))",
      bottom: "calc(75px + env(safe-area-inset-bottom, 0px))",
      background: "rgba(255, 200, 100, 0.2)",
      border: "2px solid rgba(255, 214, 150, 0.35)",
      fontSize: "8px",
      color: "rgba(255, 241, 224, 0.75)",
    });
    this.reloadBtn.textContent = "R";
    this.root.append(this.reloadBtn);
    touchInput.registerButton("reload", this.reloadBtn);

    // ── Jump button ───────────────────────────────────────────────────
    this.jumpBtn = document.createElement("div");
    applyButtonBase(this.jumpBtn, 40);
    Object.assign(this.jumpBtn.style, {
      right: "calc(95px + env(safe-area-inset-right, 0px))",
      bottom: "calc(15px + env(safe-area-inset-bottom, 0px))",
      background: "rgba(255, 255, 255, 0.12)",
      border: "2px solid rgba(255, 255, 255, 0.3)",
      fontSize: "9px",
      color: "rgba(255, 255, 255, 0.7)",
    });
    // Jump arrow icon
    const jumpArrow = document.createElement("div");
    Object.assign(jumpArrow.style, {
      width: "0",
      height: "0",
      borderLeft: "8px solid transparent",
      borderRight: "8px solid transparent",
      borderBottom: "12px solid rgba(255, 255, 255, 0.7)",
    });
    this.jumpBtn.append(jumpArrow);
    this.root.append(this.jumpBtn);
    touchInput.registerButton("jump", this.jumpBtn);

    // ── Crouch button ─────────────────────────────────────────────────
    this.crouchBtn = document.createElement("div");
    applyButtonBase(this.crouchBtn, 40);
    Object.assign(this.crouchBtn.style, {
      left: "calc(16px + env(safe-area-inset-left, 0px))",
      bottom: "calc(75px + env(safe-area-inset-bottom, 0px))",
      background: "rgba(255, 255, 255, 0.12)",
      border: "2px solid rgba(255, 255, 255, 0.3)",
      fontSize: "9px",
      color: "rgba(255, 255, 255, 0.7)",
    });
    // Crouch arrow (downward)
    const crouchArrow = document.createElement("div");
    Object.assign(crouchArrow.style, {
      width: "0",
      height: "0",
      borderLeft: "8px solid transparent",
      borderRight: "8px solid transparent",
      borderTop: "12px solid rgba(255, 255, 255, 0.7)",
    });
    this.crouchBtn.append(crouchArrow);
    this.root.append(this.crouchBtn);
    touchInput.registerButton("crouch", this.crouchBtn);

    // ── Pause button ──────────────────────────────────────────────────
    this.pauseBtn = document.createElement("div");
    Object.assign(this.pauseBtn.style, {
      position: "absolute",
      top: "calc(12px + env(safe-area-inset-top, 0px))",
      left: "calc(12px + env(safe-area-inset-left, 0px))",
      width: "36px",
      height: "36px",
      borderRadius: "8px",
      background: "rgba(6, 10, 16, 0.5)",
      border: "1px solid rgba(255, 255, 255, 0.2)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "3px",
      pointerEvents: "auto",
      touchAction: "none",
      userSelect: "none",
      WebkitUserSelect: "none",
      cursor: "pointer",
    });
    // Two vertical bars (pause icon)
    for (let i = 0; i < 2; i++) {
      const bar = document.createElement("div");
      Object.assign(bar.style, {
        width: "4px",
        height: "16px",
        background: "rgba(255, 255, 255, 0.7)",
        borderRadius: "1px",
      });
      this.pauseBtn.append(bar);
    }
    this.pauseBtn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onPause?.();
    }, { passive: false });
    this.root.append(this.pauseBtn);

    mountEl.append(this.root);

    // ── Wire joystick visual callbacks ────────────────────────────────
    touchInput.onJoystickStart = (originX, originY) => {
      this.joystickBase.style.left = `${originX}px`;
      this.joystickBase.style.top = `${originY}px`;
      this.joystickBase.style.opacity = "1";
      this.joystickKnob.style.transform = "translate(-50%, -50%)";
    };

    touchInput.onJoystickMove = (dx, dy) => {
      this.joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    };

    touchInput.onJoystickEnd = () => {
      this.joystickBase.style.opacity = "0";
      this.joystickKnob.style.transform = "translate(-50%, -50%)";
    };
  }

  /** Update crouch button visual state to reflect toggle. */
  updateCrouchVisual(active: boolean): void {
    if (active === this.crouchActive) return;
    this.crouchActive = active;
    this.crouchBtn.style.background = active
      ? "rgba(255, 200, 100, 0.35)"
      : "rgba(255, 255, 255, 0.12)";
    this.crouchBtn.style.borderColor = active
      ? "rgba(255, 214, 150, 0.5)"
      : "rgba(255, 255, 255, 0.3)";
  }

  /** Update fire button visual state for feedback. */
  updateFireVisual(held: boolean): void {
    this.fireBtn.style.background = held
      ? "rgba(255, 80, 60, 0.6)"
      : "rgba(220, 60, 40, 0.45)";
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    this.root.style.display = visible ? "block" : "none";
  }

  relayout(): void {
    // Buttons use CSS calc with env() so they auto-adjust on resize.
    // Nothing extra needed for now.
  }

  dispose(): void {
    this.touchInput.unregisterButton("fire");
    this.touchInput.unregisterButton("reload");
    this.touchInput.unregisterButton("jump");
    this.touchInput.unregisterButton("crouch");
    this.touchInput.onJoystickStart = null;
    this.touchInput.onJoystickMove = null;
    this.touchInput.onJoystickEnd = null;
    this.root.remove();
  }
}
