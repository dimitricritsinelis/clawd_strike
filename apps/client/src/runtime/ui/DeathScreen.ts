const AUTO_RESPAWN_S = 3.0;
const FADE_IN_S = 0.5;

export class DeathScreen {
  readonly root: HTMLDivElement;
  private readonly youDiedEl: HTMLDivElement;
  private readonly subtitleEl: HTMLDivElement;
  private readonly countdownEl: HTMLDivElement;

  private visible = false;
  private fadeTimerS = 0;
  private respawnTimerS = 0;

  /** Called by bootstrap when the screen should trigger a respawn. */
  onRespawn: (() => void) | null = null;

  constructor(mountEl: HTMLElement) {
    this.root = document.createElement("div");
    this.root.style.position = "fixed";
    this.root.style.inset = "0";
    this.root.style.background = "rgba(0, 0, 0, 0.72)";
    this.root.style.zIndex = "32";
    this.root.style.display = "none";
    this.root.style.flexDirection = "column";
    this.root.style.alignItems = "center";
    this.root.style.justifyContent = "center";
    this.root.style.pointerEvents = "none";
    this.root.style.opacity = "0";
    this.root.style.userSelect = "none";

    this.youDiedEl = document.createElement("div");
    this.youDiedEl.style.fontFamily = '"Segoe UI", Tahoma, Verdana, sans-serif';
    this.youDiedEl.style.fontSize = "72px";
    this.youDiedEl.style.fontWeight = "780";
    this.youDiedEl.style.letterSpacing = "0.08em";
    this.youDiedEl.style.color = "#cc2222";
    this.youDiedEl.style.textTransform = "uppercase";
    this.youDiedEl.style.textShadow = "0 0 40px rgba(200, 0, 0, 0.6), 0 0 80px rgba(160, 0, 0, 0.3)";
    this.youDiedEl.textContent = "YOU DIED";

    this.subtitleEl = document.createElement("div");
    this.subtitleEl.style.fontFamily = '"Segoe UI", Tahoma, Verdana, sans-serif';
    this.subtitleEl.style.fontSize = "18px";
    this.subtitleEl.style.fontWeight = "500";
    this.subtitleEl.style.color = "rgba(230, 240, 255, 0.65)";
    this.subtitleEl.style.marginTop = "24px";
    this.subtitleEl.style.letterSpacing = "0.04em";
    this.subtitleEl.textContent = "Click to respawn";

    // Countdown ring / number
    this.countdownEl = document.createElement("div");
    this.countdownEl.style.fontFamily = '"Segoe UI", Tahoma, Verdana, sans-serif';
    this.countdownEl.style.fontSize = "52px";
    this.countdownEl.style.fontWeight = "700";
    this.countdownEl.style.color = "rgba(255, 255, 255, 0.85)";
    this.countdownEl.style.marginTop = "20px";
    this.countdownEl.style.letterSpacing = "0.04em";
    this.countdownEl.style.textShadow = "0 0 24px rgba(255,255,255,0.25)";
    this.countdownEl.textContent = String(Math.ceil(AUTO_RESPAWN_S));

    this.root.append(this.youDiedEl, this.subtitleEl, this.countdownEl);
    mountEl.append(this.root);

    // Click for early respawn
    this.root.style.pointerEvents = "none"; // set to auto in show()
    this.root.addEventListener("click", () => {
      if (!this.visible) return;
      this.triggerRespawn();
    });
  }

  show(): void {
    if (this.visible) return;
    this.visible = true;
    this.fadeTimerS = 0;
    this.respawnTimerS = AUTO_RESPAWN_S;
    this.root.style.display = "flex";
    this.root.style.opacity = "0";
    this.root.style.pointerEvents = "auto";
    this.countdownEl.textContent = String(Math.ceil(AUTO_RESPAWN_S));
  }

  hide(): void {
    this.visible = false;
    this.root.style.display = "none";
    this.root.style.opacity = "0";
    this.root.style.pointerEvents = "none";
  }

  update(deltaSeconds: number): void {
    if (!this.visible) return;

    // Fade in
    this.fadeTimerS = Math.min(FADE_IN_S, this.fadeTimerS + deltaSeconds);
    this.root.style.opacity = (this.fadeTimerS / FADE_IN_S).toFixed(3);

    // Countdown
    this.respawnTimerS -= deltaSeconds;
    const displaySecs = Math.max(0, Math.ceil(this.respawnTimerS));
    this.countdownEl.textContent = String(displaySecs);

    if (this.respawnTimerS <= 0) {
      this.triggerRespawn();
    }
  }

  isVisible(): boolean {
    return this.visible;
  }

  dispose(): void {
    this.root.remove();
  }

  private triggerRespawn(): void {
    if (!this.visible) return;
    this.hide();
    this.onRespawn?.();
  }
}
