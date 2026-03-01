const AUTO_RESPAWN_S = 3.0;
const FADE_IN_S = 0.5;

export type DeathScreenSummary = {
  playerName: string;
  finalScore: number;
  bestScore: number;
};

export class DeathScreen {
  readonly root: HTMLDivElement;
  private readonly youDiedEl: HTMLDivElement;
  private readonly subtitleEl: HTMLDivElement;
  private readonly finalScoreEl: HTMLDivElement;
  private readonly bestScoreEl: HTMLDivElement;
  private readonly playAgainBtn: HTMLButtonElement;
  private readonly countdownEl: HTMLDivElement;

  private visible = false;
  private fadeTimerS = 0;
  private respawnTimerS = 0;

  /** Called by bootstrap when the screen should trigger a respawn. */
  onRespawn: (() => void) | null = null;

  constructor(mountEl: HTMLElement) {
    this.root = document.createElement("div");
    this.root.dataset.testid = "game-over";
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
    this.subtitleEl.style.textTransform = "uppercase";
    this.subtitleEl.textContent = "Run ended";

    this.finalScoreEl = document.createElement("div");
    this.finalScoreEl.style.fontFamily = '"Segoe UI", Tahoma, Verdana, sans-serif';
    this.finalScoreEl.style.fontSize = "24px";
    this.finalScoreEl.style.fontWeight = "700";
    this.finalScoreEl.style.color = "rgba(240, 248, 255, 0.95)";
    this.finalScoreEl.style.marginTop = "16px";
    this.finalScoreEl.style.letterSpacing = "0.06em";
    this.finalScoreEl.style.textTransform = "uppercase";
    this.finalScoreEl.textContent = "Final Score 0";

    this.bestScoreEl = document.createElement("div");
    this.bestScoreEl.style.fontFamily = '"Segoe UI", Tahoma, Verdana, sans-serif';
    this.bestScoreEl.style.fontSize = "16px";
    this.bestScoreEl.style.fontWeight = "600";
    this.bestScoreEl.style.color = "rgba(190, 210, 236, 0.85)";
    this.bestScoreEl.style.marginTop = "7px";
    this.bestScoreEl.style.letterSpacing = "0.06em";
    this.bestScoreEl.style.textTransform = "uppercase";
    this.bestScoreEl.textContent = "HIGH SCORE 0";

    this.playAgainBtn = document.createElement("button");
    this.playAgainBtn.type = "button";
    this.playAgainBtn.dataset.testid = "play-again";
    this.playAgainBtn.textContent = "Play Again";
    this.playAgainBtn.style.marginTop = "18px";
    this.playAgainBtn.style.padding = "10px 20px";
    this.playAgainBtn.style.borderRadius = "999px";
    this.playAgainBtn.style.border = "1px solid rgba(255, 255, 255, 0.3)";
    this.playAgainBtn.style.background = "rgba(18, 28, 44, 0.74)";
    this.playAgainBtn.style.color = "rgba(236, 244, 255, 0.95)";
    this.playAgainBtn.style.fontFamily = '"Segoe UI", Tahoma, Verdana, sans-serif';
    this.playAgainBtn.style.fontSize = "13px";
    this.playAgainBtn.style.fontWeight = "700";
    this.playAgainBtn.style.letterSpacing = "0.12em";
    this.playAgainBtn.style.textTransform = "uppercase";
    this.playAgainBtn.style.cursor = "pointer";
    this.playAgainBtn.style.pointerEvents = "auto";
    this.playAgainBtn.style.boxShadow = "0 6px 18px rgba(0, 0, 0, 0.36)";
    this.playAgainBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!this.visible) return;
      this.triggerRespawn();
    });

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

    this.root.append(
      this.youDiedEl,
      this.subtitleEl,
      this.finalScoreEl,
      this.bestScoreEl,
      this.playAgainBtn,
      this.countdownEl,
    );
    mountEl.append(this.root);

    // Click for early respawn
    this.root.style.pointerEvents = "none"; // set to auto in show()
    this.root.addEventListener("click", () => {
      if (!this.visible) return;
      this.triggerRespawn();
    });
  }

  show(summary?: Partial<DeathScreenSummary>): void {
    if (this.visible) return;
    this.visible = true;
    this.fadeTimerS = 0;
    this.respawnTimerS = AUTO_RESPAWN_S;
    this.root.style.display = "flex";
    this.root.style.opacity = "0";
    this.root.style.pointerEvents = "auto";
    this.countdownEl.textContent = String(Math.ceil(AUTO_RESPAWN_S));
    this.subtitleEl.textContent = summary?.playerName
      ? `${summary.playerName.toUpperCase()} ELIMINATED`
      : "Run ended";
    const finalScore = Math.max(0, Math.round(summary?.finalScore ?? 0));
    const bestScore = Math.max(0, Math.round(summary?.bestScore ?? 0));
    this.finalScoreEl.textContent = `Final Score ${this.formatScore(finalScore)}`;
    this.bestScoreEl.textContent = `HIGH SCORE ${this.formatScore(bestScore)}`;
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

  private formatScore(value: number): string {
    return value.toLocaleString("en-US");
  }
}
