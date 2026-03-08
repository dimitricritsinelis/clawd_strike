import {
  formatSharedChampionMode,
  formatSharedChampionScore,
  type SharedChampionSnapshot,
} from "../../../../shared/highScore";
import { ENEMIES_PER_WAVE } from "../enemies/EnemyManager";

type ScoreHudKillRecord = {
  isHeadshot: boolean;
};

/**
 * ScoreHud — top-right HUD showing current run score plus local/session and sitewide records.
 */
export class ScoreHud {
  readonly root: HTMLDivElement;
  private readonly killsEl: HTMLSpanElement;
  private readonly headshotsEl: HTMLSpanElement;
  private readonly scoreEl: HTMLSpanElement;
  private readonly bestScoreEl: HTMLSpanElement;
  private readonly sharedChampionNameEl: HTMLSpanElement;
  private readonly sharedChampionModeEl: HTMLSpanElement;
  private readonly sharedChampionScoreEl: HTMLSpanElement;

  private kills = 0;
  private headshots = 0;
  private score = 0;
  private readonly SCORE_BASE = 0;
  private readonly WAVE_ENEMY_COUNT = ENEMIES_PER_WAVE;
  private readonly KILL_SCORE_BASE = 5;
  private readonly WAVE_SCORE_INCREMENT = 2;
  private flashTimerS = 0;
  private flashHeadshotActive = false;
  private readonly FLASH_DURATION_S = 0.3;

