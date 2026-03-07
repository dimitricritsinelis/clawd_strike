import {
  formatSharedChampionMode,
  formatSharedChampionScore,
  type SharedChampionSnapshot,
} from "../../../../shared/highScore";

const AUTO_RESPAWN_S = 3.0;
const FADE_IN_S = 0.5;

function roundScoreValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 2) / 2);
}

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
  private readonly sessionBestEl: HTMLDivElement;
  private readonly sharedChampionNameEl: HTMLDivElement;
  private readonly sharedChampionScoreEl: HTMLDivElement;
  private readonly sharedChampionModeEl: HTMLDivElement;
  private readonly playAgainBtn: HTMLButtonElement;
  private readonly countdownEl: HTMLDivElement;

  private visible = false;
  private fadeTimerS = 0;
  private respawnTimerS = 0;
  private sharedChampionSnapshot: SharedChampionSnapshot = {
    status: "loading",
    champion: null,
  };

  /** Called by bootstrap when the screen should restart the run. */
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

    this.sessionBestEl = document.createElement("div");
    this.sessionBestEl.style.fontFamily = '"Segoe UI", Tahoma, Verdana, sans-serif';
    this.sessionBestEl.style.fontSize = "16px";
    this.sessionBestEl.style.fontWeight = "600";
    this.sessionBestEl.style.color = "rgba(190, 210, 236, 0.85)";
    this.sessionBestEl.style.marginTop = "7px";
    this.sessionBestEl.style.letterSpacing = "0.06em";
    this.sessionBestEl.style.textTransform = "uppercase";
    this.sessionBestEl.textContent = "Session Best 0";

    const championBlock = document.createElement("div");
    Object.assign(championBlock.style, {
      display: "grid",
      gap: "6px",
      justifyItems: "center",
      marginTop: "14px",
      padding: "14px 18px 12px",
      minWidth: "320px",
      borderRadius: "16px",
      border: "1px solid rgba(255, 214, 161, 0.18)",
      background: "rgba(22, 13, 7, 0.52)",
      boxSizing: "border-box",
    });

    const championKicker = document.createElement("div");
    championKicker.textContent = "WORLD CHAMPION";
    Object.assign(championKicker.style, {
      fontFamily: '"Segoe UI", Tahoma, Verdana, sans-serif',
      fontSize: "11px",
      fontWeight: "700",
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      color: "rgba(227, 207, 179, 0.7)",
    });

    this.sharedChampionNameEl = document.createElement("div");
    this.sharedChampionNameEl.dataset.testid = "death-world-champion-name";
    Object.assign(this.sharedChampionNameEl.style, {
      fontFamily: '"Segoe UI", Tahoma, Verdana, sans-serif',
      fontSize: "24px",
      fontWeight: "760",
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "rgba(248, 243, 235, 0.96)",
    });

    const championMeta = document.createElement("div");
    Object.assign(championMeta.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "10px",
    });

    this.sharedChampionScoreEl = document.createElement("div");
    this.sharedChampionScoreEl.dataset.testid = "death-world-champion-score";
    Object.assign(this.sharedChampionScoreEl.style, {
      fontFamily: '"Segoe UI", Tahoma, Verdana, sans-serif',
      fontSize: "18px",
      fontWeight: "700",
      letterSpacing: "0.05em",
      color: "#ffd38a",
    });

    this.sharedChampionModeEl = document.createElement("div");
    this.sharedChampionModeEl.dataset.testid = "death-world-champion-mode";
    Object.assign(this.sharedChampionModeEl.style, {
      padding: "4px 10px",
      borderRadius: "999px",
      border: "1px solid rgba(255, 214, 161, 0.24)",
      background: "rgba(255, 214, 161, 0.12)",
      fontFamily: '"Segoe UI", Tahoma, Verdana, sans-serif',
      fontSize: "10px",
      fontWeight: "700",
      letterSpacing: "0.16em",
      textTransform: "uppercase",
      color: "rgba(255, 232, 200, 0.92)",
    });
    championMeta.append(this.sharedChampionScoreEl, this.sharedChampionModeEl);

    championBlock.append(championKicker, this.sharedChampionNameEl, championMeta);

    this.playAgainBtn = document.createElement("button");
    this.playAgainBtn.type = "button";
    this.playAgainBtn.dataset.testid = "play-again";
    this.playAgainBtn.textContent = "Restart Run";
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
      this.sessionBestEl,
      championBlock,
      this.playAgainBtn,
      this.countdownEl,
    );
    mountEl.append(this.root);

    this.root.style.pointerEvents = "none";
    this.root.addEventListener("click", () => {
      if (!this.visible) return;
      this.triggerRespawn();
    });

    this.renderSharedChampion();
  }

  setSharedChampion(snapshot: SharedChampionSnapshot): void {
    this.sharedChampionSnapshot = snapshot;
    this.renderSharedChampion();
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
    const finalScore = roundScoreValue(summary?.finalScore ?? 0);
    const bestScore = roundScoreValue(summary?.bestScore ?? 0);
    this.finalScoreEl.textContent = `Final Score ${this.formatScore(finalScore)}`;
    this.sessionBestEl.textContent = `Session Best ${this.formatScore(bestScore)}`;
    this.renderSharedChampion();
  }

  hide(): void {
    this.visible = false;
    this.root.style.display = "none";
    this.root.style.opacity = "0";
    this.root.style.pointerEvents = "none";
  }

  update(deltaSeconds: number): void {
    if (!this.visible) return;

    this.fadeTimerS = Math.min(FADE_IN_S, this.fadeTimerS + deltaSeconds);
    this.root.style.opacity = (this.fadeTimerS / FADE_IN_S).toFixed(3);

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

  private renderSharedChampion(): void {
    const snapshot = this.sharedChampionSnapshot;
    const champion = snapshot.champion;

    if (snapshot.status === "unavailable") {
      this.sharedChampionNameEl.textContent = "Champion unavailable";
      this.sharedChampionScoreEl.textContent = "--";
      this.sharedChampionModeEl.textContent = "OFFLINE";
      return;
    }

    if (champion) {
      this.sharedChampionNameEl.textContent = champion.holderName.toUpperCase();
      this.sharedChampionScoreEl.textContent = formatSharedChampionScore(champion.score);
      this.sharedChampionModeEl.textContent = formatSharedChampionMode(champion.controlMode);
      return;
    }

    if (snapshot.status === "loading" || snapshot.status === "idle") {
      this.sharedChampionNameEl.textContent = "Loading champion";
      this.sharedChampionScoreEl.textContent = "--";
      this.sharedChampionModeEl.textContent = "SYNC";
      return;
    }

    this.sharedChampionNameEl.textContent = "No champion yet";
    this.sharedChampionScoreEl.textContent = "--";
    this.sharedChampionModeEl.textContent = "OPEN";
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
