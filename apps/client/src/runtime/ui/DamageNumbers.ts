/**
 * DamageNumbers — floating damage numbers that appear at enemy hit positions
 * and drift upward before fading out.
 *
 * Numbers are 2D overlays positioned via CSS `left`/`top` (screen %).
 * Colors: white = body, gold = headshot.
 * Size scales with damage amount.
 */

import { PerspectiveCamera, Vector3 } from "three";

type DamageEntry = {
  el: HTMLDivElement;
  timerS: number;
  velY: number; // pixels per second, upward
  currentY: number;
  startX: number;
};

const FADE_DURATION_S = 0.75;
const RISE_SPEED_PX = 38; // px/s upward drift

export class DamageNumbers {
  private readonly root: HTMLDivElement;
  private readonly entries: DamageEntry[] = [];
  private readonly freeEls: HTMLDivElement[] = [];
  private readonly scratch = new Vector3();

  constructor(mountEl: HTMLElement) {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      zIndex: "25",
      overflow: "hidden",
    });
    mountEl.append(this.root);
  }

  /**
   * Spawn a floating damage number at a 3D world position.
   * @param worldPos  3D position (enemy hit point)
   * @param camera    Main perspective camera (for projection)
   * @param damage    Damage value to display
   * @param isHeadshot True → gold colour + larger text; false → white
   */
  spawn(
    worldPos: { x: number; y: number; z: number },
    camera: PerspectiveCamera,
    damage: number,
    isHeadshot: boolean,
  ): void {
    // Project 3D position to NDC
    const v = this.scratch.set(worldPos.x, worldPos.y, worldPos.z);
    v.project(camera);

    // NDC to screen percent
    const screenX = (v.x * 0.5 + 0.5) * 100;
    const screenY = (-v.y * 0.5 + 0.5) * 100;

    // Cull if behind camera or out of view
    if (v.z > 1 || screenX < -5 || screenX > 105 || screenY < -5 || screenY > 105) return;

    // Horizontal jitter so stacked hits don't perfectly overlap
    const jitterX = (Math.random() - 0.5) * 3.5; // in % units
    const jitterY = (Math.random() - 0.5) * 1.5;

    const el = this.freeEls.pop() ?? document.createElement("div");

    // Size scales with damage: 25 dmg → ~1.21rem, 100 dmg → ~1.83rem
    const sizeRem = (1.0 + damage / 120).toFixed(2);
    const color = isHeadshot ? "#ffd040" : "#ffffff";
    const shadow = isHeadshot
      ? "0 0 12px rgba(255,200,60,0.6), 0 1px 6px rgba(0,0,0,0.9)"
      : "0 1px 5px rgba(0,0,0,0.75)";

    Object.assign(el.style, {
      position: "absolute",
      left: `${(screenX + jitterX).toFixed(1)}%`,
      top: `${(screenY + jitterY).toFixed(1)}%`,
      transform: "translate(-50%, -50%)",
      fontFamily: '"Segoe UI", Tahoma, Verdana, sans-serif',
      fontSize: `${sizeRem}rem`,
      fontWeight: isHeadshot ? "800" : "700",
      color,
      textShadow: shadow,
      pointerEvents: "none",
      userSelect: "none",
      opacity: "1",
      letterSpacing: "0.02em",
      willChange: "transform, opacity",
    });
    el.textContent = String(damage);

    this.root.append(el);

    const startY = ((screenY + jitterY) / 100) * window.innerHeight;

    this.entries.push({
      el,
      timerS: FADE_DURATION_S,
      velY: RISE_SPEED_PX,
      currentY: startY,
      startX: screenX + jitterX,
    });
  }

  /** Called every frame from bootstrap step(). */
  update(deltaSeconds: number): void {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i]!;
      entry.timerS -= deltaSeconds;

      if (entry.timerS <= 0) {
        entry.el.remove();
        this.freeEls.push(entry.el);
        const lastIndex = this.entries.length - 1;
        if (i !== lastIndex) {
          this.entries[i] = this.entries[lastIndex]!;
        }
        this.entries.pop();
        continue;
      }

      // Rise
      entry.currentY -= entry.velY * deltaSeconds;

      // Ease-out fade: power 1.4 — starts fading quickly, lingers at tail
      const t = Math.max(0, entry.timerS / FADE_DURATION_S);
      const opacity = Math.pow(t, 1.4);

      entry.el.style.top = `${((entry.currentY / window.innerHeight) * 100).toFixed(1)}%`;
      entry.el.style.opacity = opacity.toFixed(3);
    }
  }

  dispose(): void {
    for (const entry of this.entries) {
      entry.el.remove();
    }
    this.entries.length = 0;
    this.freeEls.length = 0;
    this.root.remove();
  }
}
