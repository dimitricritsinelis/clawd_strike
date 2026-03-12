/**
 * BuffTextHud — displays active buff effects as colored text lines
 * above the ammo HUD in the bottom-right corner.
 *
 * Each active buff shows its effect description (e.g. "+50% Movement Speed")
 * colored by the buff's vignette color. Buffs stack vertically, bottom-up.
 */

import {
  type BuffType,
  BUFF_DEFINITIONS,
  BUFF_TYPES,
} from "../buffs/BuffTypes";
import type { ActiveBuffSnapshot } from "../buffs/BuffManager";

const FONT_FAMILY = '"Segoe UI", Tahoma, Verdana, sans-serif';

const BUFF_EFFECT_TEXT: Record<BuffType, string> = {
  speed_boost: "+50% Speed",
  rapid_fire: "2\u00D7 Fire Rate",
  unlimited_ammo: "\u221E Ammo",
  health_boost: "+50 Shield",
};

/** Canonical display order (top → bottom) */
const DISPLAY_ORDER: readonly BuffType[] = BUFF_TYPES;

type TextEntry = {
  el: HTMLDivElement;
  type: BuffType;
};

export class BuffTextHud {
  private readonly root: HTMLDivElement;
  private readonly entries = new Map<BuffType, TextEntry>();
  private visible = true;

  constructor(mountEl: HTMLElement) {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "absolute",
      bottom: "90px",
      right: "22px",
      zIndex: "22",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      gap: "3px",
      pointerEvents: "none",
      maxWidth: "150px",
    } satisfies Partial<CSSStyleDeclaration>);
    mountEl.append(this.root);
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    this.root.style.display = visible ? "flex" : "none";
  }

  update(buffs: ActiveBuffSnapshot[], rallyingCryActive: boolean): void {
    // Determine which buff types to display
    const activeTypes = new Set<BuffType>();
    if (rallyingCryActive) {
      // Rallying Cry — show all 4 buff effects
      for (const t of BUFF_TYPES) activeTypes.add(t);
    } else {
      for (const b of buffs) activeTypes.add(b.type);
    }

    // Add entries for newly active buffs (in canonical order)
    for (const type of DISPLAY_ORDER) {
      if (!activeTypes.has(type)) continue;
      if (this.entries.has(type)) continue;

      const def = BUFF_DEFINITIONS[type];
      const el = document.createElement("div");
      Object.assign(el.style, {
        fontFamily: FONT_FAMILY,
        fontSize: "18px",
        fontWeight: "700",
        letterSpacing: "0.03em",
        color: `rgb(${def.vignetteColor})`,
        textShadow: `0 1px 6px rgba(0, 0, 0, 0.9), 0 0 10px rgba(${def.vignetteColor}, 0.4)`,
        textAlign: "right",
        whiteSpace: "nowrap",
        lineHeight: "1.3",
      } satisfies Partial<CSSStyleDeclaration>);
      el.textContent = BUFF_EFFECT_TEXT[type];

      this.entries.set(type, { el, type });
    }

    // Remove entries for expired buffs
    for (const [type, entry] of this.entries) {
      if (!activeTypes.has(type)) {
        entry.el.remove();
        this.entries.delete(type);
      }
    }

    // Rebuild DOM order to match canonical display order
    for (const type of DISPLAY_ORDER) {
      const entry = this.entries.get(type);
      if (entry) {
        this.root.append(entry.el);
      }
    }
  }

  clear(): void {
    for (const [, entry] of this.entries) {
      entry.el.remove();
    }
    this.entries.clear();
  }

  dispose(): void {
    this.clear();
    this.root.remove();
  }
}