  constructor(mountEl: HTMLElement, playerName: string) {
    this.root = document.createElement("div");
    this.root.dataset.testid = "score-hud";
    Object.assign(this.root.style, {
      position: "absolute",
      top: "20px",
      right: "22px",
      zIndex: "22",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "4px",
      background: "rgba(8, 16, 28, 0.68)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "6px",
      padding: "8px 12px 10px",
      pointerEvents: "none",
      userSelect: "none",
      width: "332px",
      minWidth: "332px",
      boxSizing: "border-box",
    });

    const nameEl = document.createElement("div");
    Object.assign(nameEl.style, {
      width: "100%",
      fontFamily: '"Segoe UI", Tahoma, Verdana, sans-serif',
      fontSize: "18px",
      fontWeight: "800",
      lineHeight: "1.05",
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      color: "rgba(228, 238, 252, 0.92)",
      textAlign: "center",
      textShadow: "0 1px 2px rgba(0, 0, 0, 0.9)",
      marginBottom: "3px",
    });
    nameEl.textContent = playerName;

    const labels = document.createElement("div");
    Object.assign(labels.style, {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      width: "100%",
      columnGap: "10px",
      fontFamily: '"Segoe UI", Tahoma, Verdana, sans-serif',
      fontSize: "10px",
      fontWeight: "600",
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color: "rgba(180, 200, 230, 0.6)",
      textAlign: "center",
    });

    const killsLabel = document.createElement("div");
    killsLabel.textContent = "Kills";
    const hsLabel = document.createElement("div");
    hsLabel.textContent = "Headshots";
    const scoreLabel = document.createElement("div");
    scoreLabel.textContent = "Score";
    labels.append(killsLabel, hsLabel, scoreLabel);

    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      alignItems: "center",
      width: "100%",
      columnGap: "10px",
      fontFamily: '"Segoe UI", Tahoma, Verdana, sans-serif',
      fontVariantNumeric: "tabular-nums",
    });

    this.killsEl = document.createElement("span");
    Object.assign(this.killsEl.style, {
      fontSize: "30px",
      fontWeight: "700",
      color: "#e8f0ff",
      lineHeight: "1",
      textAlign: "center",
    });
    this.killsEl.textContent = "0";

    this.headshotsEl = document.createElement("span");
    Object.assign(this.headshotsEl.style, {
      fontSize: "30px",
      fontWeight: "700",
      color: "#e8f0ff",
      lineHeight: "1",
      textAlign: "center",
    });
    this.headshotsEl.textContent = "0";

    this.scoreEl = document.createElement("span");
    this.scoreEl.dataset.testid = "score";
    Object.assign(this.scoreEl.style, {
      fontSize: "30px",
      fontWeight: "700",
      color: "#e8f0ff",
      lineHeight: "1",
      textAlign: "center",
    });
    this.scoreEl.textContent = this.formatScore(this.score);
    row.append(this.killsEl, this.headshotsEl, this.scoreEl);

    const sessionRow = document.createElement("div");
    Object.assign(sessionRow.style, {
      display: "flex",
      width: "100%",
      justifyContent: "space-between",
      alignItems: "baseline",
      marginTop: "6px",
      paddingTop: "6px",
      borderTop: "1px solid rgba(255,255,255,0.08)",
      fontFamily: '"Segoe UI", Tahoma, Verdana, sans-serif',
    });

    const sessionLabel = document.createElement("span");
    Object.assign(sessionLabel.style, {
      fontSize: "11px",
      fontWeight: "600",
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color: "rgba(180, 200, 230, 0.6)",
    });
    sessionLabel.textContent = "Session Best";

    this.bestScoreEl = document.createElement("span");
    this.bestScoreEl.dataset.testid = "best-score";
    Object.assign(this.bestScoreEl.style, {
      fontSize: "17px",
      fontWeight: "700",
      fontVariantNumeric: "tabular-nums",
      letterSpacing: "0.04em",
      color: "rgba(228, 238, 252, 0.95)",
    });
    this.bestScoreEl.textContent = this.formatScore(0);
    sessionRow.append(sessionLabel, this.bestScoreEl);

    const championBlock = document.createElement("div");
    Object.assign(championBlock.style, {
      display: "grid",
      gap: "5px",
      width: "100%",
      marginTop: "4px",
      paddingTop: "7px",
      borderTop: "1px solid rgba(255,255,255,0.08)",
      fontFamily: '"Segoe UI", Tahoma, Verdana, sans-serif',
    });

    const championHeader = document.createElement("div");
    Object.assign(championHeader.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      gap: "10px",
    });

    const championLabel = document.createElement("span");
    Object.assign(championLabel.style, {
      fontSize: "11px",
      fontWeight: "600",
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color: "rgba(180, 200, 230, 0.6)",
    });
    championLabel.textContent = "World Champion";

    this.sharedChampionScoreEl = document.createElement("span");
    this.sharedChampionScoreEl.dataset.testid = "hud-world-champion-score";
    Object.assign(this.sharedChampionScoreEl.style, {
      fontSize: "17px",
      fontWeight: "700",
      fontVariantNumeric: "tabular-nums",
      letterSpacing: "0.04em",
      color: "#ffdca0",
    });
    championHeader.append(championLabel, this.sharedChampionScoreEl);

    const championBody = document.createElement("div");
    Object.assign(championBody.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "10px",
    });

    this.sharedChampionNameEl = document.createElement("span");
    this.sharedChampionNameEl.dataset.testid = "hud-world-champion-name";
    Object.assign(this.sharedChampionNameEl.style, {
      minWidth: "0",
      flex: "1 1 auto",
      fontSize: "16px",
      fontWeight: "700",
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: "rgba(244, 248, 255, 0.95)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });

    this.sharedChampionModeEl = document.createElement("span");
    this.sharedChampionModeEl.dataset.testid = "hud-world-champion-mode";
    Object.assign(this.sharedChampionModeEl.style, {
      flex: "0 0 auto",
      borderRadius: "999px",
      border: "1px solid rgba(255, 220, 172, 0.24)",
      background: "rgba(255, 220, 172, 0.12)",
      padding: "3px 9px 4px",
      fontSize: "10px",
      fontWeight: "700",
      letterSpacing: "0.16em",
      textTransform: "uppercase",
      color: "rgba(255, 231, 198, 0.9)",
    });
    championBody.append(this.sharedChampionNameEl, this.sharedChampionModeEl);

    championBlock.append(championHeader, championBody);
    this.root.append(nameEl, labels, row, sessionRow, championBlock);
    mountEl.append(this.root);

    this.setSharedChampion({ status: "loading", champion: null });
  }

  setTotal(_total: number): void {}

  recordKill(record: ScoreHudKillRecord): void {
    const isHeadshot = record.isHeadshot;
    this.kills += 1;
    const wave = Math.ceil(this.kills / this.WAVE_ENEMY_COUNT);
    const killValue = this.KILL_SCORE_BASE + (wave - 1) * this.WAVE_SCORE_INCREMENT;
    this.score += killValue;
    if (isHeadshot) {
      this.headshots += 1;
      this.score += killValue; // headshot bonus = killValue (2× total)
      this.headshotsEl.textContent = String(this.headshots);
    }
    this.killsEl.textContent = String(this.kills);
    this.scoreEl.textContent = this.formatScore(this.score);
    this.killsEl.style.color = "#ffd700";
    this.scoreEl.style.color = "#ffd700";
    this.headshotsEl.style.color = isHeadshot ? "#ffd700" : "#e8f0ff";
    this.flashTimerS = this.FLASH_DURATION_S;
    this.flashHeadshotActive = isHeadshot;
  }

  reset(): void {
    this.kills = 0;
    this.headshots = 0;
    this.score = this.SCORE_BASE;
    this.flashTimerS = 0;
    this.flashHeadshotActive = false;
    this.killsEl.textContent = "0";
    this.headshotsEl.textContent = "0";
    this.scoreEl.textContent = this.formatScore(this.score);
    this.killsEl.style.color = "#e8f0ff";
    this.headshotsEl.style.color = "#e8f0ff";
    this.scoreEl.style.color = "#e8f0ff";
  }

  update(deltaSeconds: number): void {
    if (this.flashTimerS <= 0) return;
    this.flashTimerS = Math.max(0, this.flashTimerS - deltaSeconds);
    if (this.flashTimerS > 0) return;

    this.killsEl.style.color = "#e8f0ff";
    this.headshotsEl.style.color = this.flashHeadshotActive ? "#e8f0ff" : this.headshotsEl.style.color;
    this.scoreEl.style.color = "#e8f0ff";
    this.flashHeadshotActive = false;
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? "flex" : "none";
  }

  getScore(): number {
    return this.score;
  }

  setBestScore(value: number): void {
    this.bestScoreEl.textContent = this.formatScore(value);
  }

  setSharedChampion(snapshot: SharedChampionSnapshot): void {
    const champion = snapshot.champion;
    if (snapshot.status === "unavailable") {
      this.sharedChampionNameEl.textContent = "Unavailable";
      this.sharedChampionModeEl.textContent = "OFFLINE";
      this.sharedChampionScoreEl.textContent = "--";
      return;
    }

    if (champion) {
      this.sharedChampionNameEl.textContent = champion.holderName.toUpperCase();
      this.sharedChampionModeEl.textContent = formatSharedChampionMode(champion.controlMode);
      this.sharedChampionScoreEl.textContent = formatSharedChampionScore(champion.score);
      return;
    }

    if (snapshot.status === "loading" || snapshot.status === "idle") {
      this.sharedChampionNameEl.textContent = "Loading";
      this.sharedChampionModeEl.textContent = "SYNC";
      this.sharedChampionScoreEl.textContent = "--";
      return;
    }

    this.sharedChampionNameEl.textContent = "No champion yet";
    this.sharedChampionModeEl.textContent = "OPEN";
    this.sharedChampionScoreEl.textContent = "--";
  }

  dispose(): void {
    this.root.remove();
  }

  private formatScore(value: number): string {
    return value.toLocaleString("en-US");
  }
}
