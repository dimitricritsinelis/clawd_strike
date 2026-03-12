import { createEdgeVignetteLayer } from "./EdgeVignette";

const HIT_COLOR_RGB = "180, 0, 0";
const HIT_LAYER_MID_ALPHA = 0.18;
const HIT_LAYER_OUTER_ALPHA = 0.84;

export class HitVignette {
  private readonly hitLayer: HTMLDivElement;   // flash layer — triggered on damage
  private readonly lowHpLayer: HTMLDivElement; // persistent layer — danger signal at low HP

  private timerS = 0;
  private fadeDurationS = 0.4;
  private peakOpacity = 1.0;

  constructor(mountEl: HTMLElement) {
    this.hitLayer = createEdgeVignetteLayer({
      colorRgb: HIT_COLOR_RGB,
      midAlpha: HIT_LAYER_MID_ALPHA,
      outerAlpha: HIT_LAYER_OUTER_ALPHA,
      zIndex: 28,
    });

    this.lowHpLayer = createEdgeVignetteLayer({
      colorRgb: HIT_COLOR_RGB,
      midAlpha: HIT_LAYER_MID_ALPHA,
      outerAlpha: HIT_LAYER_OUTER_ALPHA,
      zIndex: 27,
    });
    this.lowHpLayer.style.transition = "opacity 0.5s ease-out";

    mountEl.append(this.lowHpLayer, this.hitLayer);
  }

  /**
   * Trigger a hit flash. Intensity and duration scale with damage amount.
   * @param damage  HP taken (used to scale intensity)
   */
  triggerHit(damage = 25): void {
    // Scale fade duration and peak opacity with damage magnitude
    this.fadeDurationS = 0.25 + (damage / 50) * 0.45;
    this.peakOpacity = Math.min(1.0, 0.6 + damage / 60);
    this.timerS = this.fadeDurationS;
    this.hitLayer.style.opacity = this.peakOpacity.toFixed(3);
  }

  /**
   * Update persistent low-health vignette based on current health.
   * Call every frame.
   */
  setHealth(health: number): void {
    const targetOpacity = health <= 40 ? 0.22 : 0;
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

  clear(): void {
    this.timerS = 0;
    this.fadeDurationS = 0.4;
    this.peakOpacity = 1.0;
    this.hitLayer.style.opacity = "0";
    this.lowHpLayer.style.opacity = "0";
  }

  dispose(): void {
    this.hitLayer.remove();
    this.lowHpLayer.remove();
  }
}
