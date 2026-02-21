/**
 * FadeOverlay — full-screen black overlay used for respawn fade transitions.
 *
 * Usage:
 *   fadeOverlay.fadeOut(durationS, onComplete)  — fade to black, then call onComplete
 *   fadeOverlay.fadeIn(durationS)               — fade from black to transparent
 *
 * z-index 40: above everything (DeathScreen=32, PauseMenu=34)
 */
export class FadeOverlay {
  private readonly root: HTMLDivElement;
  private opacity = 0;
  private targetOpacity = 0;
  private durationS = 0.25;
  private elapsedS = 0;
  private startOpacity = 0;
  private animating = false;
  private onComplete: (() => void) | null = null;

  constructor(mountEl: HTMLElement) {
    this.root = document.createElement("div");
    this.root.style.position = "absolute";
    this.root.style.inset = "0";
    this.root.style.background = "#000";
    this.root.style.opacity = "0";
    this.root.style.pointerEvents = "none";
    this.root.style.zIndex = "40";
    this.root.style.transition = "none";
    mountEl.append(this.root);
  }

  /**
   * Fade to black over durationS seconds, then call onComplete.
   */
  fadeOut(durationS = 0.2, onComplete?: () => void): void {
    this.startOpacity = this.opacity;
    this.targetOpacity = 1;
    this.durationS = Math.max(0.01, durationS);
    this.elapsedS = 0;
    this.animating = true;
    this.onComplete = onComplete ?? null;
  }

  /**
   * Fade from black (or current opacity) back to transparent over durationS seconds.
   */
  fadeIn(durationS = 0.3): void {
    this.startOpacity = this.opacity;
    this.targetOpacity = 0;
    this.durationS = Math.max(0.01, durationS);
    this.elapsedS = 0;
    this.animating = true;
    this.onComplete = null;
  }

  /** Set opacity immediately (0–1). */
  setOpacity(value: number): void {
    this.opacity = Math.max(0, Math.min(1, value));
    this.animating = false;
    this.root.style.opacity = this.opacity.toFixed(3);
  }

  update(dt: number): void {
    if (!this.animating) return;

    this.elapsedS += dt;
    const t = Math.min(1, this.elapsedS / this.durationS);
    // Smooth ease-in-out
    const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    this.opacity = this.startOpacity + (this.targetOpacity - this.startOpacity) * eased;
    this.root.style.opacity = this.opacity.toFixed(3);

    if (t >= 1) {
      this.animating = false;
      const cb = this.onComplete;
      this.onComplete = null;
      cb?.();
    }
  }

  isAnimating(): boolean {
    return this.animating;
  }

  dispose(): void {
    this.root.remove();
  }
}
