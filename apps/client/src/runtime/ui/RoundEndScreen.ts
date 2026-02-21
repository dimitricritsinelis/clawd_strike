/**
 * RoundEndScreen — displayed when the player clears all enemies in a wave.
 * Shows "ROUND COMPLETE", the kill time, wave number, and a full stats breakdown:
 *   Kills | Shots Fired | Accuracy | Headshots
 * Fades in over 0.4s and hides automatically when the new wave spawns.
 */

const FADE_IN_S = 0.4;

export type RoundStats = {
  kills: number;
  totalEnemies: number;
  shotsFired: number;
  shotsHit: number;
  headshots: number;
};

function statRow(label: string, value: string, highlight = false): HTMLDivElement {
  const row = document.createElement("div");
  Object.assign(row.style, {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "5px 0",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
    gap: "32px",
  });

  const labelEl = document.createElement("span");
  Object.assign(labelEl.style, {
    fontFamily: '"Segoe UI", Tahoma, Verdana, sans-serif',
    fontSize: "13px",
    fontWeight: "500",
    letterSpacing: "0.09em",
    textTransform: "uppercase",
    color: "rgba(180, 200, 230, 0.55)",
  });
  labelEl.textContent = label;

  const valueEl = document.createElement("span");
  Object.assign(valueEl.style, {
    fontFamily: '"Segoe UI", Tahoma, Verdana, sans-serif',
    fontSize: "15px",
    fontWeight: "700",
    letterSpacing: "0.04em",
    color: highlight ? "#f5d060" : "rgba(220, 235, 255, 0.90)",
    textShadow: highlight ? "0 0 12px rgba(245, 208, 96, 0.4)" : "none",
  });
  valueEl.textContent = value;

  row.append(labelEl, valueEl);
  return row;
}

export class RoundEndScreen {
  readonly root: HTMLDivElement;
  private readonly titleEl: HTMLDivElement;
  private readonly timeEl: HTMLDivElement;
  private readonly waveEl: HTMLDivElement;
  private readonly statsContainer: HTMLDivElement;
  private readonly countdownLabelEl: HTMLDivElement;
  private readonly countdownEl: HTMLDivElement;

  private visible = false;
  private fadeTimerS = 0;

  /** Updated externally each frame with the next-wave countdown (seconds remaining). */
  onUpdate: ((countdownS: number, waveNumber: number) => void) | null = null;

