export type HealthHudSnapshot = {
  health: number;    // 0–maxHealth
  maxHealth?: number; // defaults to 100
};

const COLOR_HEALTHY = "#6ee87a";
const COLOR_WOUNDED = "#f5b24a";
const COLOR_CRITICAL = "#ff5f5f";

function healthColor(hp: number): string {
  if (hp > 60) return COLOR_HEALTHY;
  if (hp > 30) return COLOR_WOUNDED;
  return COLOR_CRITICAL;
}

export class HealthHud {
  private readonly root: HTMLDivElement;
  private readonly barFill: HTMLDivElement;
  private readonly numericEl: HTMLDivElement;

  private visible = true;
  private displayHealth = 100;
  private lastRenderedHealth = -1;

  constructor(mountEl: HTMLElement, playerName = "Operator") {
    this.root = document.createElement("div");
    this.root.style.position = "absolute";
    this.root.style.left = "22px";
    this.root.style.bottom = "20px";
    this.root.style.padding = "12px 14px 10px";
    this.root.style.pointerEvents = "none";
    this.root.style.zIndex = "22";
    this.root.style.borderRadius = "10px";
    this.root.style.border = "1px solid rgba(230, 238, 248, 0.2)";
    this.root.style.background = "rgba(6, 10, 16, 0.56)";
    this.root.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.33)";
    this.root.style.backdropFilter = "blur(1.5px)";
    this.root.style.display = "block";
    this.root.style.minWidth = "110px";

    const nameEl = document.createElement("div");
    nameEl.style.fontFamily = '"Segoe UI", Tahoma, Verdana, sans-serif';
    nameEl.style.fontSize = "18px";
    nameEl.style.fontWeight = "700";
    nameEl.style.letterSpacing = "0.1em";
    nameEl.style.color = "rgba(228, 238, 252, 0.9)";
    nameEl.style.textTransform = "uppercase";
    nameEl.style.marginBottom = "6px";
    nameEl.style.textAlign = "center";
    nameEl.style.width = "100%";
    nameEl.style.textShadow = "0 1px 2px rgba(0, 0, 0, 0.92)";
    nameEl.textContent = playerName;

    // Label row
    const labelEl = document.createElement("div");
    labelEl.style.fontFamily = '"Segoe UI", Tahoma, Verdana, sans-serif';
    labelEl.style.fontSize = "11px";
    labelEl.style.fontWeight = "600";
    labelEl.style.letterSpacing = "0.12em";
    labelEl.style.color = "rgba(180, 200, 220, 0.65)";
    labelEl.style.textTransform = "uppercase";
    labelEl.style.marginBottom = "6px";
    labelEl.textContent = "HP";

    // Numeric display
    this.numericEl = document.createElement("div");
    this.numericEl.style.minWidth = "52px";
    this.numericEl.style.textAlign = "left";
    this.numericEl.style.fontFamily = '"Segoe UI", Tahoma, Verdana, sans-serif';
    this.numericEl.style.fontSize = "42px";
    this.numericEl.style.fontWeight = "780";
    this.numericEl.style.lineHeight = "0.95";
    this.numericEl.style.letterSpacing = "0.02em";
    this.numericEl.style.fontVariantNumeric = "tabular-nums";
    this.numericEl.style.fontFeatureSettings = '"tnum"';
    this.numericEl.style.color = COLOR_HEALTHY;
    this.numericEl.style.marginBottom = "8px";
    this.numericEl.textContent = "100";

    // Bar track
    const barTrack = document.createElement("div");
    barTrack.style.position = "relative";
    barTrack.style.height = "4px";
    barTrack.style.width = "100%";
    barTrack.style.borderRadius = "999px";
    barTrack.style.background = "rgba(173, 193, 217, 0.22)";
    barTrack.style.overflow = "hidden";

    this.barFill = document.createElement("div");
    this.barFill.style.position = "absolute";
    this.barFill.style.left = "0";
    this.barFill.style.top = "0";
    this.barFill.style.bottom = "0";
    this.barFill.style.width = "100%";
    this.barFill.style.transformOrigin = "left center";
    this.barFill.style.transform = "scaleX(1)";
    this.barFill.style.background = COLOR_HEALTHY;
    this.barFill.style.boxShadow = "0 0 8px rgba(110, 232, 122, 0.45)";

    barTrack.append(this.barFill);
    this.root.append(nameEl, labelEl, this.numericEl, barTrack);
    mountEl.append(this.root);
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    this.root.style.display = visible ? "block" : "none";
  }

  update(snapshot: HealthHudSnapshot, deltaSeconds: number): void {
    const maxHealth = snapshot.maxHealth ?? 100;
    const target = Math.max(0, Math.min(maxHealth, snapshot.health));

    // Frame-rate independent lerp — snappy but not instant
    const lerpRate = 8;
    this.displayHealth += (target - this.displayHealth) * Math.min(1, deltaSeconds * lerpRate);

    const rendered = Math.round(this.displayHealth);
    if (rendered === this.lastRenderedHealth) return;
    this.lastRenderedHealth = rendered;

    const t = rendered / maxHealth;
    // Color thresholds relative to max
    const pct = rendered / maxHealth * 100;
    const color = healthColor(pct);

    this.barFill.style.transform = `scaleX(${t.toFixed(3)})`;
    this.barFill.style.background = color;
    this.barFill.style.boxShadow = pct > 60
      ? "0 0 8px rgba(110, 232, 122, 0.45)"
      : pct > 30
        ? "0 0 8px rgba(245, 178, 74, 0.45)"
        : "0 0 8px rgba(255, 95, 95, 0.55)";
    this.numericEl.textContent = maxHealth === 100
      ? String(rendered)
      : `${rendered} / ${maxHealth}`;
    this.numericEl.style.color = color;
  }

  dispose(): void {
    this.root.remove();
  }
}
