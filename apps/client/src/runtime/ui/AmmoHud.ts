export type AmmoHudSnapshot = {
  mag: number;
  reserve: number;
  reloading: boolean;
  reloadT01: number;
};

const COLOR_NORMAL = "#f4f7fb";
const COLOR_LOW = "#f5b24a";
const COLOR_EMPTY = "#ff5f5f";

export class AmmoHud {
  private readonly root: HTMLDivElement;
  private readonly magEl: HTMLDivElement;
  private readonly reserveEl: HTMLSpanElement;
  private readonly reloadBarTrack: HTMLDivElement;
  private readonly reloadBarFill: HTMLDivElement;

  private visible = true;
  private lastMag = -1;
  private lastReserve = -1;
  private lastReloading = false;
  private lastReloadT01 = -1;

  constructor(mountEl: HTMLElement) {
    this.root = document.createElement("div");
    this.root.style.position = "absolute";
    this.root.style.right = "22px";
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

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "flex-end";
    row.style.gap = "8px";
    row.style.fontVariantNumeric = "tabular-nums";
    row.style.fontFeatureSettings = '"tnum"';

    this.magEl = document.createElement("div");
    this.magEl.style.minWidth = "52px";
    this.magEl.style.textAlign = "right";
    this.magEl.style.fontFamily = '"Segoe UI", Tahoma, Verdana, sans-serif';
    this.magEl.style.fontSize = "42px";
    this.magEl.style.fontWeight = "780";
    this.magEl.style.lineHeight = "0.95";
    this.magEl.style.letterSpacing = "0.02em";
    this.magEl.textContent = "30";

    const reserveWrap = document.createElement("div");
    reserveWrap.style.display = "flex";
    reserveWrap.style.alignItems = "baseline";
    reserveWrap.style.gap = "6px";
    reserveWrap.style.marginBottom = "2px";
    reserveWrap.style.color = "rgba(233, 240, 249, 0.92)";
    reserveWrap.style.fontFamily = '"Segoe UI", Tahoma, Verdana, sans-serif';
    reserveWrap.style.fontWeight = "620";
    reserveWrap.style.fontSize = "22px";
    reserveWrap.style.lineHeight = "1";

    const divider = document.createElement("span");
    divider.textContent = "/";
    divider.style.opacity = "0.8";

    this.reserveEl = document.createElement("span");
    this.reserveEl.style.fontSize = "26px";
    this.reserveEl.style.letterSpacing = "0.02em";
    this.reserveEl.textContent = "90";

    reserveWrap.append(divider, this.reserveEl);
    row.append(this.magEl, reserveWrap);

    this.reloadBarTrack = document.createElement("div");
    this.reloadBarTrack.style.position = "relative";
    this.reloadBarTrack.style.marginTop = "8px";
    this.reloadBarTrack.style.height = "3px";
    this.reloadBarTrack.style.width = "100%";
    this.reloadBarTrack.style.borderRadius = "999px";
    this.reloadBarTrack.style.background = "rgba(173, 193, 217, 0.22)";
    this.reloadBarTrack.style.overflow = "hidden";
    this.reloadBarTrack.style.display = "none";

    this.reloadBarFill = document.createElement("div");
    this.reloadBarFill.style.position = "absolute";
    this.reloadBarFill.style.left = "0";
    this.reloadBarFill.style.top = "0";
    this.reloadBarFill.style.bottom = "0";
    this.reloadBarFill.style.width = "100%";
    this.reloadBarFill.style.transformOrigin = "left center";
    this.reloadBarFill.style.transform = "scaleX(0)";
    this.reloadBarFill.style.background = "linear-gradient(90deg, #92c6ff 0%, #e7f2ff 100%)";
    this.reloadBarFill.style.boxShadow = "0 0 8px rgba(162, 207, 255, 0.55)";

    this.reloadBarTrack.append(this.reloadBarFill);
    this.root.append(row, this.reloadBarTrack);
    mountEl.append(this.root);
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    this.root.style.display = visible ? "block" : "none";
  }

  update(snapshot: AmmoHudSnapshot): void {
    const mag = Math.max(0, Math.floor(snapshot.mag));
    const reserve = Math.max(0, Math.floor(snapshot.reserve));
    const reloading = snapshot.reloading;
    const reloadT01 = Math.min(1, Math.max(0, snapshot.reloadT01));

    if (mag !== this.lastMag) {
      this.lastMag = mag;
      this.magEl.textContent = String(mag);
      this.magEl.style.color = mag === 0 ? COLOR_EMPTY : mag <= 6 ? COLOR_LOW : COLOR_NORMAL;
    }

    if (reserve !== this.lastReserve) {
      this.lastReserve = reserve;
      this.reserveEl.textContent = String(reserve);
    }

    if (reloading !== this.lastReloading) {
      this.lastReloading = reloading;
      this.reloadBarTrack.style.display = reloading ? "block" : "none";
    }

    if (reloading && Math.abs(reloadT01 - this.lastReloadT01) > 0.001) {
      this.lastReloadT01 = reloadT01;
      this.reloadBarFill.style.transform = `scaleX(${reloadT01.toFixed(3)})`;
    } else if (!reloading && this.lastReloadT01 !== 0) {
      this.lastReloadT01 = 0;
      this.reloadBarFill.style.transform = "scaleX(0)";
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
