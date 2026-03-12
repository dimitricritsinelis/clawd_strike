/**
 * TouchInputManager — multi-touch input system for mobile FPS controls.
 *
 * Tracks simultaneous touches for:
 *  - Floating joystick (left half of screen)
 *  - Look/aim drag (right half of screen, outside buttons)
 *  - Action buttons (fire, reload, jump, crouch — managed via element refs)
 *
 * Each touch is assigned a single role at `touchstart` time based on where it
 * lands (screen zone or registered button element). Roles never reassign during
 * a gesture. All listeners use `{ passive: false }` with `preventDefault()` to
 * suppress Safari scroll/bounce.
 */

const JOYSTICK_MAX_RADIUS = 60; // px — max distance knob can travel from origin

type ButtonRole = "fire" | "reload" | "jump" | "crouch";

export class TouchInputManager {
  // ── Public state consumed each frame by Game.feedMobileInput() ──────
  moveX = 0;
  moveZ = 0;
  lookDeltaX = 0;
  lookDeltaY = 0;
  fireHeld = false;
  jumpQueued = false;
  reloadQueued = false;
  crouchHeld = false;

  // ── Joystick visual callbacks (set by MobileTouchHud) ──────────────
  onJoystickStart: ((originX: number, originY: number) => void) | null = null;
  onJoystickMove: ((dx: number, dy: number) => void) | null = null;
  onJoystickEnd: (() => void) | null = null;

  // ── Internal multi-touch tracking ──────────────────────────────────
  private joystickTouchId: number | null = null;
  private joystickOriginX = 0;
  private joystickOriginY = 0;

  private lookTouchId: number | null = null;
  private lastLookX = 0;
  private lastLookY = 0;

  private readonly buttonTouchIds = new Map<number, ButtonRole>();
  private readonly buttonElements = new Map<ButtonRole, HTMLElement>();

  // Crouch is toggled, not held (tap to crouch, tap again to stand)
  private crouchToggled = false;

