/**
 * ScoreHud — top-right HUD showing total kills.
 * Style matches the existing AmmoHud / HealthHud glass panel aesthetic.
 */
export class ScoreHud {
  readonly root: HTMLDivElement;
  private readonly killsEl: HTMLSpanElement;
  private readonly headshotsEl: HTMLSpanElement;
  private readonly scoreEl: HTMLSpanElement;

  private kills = 0;
  private headshots = 0;
  private score = 0;
  private readonly SCORE_BASE = 0;
  private readonly SCORE_PER_KILL = 10;
  private readonly SCORE_PER_HEADSHOT = 2.5;

  constructor(mountEl: HTMLElement, playerName = "Operator") {
    this.root = document.createElement("div");
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
      padding: "8px 12px 9px",
      pointerEvents: "none",
      userSelect: "none",
      width: "300px",
      minWidth: "300px",
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

    // Numeric display: total kills
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
    Object.assign(this.scoreEl.style, {
      fontSize: "30px",
      fontWeight: "700",
      color: "#e8f0ff",
      lineHeight: "1",
      textAlign: "center",
    });
    this.scoreEl.textContent = this.formatScore(this.score);

    row.append(this.killsEl, this.headshotsEl, this.scoreEl);
    this.root.append(nameEl, labels, row);
    mountEl.append(this.root);
  }

  setTotal(_total: number): void {}

  addKill(): void {
    this.kills += 1;
    this.score += this.SCORE_PER_KILL;
    this.killsEl.textContent = String(this.kills);
    this.scoreEl.textContent = this.formatScore(this.score);
    // Flash gold on kill
    this.killsEl.style.color = "#ffd700";
    this.scoreEl.style.color = "#ffd700";
    setTimeout(() => {
      this.killsEl.style.color = "#e8f0ff";
      this.scoreEl.style.color = "#e8f0ff";
    }, 300);
  }

  addHeadshot(): void {
    this.headshots += 1;
    this.score += this.SCORE_PER_HEADSHOT;
    this.headshotsEl.textContent = String(this.headshots);
    this.scoreEl.textContent = this.formatScore(this.score);
    this.headshotsEl.style.color = "#ffd700";
    this.scoreEl.style.color = "#ffd700";
    setTimeout(() => {
      this.headshotsEl.style.color = "#e8f0ff";
      this.scoreEl.style.color = "#e8f0ff";
    }, 300);
  }

  reset(): void {
    this.kills = 0;
    this.headshots = 0;
    this.score = this.SCORE_BASE;
    this.killsEl.textContent = "0";
    this.headshotsEl.textContent = "0";
    this.scoreEl.textContent = this.formatScore(this.score);
    this.killsEl.style.color = "#e8f0ff";
    this.headshotsEl.style.color = "#e8f0ff";
    this.scoreEl.style.color = "#e8f0ff";
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? "flex" : "none";
  }

  dispose(): void {
    this.root.remove();
  }

  private formatScore(value: number): string {
    return value.toLocaleString("en-US");
  }
}
