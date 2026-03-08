const INTRO_DURATION_S = 0.24;
const HOLD_DURATION_S = 1;
const OUTRO_DURATION_S = 0.42;
const HIDDEN_OPACITY = 0;
const VISIBLE_OPACITY = 1;
const INTRO_START_Y_PX = -6;
const HOLD_Y_PX = 0;
const OUTRO_END_Y_PX = -10;
const INTRO_START_SCALE = 0.92;
const HOLD_SCALE = 1;
const OUTRO_END_SCALE = 0.94;

type BannerPhase = "hidden" | "intro" | "hold" | "outro";

export class HeadshotBanner {
  private readonly root: HTMLDivElement;
  private phase: BannerPhase = "hidden";
  private phaseTimerS = 0;

  constructor(mountEl: HTMLElement) {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "absolute",
      top: "54px",
      left: "50%",
      width: "min(360px, calc(100vw - 64px))",
      transform: "translateX(-50%) translateY(-6px) scale(0.92)",
      transformOrigin: "center top",
      opacity: "0",
      pointerEvents: "none",
      userSelect: "none",
      zIndex: "26",
      filter: "drop-shadow(0 12px 20px rgba(0, 0, 0, 0.34))",
      willChange: "transform, opacity",
    });

    const imageEl = document.createElement("img");
    imageEl.src = "/assets/ui/headshot-notification.png";
    imageEl.alt = "";
    imageEl.decoding = "async";
    imageEl.draggable = false;
    Object.assign(imageEl.style, {
      display: "block",
      width: "100%",
      height: "auto",
    });

    this.root.append(imageEl);
    mountEl.append(this.root);
    void imageEl.decode().catch(() => {});
  }

  trigger(): void {
    if (this.phase === "hidden") {
      this.phase = "intro";
      this.phaseTimerS = INTRO_DURATION_S;
      this.applyState(HIDDEN_OPACITY, INTRO_START_Y_PX, INTRO_START_SCALE);
      return;
    }

    this.phase = "hold";
    this.phaseTimerS = HOLD_DURATION_S;
    this.applyState(VISIBLE_OPACITY, HOLD_Y_PX, HOLD_SCALE);
  }

  update(deltaSeconds: number): void {
    if (this.phase === "hidden") return;

    this.phaseTimerS = Math.max(0, this.phaseTimerS - deltaSeconds);

    if (this.phase === "intro") {
      const progress = 1 - (this.phaseTimerS / INTRO_DURATION_S);
      const opacityT = easeInQuad(progress);
      const motionT = easeOutCubic(progress);
      this.applyState(
        lerp(HIDDEN_OPACITY, VISIBLE_OPACITY, opacityT),
        lerp(INTRO_START_Y_PX, HOLD_Y_PX, motionT),
        lerp(INTRO_START_SCALE, HOLD_SCALE, motionT),
      );
      if (this.phaseTimerS <= 0) {
        this.phase = "hold";
        this.phaseTimerS = HOLD_DURATION_S;
        this.applyState(VISIBLE_OPACITY, HOLD_Y_PX, HOLD_SCALE);
      }
      return;
    }

    if (this.phase === "hold") {
      this.applyState(VISIBLE_OPACITY, HOLD_Y_PX, HOLD_SCALE);
      if (this.phaseTimerS <= 0) {
        this.phase = "outro";
        this.phaseTimerS = OUTRO_DURATION_S;
      }
      return;
    }

    const progress = 1 - (this.phaseTimerS / OUTRO_DURATION_S);
    const eased = easeInQuad(progress);
    this.applyState(
      lerp(VISIBLE_OPACITY, HIDDEN_OPACITY, eased),
      lerp(HOLD_Y_PX, OUTRO_END_Y_PX, eased),
      lerp(HOLD_SCALE, OUTRO_END_SCALE, eased),
    );
    if (this.phaseTimerS <= 0) {
      this.clear();
    }
  }

  clear(): void {
    this.phase = "hidden";
    this.phaseTimerS = 0;
    this.applyState(HIDDEN_OPACITY, OUTRO_END_Y_PX, OUTRO_END_SCALE);
  }

  dispose(): void {
    this.root.remove();
  }

  private applyState(opacity: number, translateYPx: number, scale: number): void {
    this.root.style.opacity = opacity.toFixed(3);
    this.root.style.transform = `translateX(-50%) translateY(${translateYPx.toFixed(2)}px) scale(${scale.toFixed(3)})`;
  }
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function easeOutCubic(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - clamped, 3);
}

function easeInQuad(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped;
}