  private readonly el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
  }

  /** Register a button element so touches on it are assigned the correct role. */
  registerButton(role: ButtonRole, element: HTMLElement): void {
    this.buttonElements.set(role, element);
  }

  unregisterButton(role: ButtonRole): void {
    this.buttonElements.delete(role);
  }

  init(): void {
    this.el.addEventListener("touchstart", this.onTouchStart, { passive: false });
    this.el.addEventListener("touchmove", this.onTouchMove, { passive: false });
    this.el.addEventListener("touchend", this.onTouchEnd, { passive: false });
    this.el.addEventListener("touchcancel", this.onTouchEnd, { passive: false });
  }

  /** Zero out per-frame accumulators after Game has consumed them. */
  consumeFrame(): void {
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.jumpQueued = false;
    this.reloadQueued = false;
  }

  dispose(): void {
    this.el.removeEventListener("touchstart", this.onTouchStart);
    this.el.removeEventListener("touchmove", this.onTouchMove);
    this.el.removeEventListener("touchend", this.onTouchEnd);
    this.el.removeEventListener("touchcancel", this.onTouchEnd);
  }

  resetState(): void {
    this.moveX = 0;
    this.moveZ = 0;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.fireHeld = false;
    this.jumpQueued = false;
    this.reloadQueued = false;
    this.crouchHeld = false;
    this.crouchToggled = false;
    this.joystickTouchId = null;
    this.lookTouchId = null;
    this.buttonTouchIds.clear();
    this.onJoystickEnd?.();
  }

  // ── Touch handlers ──────────────────────────────────────────────────

  private readonly onTouchStart = (e: TouchEvent): void => {
    // Only preventDefault when we claim a touch — unrecognised touches must
    // propagate so overlay UI (pause menu, death screen, etc.) still receives
    // synthetic click events from the browser.
    let claimed = false;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i]!;
      const id = touch.identifier;
      const x = touch.clientX;
      const y = touch.clientY;

      // 1) Check if touch landed on a registered button element
      const buttonRole = this.getButtonRoleAtPoint(x, y);
      if (buttonRole) {
        this.buttonTouchIds.set(id, buttonRole);
        this.applyButtonDown(buttonRole);
        claimed = true;
        continue;
      }

      // 2) Left half → joystick (only one joystick touch at a time)
      const screenMidX = window.innerWidth / 2;
      if (x < screenMidX && this.joystickTouchId === null) {
        this.joystickTouchId = id;
        this.joystickOriginX = x;
        this.joystickOriginY = y;
        this.moveX = 0;
        this.moveZ = 0;
        this.onJoystickStart?.(x, y);
        claimed = true;
        continue;
      }

      // 3) Right half (not on a button) → look/aim
      if (x >= screenMidX && this.lookTouchId === null) {
        this.lookTouchId = id;
        this.lastLookX = x;
        this.lastLookY = y;
        claimed = true;
        continue;
      }
    }

    if (claimed) {
      e.preventDefault();
    }
  };

  private readonly onTouchMove = (e: TouchEvent): void => {
    let handled = false;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i]!;
      const id = touch.identifier;
      const x = touch.clientX;
      const y = touch.clientY;

      // Joystick move
      if (id === this.joystickTouchId) {
        const dx = x - this.joystickOriginX;
        const dy = y - this.joystickOriginY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const clamped = Math.min(dist, JOYSTICK_MAX_RADIUS);
        const norm = dist > 0 ? clamped / JOYSTICK_MAX_RADIUS : 0;
        const angle = Math.atan2(dy, dx);
        this.moveX = Math.cos(angle) * norm;
        this.moveZ = -Math.sin(angle) * norm; // Screen Y up = forward (negative Z in game)

        // Visual feedback — pass clamped dx/dy
        const visualDx = dist > 0 ? (dx / dist) * clamped : 0;
        const visualDy = dist > 0 ? (dy / dist) * clamped : 0;
        this.onJoystickMove?.(visualDx, visualDy);
        handled = true;
        continue;
      }

      // Look/aim move
      if (id === this.lookTouchId) {
        this.lookDeltaX += x - this.lastLookX;
        this.lookDeltaY += y - this.lastLookY;
        this.lastLookX = x;
        this.lastLookY = y;
        handled = true;
        continue;
      }
    }

    // Only suppress browser gestures for touches we're tracking
    if (handled) {
      e.preventDefault();
    }
  };

  private readonly onTouchEnd = (e: TouchEvent): void => {
    let handled = false;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i]!;
      const id = touch.identifier;

      // Joystick release
      if (id === this.joystickTouchId) {
        this.joystickTouchId = null;
        this.moveX = 0;
        this.moveZ = 0;
        this.onJoystickEnd?.();
        handled = true;
        continue;
      }

      // Look release
      if (id === this.lookTouchId) {
        this.lookTouchId = null;
        handled = true;
        continue;
      }

      // Button release
      const role = this.buttonTouchIds.get(id);
      if (role) {
        this.buttonTouchIds.delete(id);
        this.applyButtonUp(role);
        handled = true;
        continue;
      }
    }

    // Only suppress default for touches we were tracking
    if (handled) {
      e.preventDefault();
    }
  };

  // ── Button helpers ──────────────────────────────────────────────────

  private getButtonRoleAtPoint(x: number, y: number): ButtonRole | null {
    for (const [role, el] of this.buttonElements) {
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return role;
      }
    }
    return null;
  }

  private applyButtonDown(role: ButtonRole): void {
    switch (role) {
      case "fire":
        this.fireHeld = true;
        break;
      case "jump":
        this.jumpQueued = true;
        break;
      case "reload":
        this.reloadQueued = true;
        break;
      case "crouch":
        this.crouchToggled = !this.crouchToggled;
        this.crouchHeld = this.crouchToggled;
        break;
    }
  }

  private applyButtonUp(role: ButtonRole): void {
    switch (role) {
      case "fire":
        this.fireHeld = false;
        break;
      // jump and reload are one-shot (queued), no action on release
      // crouch is toggled, no action on release
    }
  }
}
