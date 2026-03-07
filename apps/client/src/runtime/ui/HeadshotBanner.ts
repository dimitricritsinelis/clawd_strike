const DISPLAY_DURATION_S = 2.7;
const FADE_DURATION_S = 0.55;

export class HeadshotBanner {
  private readonly root: HTMLDivElement;
  private timerS = 0;

  constructor(mountEl: HTMLElement) {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "absolute",
      top: "54px",
      left: "50%",
      width: "min(360px, calc(100vw - 64px))",
      transform: "translateX(-50%) translateY(-10px) scale(0.96)",
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
    this.timerS = DISPLAY_DURATION_S;
    this.root.style.opacity = "1";
    this.root.style.transform = "translateX(-50%) translateY(0) scale(1)";
  }

  update(deltaSeconds: number): void {
    if (this.timerS <= 0) return;

    this.timerS = Math.max(0, this.timerS - deltaSeconds);
    if (this.timerS <= 0) {
      this.clear();
      return;
    }

    if (this.timerS > FADE_DURATION_S) {
      this.root.style.opacity = "1";
      this.root.style.transform = "translateX(-50%) translateY(0) scale(1)";
      return;
    }

    const fadeT = this.timerS / FADE_DURATION_S;
    const liftPx = (1 - fadeT) * 10;
    const scale = 0.96 + fadeT * 0.04;
    this.root.style.opacity = fadeT.toFixed(3);
    this.root.style.transform = `translateX(-50%) translateY(${(-liftPx).toFixed(2)}px) scale(${scale.toFixed(3)})`;
  }

  clear(): void {
    this.timerS = 0;
    this.root.style.opacity = "0";
    this.root.style.transform = "translateX(-50%) translateY(-10px) scale(0.96)";
  }

  dispose(): void {
    this.root.remove();
  }
}
