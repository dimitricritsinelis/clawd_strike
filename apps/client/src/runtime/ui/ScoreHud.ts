/**
 * ScoreHud — top-center HUD showing kills / total enemies.
 * Style matches the existing AmmoHud / HealthHud glass panel aesthetic.
 */
export class ScoreHud {
  readonly root: HTMLDivElement;
  private readonly killsEl: HTMLSpanElement;
  private readonly totalEl: HTMLSpanElement;
  private readonly labelEl: HTMLDivElement;

  private kills = 0;
  private total = 0;

  constructor(mountEl: HTMLElement) {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "absolute",
      top: "20px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "22",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "2px",
      background: "rgba(8, 16, 28, 0.68)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "6px",
      padding: "6px 18px 7px",
      pointerEvents: "none",
      userSelect: "none",
      minWidth: "90px",
    });

    // "KILLS" label
    this.labelEl = document.createElement("div");
    Object.assign(this.labelEl.style, {
      fontFamily: '"Segoe UI", Tahoma, Verdana, sans-serif',
      fontSize: "10px",
      fontWeight: "600",
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color: "rgba(180, 200, 230, 0.6)",
    });
    this.labelEl.textContent = "KILLS";

    // Numeric display: "kills / total"
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "flex",
      alignItems: "baseline",
      gap: "3px",
      fontFamily: '"Segoe UI", Tahoma, Verdana, sans-serif',
      fontVariantNumeric: "tabular-nums",
    });

    this.killsEl = document.createElement("span");
    Object.assign(this.killsEl.style, {
      fontSize: "28px",
      fontWeight: "700",
      color: "#e8f0ff",
      lineHeight: "1",
    });
    this.killsEl.textContent = "0";

    const sep = document.createElement("span");
    Object.assign(sep.style, {
      fontSize: "18px",
      fontWeight: "400",
      color: "rgba(180,200,230,0.5)",
    });
    sep.textContent = "/";

    this.totalEl = document.createElement("span");
    Object.assign(this.totalEl.style, {
      fontSize: "18px",
      fontWeight: "600",
      color: "rgba(180,200,230,0.7)",
    });
    this.totalEl.textContent = "0";

    row.append(this.killsEl, sep, this.totalEl);
    this.root.append(this.labelEl, row);
    mountEl.append(this.root);
  }

  setTotal(total: number): void {
    if (this.total === total) return;
    this.total = total;
    this.totalEl.textContent = String(total);
  }

  addKill(): void {
    this.kills = Math.min(this.kills + 1, this.total);
    this.killsEl.textContent = String(this.kills);
    // Flash gold on kill
    this.killsEl.style.color = "#ffd700";
    setTimeout(() => {
      this.killsEl.style.color = "#e8f0ff";
    }, 300);
  }

  reset(): void {
    this.kills = 0;
    this.killsEl.textContent = "0";
    this.killsEl.style.color = "#e8f0ff";
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? "flex" : "none";
  }

  dispose(): void {
    this.root.remove();
  }
}
