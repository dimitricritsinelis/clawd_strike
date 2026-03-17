/**
 * MobileScoreStrip — compact single-line score display for mobile gameplay.
 *
 * Replaces the full ScoreHud on mobile devices.
 * Shows only: kills, headshots, and score in a tiny top-right strip.
 * No player name, no session best, no world champion.
 *
 * Auto-opacity: 0.45 normally, flashes to 1.0 on kill for 1.5s.
 *
 * Implements the same public API surface as ScoreHud so bootstrap.ts
 * can use either interchangeably.
 */
import type { SharedChampionSnapshot } from "../../../../shared/highScore";
import { ENEMIES_PER_WAVE } from "../enemies/EnemyManager";

type ScoreHudKillRecord = {
  isHeadshot: boolean;
};

const SANS_FONT = '"Segoe UI", Tahoma, Verdana, sans-serif';
const BASE_OPACITY = 0.6;
const FLASH_OPACITY = 1.0;
const FLASH_DURATION_S = 1.5;
const FADE_TRANSITION = "opacity 0.3s ease";

export class MobileScoreStrip {
  readonly root: HTMLDivElement;
  private readonly killsEl: HTMLSpanElement;
  private readonly headshotsEl: HTMLSpanElement;
  private readonly scoreEl: HTMLSpanElement;

  private kills = 0;
  private headshots = 0;
  private score = 0;
  private readonly WAVE_ENEMY_COUNT = ENEMIES_PER_WAVE;
  private readonly KILL_SCORE_BASE = 5;
  private readonly WAVE_SCORE_INCREMENT = 2;
  private flashTimerS = 0;

  constructor(mountEl: HTMLElement) {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "absolute",
      top: `calc(4px + env(safe-area-inset-top, 0px))`,
      right: `calc(8px + env(safe-area-inset-right, 0px))`,
      zIndex: "22",
      display: "flex",
      alignItems: "center",
      gap: "10px",
      background: "rgba(8, 16, 28, 0.5)",
      border: "1px solid rgba(255, 255, 255, 0.08)",
      borderRadius: "6px",
      padding: "5px 12px",
      pointerEvents: "none",
      userSelect: "none",
      fontFamily: SANS_FONT,
      fontSize: "14px",
      fontWeight: "600",
      fontVariantNumeric: "tabular-nums",
      letterSpacing: "0.06em",
      color: "rgba(228, 238, 252, 0.92)",
      textShadow: "0 1px 3px rgba(0, 0, 0, 0.9)",
      opacity: String(BASE_OPACITY),
      transition: FADE_TRANSITION,
    });

    // Kills
    const killsGroup = this._createGroup("K:");
    this.killsEl = killsGroup.valueEl;

    // Headshots
    const hsGroup = this._createGroup("HS:");
    this.headshotsEl = hsGroup.valueEl;

    // Score
    this.scoreEl = document.createElement("span");
    Object.assign(this.scoreEl.style, {
      fontWeight: "700",
      fontSize: "14px",
      color: "#ffd78d",
    });
    this.scoreEl.textContent = "0";

    this.root.append(killsGroup.el, hsGroup.el, this.scoreEl);
    mountEl.append(this.root);
  }

  private _createGroup(label: string): { el: HTMLSpanElement; valueEl: HTMLSpanElement } {
    const el = document.createElement("span");
    Object.assign(el.style, {
      display: "inline-flex",
      alignItems: "baseline",
      gap: "3px",
    });

    const labelEl = document.createElement("span");
    Object.assign(labelEl.style, {
      fontSize: "11px",
      fontWeight: "600",
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "rgba(180, 200, 230, 0.7)",
    });
    labelEl.textContent = label;

    const valueEl = document.createElement("span");
    valueEl.textContent = "0";

    el.append(labelEl, valueEl);
    return { el, valueEl };
  }

  recordKill(record: ScoreHudKillRecord): void {
    this.kills += 1;
    const wave = Math.ceil(this.kills / this.WAVE_ENEMY_COUNT);
    const killValue = this.KILL_SCORE_BASE + (wave - 1) * this.WAVE_SCORE_INCREMENT;
    this.score += killValue;
    if (record.isHeadshot) {
      this.headshots += 1;
      this.score += killValue; // headshot bonus = killValue (2× total)
      this.headshotsEl.textContent = String(this.headshots);
    }
    this.killsEl.textContent = String(this.kills);
    this.scoreEl.textContent = this.score.toLocaleString("en-US");

    // Flash on kill
    this.root.style.opacity = String(FLASH_OPACITY);
    this.flashTimerS = FLASH_DURATION_S;
  }

  reset(): void {
    this.kills = 0;
    this.headshots = 0;
    this.score = 0;
    this.flashTimerS = 0;
    this.killsEl.textContent = "0";
    this.headshotsEl.textContent = "0";
    this.scoreEl.textContent = "0";
    this.root.style.opacity = String(BASE_OPACITY);
  }

  update(deltaSeconds: number): void {
    if (this.flashTimerS <= 0) return;
    this.flashTimerS = Math.max(0, this.flashTimerS - deltaSeconds);
    if (this.flashTimerS <= 0) {
      this.root.style.opacity = String(BASE_OPACITY);
    }
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? "flex" : "none";
  }

  getScore(): number {
    return this.score;
  }

  // No-ops on mobile strip (desktop-only features)
  setTotal(_total: number): void {}
  setBestScore(_value: number): void {}
  setSharedChampion(_snapshot: SharedChampionSnapshot): void {}

  dispose(): void {
    this.root.remove();
  }
}
