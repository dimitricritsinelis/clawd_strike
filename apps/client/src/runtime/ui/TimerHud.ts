/**
 * TimerHud — top-center HUD showing elapsed time for the current wave.
 * Displayed directly below the ScoreHud (z-index 22).
 * Format: "MM:SS" — e.g. "01:42"
 * Changes color at urgency thresholds and pulses at ≤10s.
 */
export class TimerHud {
  readonly root: HTMLDivElement;
  private readonly timeEl: HTMLSpanElement;

  private elapsedS = 0;
  private running = false;
  private lastDisplaySecs = -1;
  private pulsePhase = 0; // drives 1Hz scale pulse at low time

  constructor(mountEl: HTMLElement) {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "absolute",
      top: "20px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "22",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(8, 16, 28, 0.55)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: "5px",
      padding: "3px 14px 4px",
      pointerEvents: "none",
      userSelect: "none",
      minWidth: "74px",
      transformOrigin: "center center",
    });

    this.timeEl = document.createElement("span");
    Object.assign(this.timeEl.style, {
      fontFamily: '"Segoe UI", Tahoma, Verdana, sans-serif',
      fontSize: "15px",
      fontWeight: "600",
      fontVariantNumeric: "tabular-nums",
      letterSpacing: "0.06em",
      color: "rgba(180, 200, 230, 0.65)",
      transition: "color 0.4s ease-out",
    });
    this.timeEl.textContent = "00:00";

    this.root.append(this.timeEl);
    mountEl.append(this.root);
  }

  /** Start or resume the timer. */
  start(): void {
    this.running = true;
  }

  /** Pause the timer (e.g., while dead or in round-end screen). */
  pause(): void {
    this.running = false;
  }

  /** Reset elapsed time to zero (call at start of new wave). */
  reset(): void {
    this.elapsedS = 0;
    this.lastDisplaySecs = -1;
    this.timeEl.textContent = "00:00";
    this.timeEl.style.color = "rgba(180, 200, 230, 0.65)";
    this.root.style.transform = "translateX(-50%) scale(1)";
  }

  /** Called every frame from bootstrap step(). */
  update(deltaSeconds: number): void {
    if (!this.running) return;
    this.elapsedS += deltaSeconds;

    const totalSecs = Math.floor(this.elapsedS);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;

    if (totalSecs !== this.lastDisplaySecs) {
      this.lastDisplaySecs = totalSecs;
      this.timeEl.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

      // Urgency color — changes based on elapsed time milestones
      // (Elapsed timer: orange after 30s, red after 90s as indication of time spent)
      if (totalSecs >= 90) {
        this.timeEl.style.color = "rgba(255, 95, 95, 0.9)";
      } else if (totalSecs >= 30) {
        this.timeEl.style.color = "rgba(245, 178, 74, 0.85)";
      } else {
        this.timeEl.style.color = "rgba(180, 200, 230, 0.65)";
      }
    }

    // Pulse scale at ≥90s (long wave — urgency signal)
    if (totalSecs >= 90) {
      this.pulsePhase += deltaSeconds * Math.PI * 2 / 0.6; // 0.6s period
      const scale = 1 + 0.06 * Math.abs(Math.sin(this.pulsePhase));
      this.root.style.transform = `translateX(-50%) scale(${scale.toFixed(3)})`;
    } else {
      this.root.style.transform = "translateX(-50%) scale(1)";
      this.pulsePhase = 0;
    }
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? "flex" : "none";
  }

  dispose(): void {
    this.root.remove();
  }
}
