export class HitMarker {
  private readonly root: HTMLDivElement;
  private readonly arm1: HTMLDivElement;
  private readonly arm2: HTMLDivElement;
  private readonly ring: HTMLDivElement;
  private timerS = 0;
  private scalePop = 0; // tracks scale animation (0 = done)
  private readonly FADE_DURATION_S = 0.22;
  private readonly SCALE_POP_S = 0.04; // time to ease from 0.85→1.0

  constructor(crosshairEl: HTMLElement) {
    this.root = document.createElement("div");
    this.root.style.position = "absolute";
    this.root.style.left = "0";
    this.root.style.top = "0";
    this.root.style.width = "18px";
    this.root.style.height = "18px";
    this.root.style.pointerEvents = "none";
    this.root.style.zIndex = "17";
    this.root.style.opacity = "0";
    this.root.style.transform = "scale(0.85)";

    // Outer ring — visible only on headshots
    this.ring = document.createElement("div");
    this.ring.style.position = "absolute";
    this.ring.style.left = "-4px";
    this.ring.style.top = "-4px";
    this.ring.style.width = "26px";
    this.ring.style.height = "26px";
    this.ring.style.borderRadius = "50%";
    this.ring.style.border = "2px solid rgba(255, 230, 80, 0.85)";
    this.ring.style.boxSizing = "border-box";
    this.ring.style.display = "none";

    // Two arms forming an X over the existing + crosshair
    const arm1 = document.createElement("div");
    arm1.style.position = "absolute";
    arm1.style.width = "20px";
    arm1.style.height = "2px";
    arm1.style.top = "8px";
    arm1.style.left = "-1px";
    arm1.style.background = "rgba(255, 255, 255, 0.95)";
    arm1.style.borderRadius = "1px";
    arm1.style.transform = "rotate(45deg)";
    arm1.style.transformOrigin = "center center";

    const arm2 = document.createElement("div");
    arm2.style.position = "absolute";
    arm2.style.width = "20px";
    arm2.style.height = "2px";
    arm2.style.top = "8px";
    arm2.style.left = "-1px";
    arm2.style.background = "rgba(255, 255, 255, 0.95)";
    arm2.style.borderRadius = "1px";
    arm2.style.transform = "rotate(-45deg)";
    arm2.style.transformOrigin = "center center";

    this.arm1 = arm1;
    this.arm2 = arm2;
    this.root.append(this.ring, arm1, arm2);
    crosshairEl.append(this.root);
  }

  trigger(isHeadshot = false): void {
    this.timerS = this.FADE_DURATION_S;
    this.scalePop = this.SCALE_POP_S;
    this.root.style.opacity = "1";
    this.root.style.transform = "scale(0.85)";

    if (isHeadshot) {
      // Larger arms + brighter gold + ring
      const color = "rgba(255, 230, 80, 0.98)";
      this.arm1.style.background = color;
      this.arm2.style.background = color;
      this.arm1.style.width = "24px";
      this.arm2.style.width = "24px";
      this.ring.style.display = "block";
      this.ring.style.borderColor = "rgba(255, 230, 80, 0.85)";
    } else {
      const color = "rgba(255, 255, 255, 0.95)";
      this.arm1.style.background = color;
      this.arm2.style.background = color;
      this.arm1.style.width = "20px";
      this.arm2.style.width = "20px";
      this.ring.style.display = "none";
    }
  }

  update(deltaSeconds: number): void {
    if (this.timerS <= 0) return;

    // Scale pop: ease from 0.85 → 1.0 in first SCALE_POP_S
    if (this.scalePop > 0) {
      this.scalePop = Math.max(0, this.scalePop - deltaSeconds);
      const popT = 1 - this.scalePop / this.SCALE_POP_S; // 0→1
      const scale = 0.85 + 0.15 * popT;
      this.root.style.transform = `scale(${scale.toFixed(3)})`;
    } else {
      this.root.style.transform = "scale(1)";
    }

    this.timerS = Math.max(0, this.timerS - deltaSeconds);
    const t = this.timerS / this.FADE_DURATION_S;
    // Ease-out quad: fades fast at start, lingers at end
    const opacity = t * t;
    this.root.style.opacity = opacity.toFixed(3);

    // Fade ring in sync
    if (this.ring.style.display !== "none") {
      this.ring.style.opacity = opacity.toFixed(3);
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