  constructor(mountEl: HTMLElement) {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "fixed",
      inset: "0",
      background: "rgba(0, 0, 0, 0.62)",
      zIndex: "30",
      display: "none",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      pointerEvents: "none",
      opacity: "0",
      userSelect: "none",
    });

    // "ROUND COMPLETE" title
    this.titleEl = document.createElement("div");
    Object.assign(this.titleEl.style, {
      fontFamily: '"Segoe UI", Tahoma, Verdana, sans-serif',
      fontSize: "60px",
      fontWeight: "780",
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      color: "#4fc85a",
      textShadow: "0 0 40px rgba(60, 200, 80, 0.55), 0 0 80px rgba(40, 160, 60, 0.28)",
    });
    this.titleEl.textContent = "ROUND COMPLETE";

    // Time display (e.g. "Cleared in 02:14")
    this.timeEl = document.createElement("div");
    Object.assign(this.timeEl.style, {
      fontFamily: '"Segoe UI", Tahoma, Verdana, sans-serif',
      fontSize: "28px",
      fontWeight: "500",
      color: "rgba(220, 235, 255, 0.80)",
      marginTop: "16px",
      letterSpacing: "0.06em",
    });
    this.timeEl.textContent = "";

    // Wave number label (e.g. "Wave 1 cleared")
    this.waveEl = document.createElement("div");
    Object.assign(this.waveEl.style, {
      fontFamily: '"Segoe UI", Tahoma, Verdana, sans-serif',
      fontSize: "18px",
      fontWeight: "400",
      color: "rgba(180, 200, 230, 0.55)",
      marginTop: "8px",
      letterSpacing: "0.05em",
    });
    this.waveEl.textContent = "";

    // Stats panel
    this.statsContainer = document.createElement("div");
    Object.assign(this.statsContainer.style, {
      marginTop: "24px",
      width: "260px",
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.10)",
      borderRadius: "8px",
      padding: "12px 18px",
      backdropFilter: "blur(2px)",
    });

    // Divider between stats and countdown
    const divider = document.createElement("div");
    Object.assign(divider.style, {
      width: "220px",
      height: "1px",
      background: "rgba(255,255,255,0.12)",
      margin: "24px 0 18px",
    });

    // "Next wave in X" label
    this.countdownLabelEl = document.createElement("div");
    Object.assign(this.countdownLabelEl.style, {
      fontFamily: '"Segoe UI", Tahoma, Verdana, sans-serif',
      fontSize: "16px",
      fontWeight: "400",
      color: "rgba(180, 200, 230, 0.5)",
      letterSpacing: "0.04em",
    });
    this.countdownLabelEl.textContent = "NEXT WAVE IN";

    // Large countdown number
    this.countdownEl = document.createElement("div");
    Object.assign(this.countdownEl.style, {
      fontFamily: '"Segoe UI", Tahoma, Verdana, sans-serif',
      fontSize: "52px",
      fontWeight: "700",
      color: "rgba(255, 255, 255, 0.85)",
      marginTop: "8px",
      letterSpacing: "0.04em",
      textShadow: "0 0 24px rgba(255,255,255,0.22)",
    });
    this.countdownEl.textContent = "5";

    this.root.append(
      this.titleEl,
      this.timeEl,
      this.waveEl,
      this.statsContainer,
      divider,
      this.countdownLabelEl,
      this.countdownEl,
    );
    mountEl.append(this.root);
  }

  /**
   * Show the screen with kill time, wave number, and round stats.
   * @param killTimeS   Seconds elapsed during this wave.
   * @param waveNumber  Wave that was just cleared (1-indexed).
   * @param stats       Optional shot/kill/headshot stats.
   */
  show(killTimeS: number, waveNumber: number, stats?: RoundStats): void {
    if (this.visible) return;
    this.visible = true;
    this.fadeTimerS = 0;
    this.root.style.display = "flex";
    this.root.style.opacity = "0";

    const mins = Math.floor(killTimeS / 60);
    const secs = Math.floor(killTimeS % 60);
    this.timeEl.textContent = `Cleared in ${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    this.waveEl.textContent = `Wave ${waveNumber} cleared`;
    this.countdownEl.textContent = "5";

    // Rebuild stats panel
    this.statsContainer.innerHTML = "";
    if (stats) {
      const acc = stats.shotsFired > 0
        ? `${Math.round((stats.shotsHit / stats.shotsFired) * 100)}%`
        : "—";
      const hsRate = stats.kills > 0
        ? `${Math.round((stats.headshots / stats.kills) * 100)}%`
        : "—";
      this.statsContainer.append(
        statRow("Kills", `${stats.kills} / ${stats.totalEnemies}`, stats.kills === stats.totalEnemies),
        statRow("Shots Fired", String(stats.shotsFired)),
        statRow("Accuracy", acc, parseFloat(acc) >= 50),
        statRow("Headshots", String(stats.headshots), stats.headshots > 0),
        statRow("HS Rate", hsRate),
      );
      this.statsContainer.style.display = "block";
    } else {
      this.statsContainer.style.display = "none";
    }
  }

  hide(): void {
    this.visible = false;
    this.root.style.display = "none";
    this.root.style.opacity = "0";
  }

  /** Called every frame from bootstrap step(). Drives fade-in and countdown display. */
  update(deltaSeconds: number, countdownS: number): void {
    if (!this.visible) return;

    // Fade in
    this.fadeTimerS = Math.min(FADE_IN_S, this.fadeTimerS + deltaSeconds);
    this.root.style.opacity = (this.fadeTimerS / FADE_IN_S).toFixed(3);

    // Update countdown
    const displaySecs = Math.max(0, Math.ceil(countdownS));
    this.countdownEl.textContent = String(displaySecs);
  }

  isVisible(): boolean {
    return this.visible;
  }

  dispose(): void {
    this.root.remove();
  }
}
