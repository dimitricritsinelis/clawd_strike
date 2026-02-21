export class HitVignette {
  private readonly hitLayer: HTMLDivElement;   // flash layer — triggered on damage
  private readonly lowHpLayer: HTMLDivElement; // persistent layer — danger signal at low HP

  private timerS = 0;
  private fadeDurationS = 0.4;
  private peakOpacity = 1.0;

  constructor(mountEl: HTMLElement) {
    const baseStyle: Partial<CSSStyleDeclaration> = {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      background: "radial-gradient(ellipse at center, transparent 40%, rgba(180, 0, 0, 0.72) 100%)",
    };

    // Hit flash layer
    this.hitLayer = document.createElement("div");
    Object.assign(this.hitLayer.style, baseStyle);
    this.hitLayer.style.zIndex = "28";
    this.hitLayer.style.opacity = "0";

    // Persistent low-HP layer — always present, opacity driven by health
    this.lowHpLayer = document.createElement("div");
    Object.assign(this.lowHpLayer.style, baseStyle);
    this.lowHpLayer.style.zIndex = "27";
    this.lowHpLayer.style.opacity = "0";
    this.lowHpLayer.style.transition = "opacity 0.5s ease-out";

    mountEl.append(this.lowHpLayer, this.hitLayer);
  }

  /**
   * Trigger a hit flash. Intensity and duration scale with damage amount.
   * @param damage  HP taken (used to scale intensity)
   */
  triggerHit(damage = 25): void {
    // Scale fade duration and peak opacity with damage magnitude
    this.fadeDurationS = 0.2 + (damage / 50) * 0.35;
    this.peakOpacity = Math.min(1.0, damage / 30);
    this.timerS = this.fadeDurationS;
    this.hitLayer.style.opacity = this.peakOpacity.toFixed(3);
  }

  /**
   * Update persistent low-health vignette based on current health.
   * Call every frame.
   */
  setHealth(health: number): void {
    const targetOpacity = health <= 30 ? 0.18 : 0;
    const current = parseFloat(this.lowHpLayer.style.opacity) || 0;
    // CSS transition handles smooth fade (0.5s set in constructor)
    if (Math.abs(current - targetOpacity) > 0.01) {
      this.lowHpLayer.style.opacity = targetOpacity.toFixed(2);
    }
  }

  update(deltaSeconds: number): void {
    if (this.timerS <= 0) {
      if (this.hitLayer.style.opacity !== "0") {
        this.hitLayer.style.opacity = "0";
      }
      return;
    }
    this.timerS = Math.max(0, this.timerS - deltaSeconds);
    const t = this.timerS / this.fadeDurationS;
    // Ease-out quad: bright at start, fades quickly
    this.hitLayer.style.opacity = (this.peakOpacity * t * t).toFixed(3);
  }

  dispose(): void {
    this.hitLayer.remove();
    this.lowHpLayer.remove();
  }
}
