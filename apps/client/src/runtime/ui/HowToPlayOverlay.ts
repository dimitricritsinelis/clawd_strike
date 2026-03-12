/**
 * HowToPlayOverlay — gameplay and buff guide opened from the PauseMenu.
 * Two sections: Gameplay Overview and Buffs.
 * Sits above the PauseMenu at z-index 35.
 * Closes on Esc (handled in bootstrap) or close button.
 *
 * Desert bazaar theme: warm sand/gold/brown palette matching the PauseMenu.
 */

import {
  type BuffType,
  BUFF_DEFINITIONS,
  BUFF_TYPES,
  RALLYING_CRY_NAME,
  RALLYING_CRY_ICON_PATH,
} from "../buffs/BuffTypes";

/* ── Theme constants (mirrored from PauseMenu) ── */

const SERIF_FONT = 'Georgia, "Palatino Linotype", Palatino, "Book Antiqua", serif';
const SANS_FONT = '"Segoe UI", Tahoma, Verdana, sans-serif';

/* ── Buff effect descriptions (human-readable, colocated with UI) ── */

const BUFF_EFFECTS: Record<BuffType, string> = {
  speed_boost: "+50% movement speed",
  rapid_fire: "2\u00D7 fire rate, 2\u00D7 reload speed",
  unlimited_ammo: "Unlimited ammo, no reload needed",
  health_boost: "+50 overshield (absorbs damage first)",
};

/* ── Helpers ── */

function createOrnamentalDivider(width = "220px"): HTMLDivElement {
  const divider = document.createElement("div");
  Object.assign(divider.style, {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    margin: "12px 0",
    width,
  });

  const lineLeft = document.createElement("div");
  Object.assign(lineLeft.style, {
    flex: "1",
    height: "1px",
    background: "linear-gradient(90deg, transparent, rgba(247, 214, 160, 0.3))",
  });

  const diamond = document.createElement("div");
  Object.assign(diamond.style, {
    width: "8px",
    height: "8px",
    background: "rgba(255, 200, 100, 0.4)",
    transform: "rotate(45deg)",
    flexShrink: "0",
  });

  const lineRight = document.createElement("div");
  Object.assign(lineRight.style, {
    flex: "1",
    height: "1px",
    background: "linear-gradient(90deg, rgba(247, 214, 160, 0.3), transparent)",
  });

  divider.append(lineLeft, diamond, lineRight);
  return divider;
}

function createSectionHeader(text: string): HTMLDivElement {
  const el = document.createElement("div");
  Object.assign(el.style, {
    fontFamily: SERIF_FONT,
    fontSize: "18px",
    fontWeight: "700",
    letterSpacing: "0.10em",
    textTransform: "uppercase",
    color: "rgba(255, 214, 150, 0.85)",
    textShadow: "0 0 16px rgba(255, 200, 100, 0.15)",
    marginTop: "2px",
    marginBottom: "8px",
    alignSelf: "flex-start",
    width: "100%",
  });
  el.textContent = text;
  return el;
}

function createBodyText(text: string): HTMLDivElement {
  const el = document.createElement("div");
  Object.assign(el.style, {
    fontFamily: SERIF_FONT,
    fontSize: "14px",
    fontWeight: "400",
    lineHeight: "1.5",
    color: "rgba(255, 241, 224, 0.78)",
    letterSpacing: "0.02em",
    marginBottom: "4px",
    alignSelf: "flex-start",
    width: "100%",
  });
  el.textContent = text;
  return el;
}

/* ── Main class ── */

export class HowToPlayOverlay {
  readonly root: HTMLDivElement;

  private visible = false;
  private fadeTimerS = 0;
  private readonly FADE_IN_S = 0.2;

  /** Called when the overlay closes. */
  onClose: (() => void) | null = null;

  constructor(mountEl: HTMLElement) {
    /* ── Root overlay ── */
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "fixed",
      inset: "0",
      background: "rgba(10, 6, 3, 0.72)",
      zIndex: "35",
      display: "none",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      pointerEvents: "none",
      opacity: "0",
      userSelect: "none",
      backdropFilter: "blur(3px)",
    });

    /* ── Panel ── */
    const panel = document.createElement("div");
    Object.assign(panel.style, {
      position: "relative",
      background:
        "linear-gradient(180deg, rgba(44, 24, 10, 0.88), rgba(20, 11, 5, 0.84))",
      border: "1px solid rgba(247, 214, 160, 0.22)",
      borderRadius: "14px",
      padding: "24px 44px 28px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "0",
      boxShadow:
        "0 16px 34px rgba(0, 0, 0, 0.40), inset 0 1px 0 rgba(255, 232, 202, 0.08)",
      maxHeight: "80vh",
      overflowY: "auto",
      width: "560px",
      maxWidth: "90vw",
    });

    /* ── Close button (×) ── */
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "\u00D7";
    Object.assign(closeBtn.style, {
      position: "absolute",
      top: "10px",
      right: "14px",
      border: "none",
      background: "transparent",
      color: "rgba(241, 213, 175, 0.55)",
      fontSize: "24px",
      cursor: "pointer",
      padding: "4px 8px",
      lineHeight: "1",
      zIndex: "1",
    });
    closeBtn.addEventListener("mouseenter", () => {
      closeBtn.style.color = "rgba(255, 241, 224, 0.90)";
    });
    closeBtn.addEventListener("mouseleave", () => {
      closeBtn.style.color = "rgba(241, 213, 175, 0.55)";
    });

    /* ── Title ── */
    const titleEl = document.createElement("div");
    Object.assign(titleEl.style, {
      fontFamily: SERIF_FONT,
      fontSize: "30px",
      fontWeight: "700",
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: "rgba(255, 241, 224, 0.94)",
      textShadow: "0 0 30px rgba(255, 200, 100, 0.3)",
    });
    titleEl.textContent = "HOW TO PLAY";

    /* ── Title divider ── */
    const titleDivider = createOrnamentalDivider("220px");

    /* ══════════════════════════════════════════
     *  SECTION 1: GAMEPLAY
     * ══════════════════════════════════════════ */
    const gameplayHeader = createSectionHeader("Gameplay");
    const gameplayP1 = createBodyText(
      "Survive waves of enemy combatants in the desert bazaar. Each wave sends 10 enemies \u2014 eliminate them all to advance.",
    );
    const gameplayP2 = createBodyText(
      "You\u2019re armed with an AK-47 (30-round magazine). Aim for the head \u2014 headshot kills earn bonus score and contribute to powerful combo rewards.",
    );
    const gameplayP3 = createBodyText(
      "Your kills, headshots, and total score are tracked each run. Compete for Session Best and climb the World Champion leaderboard.",
    );

    const divider1 = createOrnamentalDivider("100%");

    /* ══════════════════════════════════════════
     *  SECTION 2: BUFFS
     * ══════════════════════════════════════════ */
    const buffsHeader = createSectionHeader("Buffs");
    const buffsIntro = createBodyText(
      "Enemies drop glowing orbs on death. Walk over or shoot an orb to collect its buff.",
    );

    const buffTable = this.buildBuffTable();

    const rallyingCryBox = this.buildRallyingCryBox();

    /* ── Assemble ── */
    panel.append(
      closeBtn,
      titleEl,
      titleDivider,
      // Section 1: Gameplay
      gameplayHeader,
      gameplayP1,
      gameplayP2,
      gameplayP3,
      divider1,
      // Section 2: Buffs
      buffsHeader,
      buffsIntro,
      buffTable,
      rallyingCryBox,
    );

    this.root.append(panel);
    mountEl.append(this.root);

    closeBtn.addEventListener("click", () => {
      if (!this.visible) return;
      this.hide();
      this.onClose?.();
    });
  }

  /* ── Buff table builder ── */

  private buildBuffTable(): HTMLDivElement {
    const table = document.createElement("div");
    Object.assign(table.style, {
      width: "100%",
      display: "flex",
      flexDirection: "column",
      marginBottom: "8px",
    });

    // Header row
    const headerRow = document.createElement("div");
    Object.assign(headerRow.style, {
      display: "flex",
      alignItems: "center",
      padding: "6px 0",
      borderBottom: "1px solid rgba(247, 214, 160, 0.18)",
      gap: "12px",
    });

    const headerCells = [
      { text: "", width: "40px" },       // Icon column (no header text)
      { text: "Name", flex: "1" },
      { text: "Duration", width: "60px", align: "center" as const },
      { text: "Effect", flex: "2" },
    ];

    for (const cell of headerCells) {
      const el = document.createElement("div");
      Object.assign(el.style, {
        fontFamily: SANS_FONT,
        fontSize: "11px",
        fontWeight: "700",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "rgba(255, 214, 150, 0.60)",
        ...(cell.width ? { width: cell.width, flexShrink: "0" } : {}),
        ...(cell.flex ? { flex: cell.flex } : {}),
        ...(cell.align ? { textAlign: cell.align } : {}),
      });
      el.textContent = cell.text;
      headerRow.append(el);
    }
    table.append(headerRow);

    // Data rows
    for (const buffType of BUFF_TYPES) {
      const def = BUFF_DEFINITIONS[buffType];
      const row = document.createElement("div");
      Object.assign(row.style, {
        display: "flex",
        alignItems: "center",
        padding: "8px 0",
        borderBottom: "1px solid rgba(247, 214, 160, 0.08)",
        gap: "12px",
      });

      // Icon
      const iconWrap = document.createElement("div");
      Object.assign(iconWrap.style, {
        width: "40px",
        flexShrink: "0",
        display: "flex",
        justifyContent: "center",
      });

      const iconEl = document.createElement("img");
      iconEl.src = def.iconPath;
      iconEl.alt = def.name;
      iconEl.draggable = false;
      Object.assign(iconEl.style, {
        width: "36px",
        height: "36px",
        objectFit: "cover",
        borderRadius: "5px",
        border: `1px solid rgba(${def.vignetteColor}, 0.45)`,
        boxShadow: `0 0 8px rgba(${def.vignetteColor}, 0.20)`,
      });

      // Fallback on image error
      iconEl.onerror = () => {
        iconEl.style.display = "none";
        const fallback = document.createElement("div");
        Object.assign(fallback.style, {
          width: "36px",
          height: "36px",
          borderRadius: "5px",
          background: `linear-gradient(135deg, rgba(${def.vignetteColor}, 0.7), rgba(${def.vignetteColor}, 0.3))`,
          border: `1px solid rgba(${def.vignetteColor}, 0.45)`,
        });
        iconWrap.append(fallback);
      };

      iconWrap.append(iconEl);

      // Name
      const nameEl = document.createElement("div");
      Object.assign(nameEl.style, {
        flex: "1",
        fontFamily: SERIF_FONT,
        fontSize: "14px",
        fontWeight: "600",
        color: "rgba(255, 241, 224, 0.88)",
        letterSpacing: "0.03em",
      });
      nameEl.textContent = def.name;

      // Duration
      const durationEl = document.createElement("div");
      Object.assign(durationEl.style, {
        width: "60px",
        flexShrink: "0",
        fontFamily: SANS_FONT,
        fontSize: "13px",
        fontWeight: "600",
        color: "#ffd78d",
        textAlign: "center",
      });
      durationEl.textContent = `${def.durationS}s`;

      // Effect
      const effectEl = document.createElement("div");
      Object.assign(effectEl.style, {
        flex: "2",
        fontFamily: SERIF_FONT,
        fontSize: "13px",
        fontWeight: "400",
        color: "rgba(255, 241, 224, 0.72)",
        lineHeight: "1.4",
      });
      effectEl.textContent = BUFF_EFFECTS[buffType];

      row.append(iconWrap, nameEl, durationEl, effectEl);
      table.append(row);
    }

    return table;
  }

  /* ── Rallying Cry callout ── */

  private buildRallyingCryBox(): HTMLDivElement {
    const box = document.createElement("div");
    Object.assign(box.style, {
      marginTop: "4px",
      marginBottom: "4px",
      padding: "10px 14px",
      background: "rgba(255, 68, 0, 0.08)",
      border: "1px solid rgba(255, 68, 0, 0.25)",
      borderRadius: "8px",
      display: "flex",
      alignItems: "center",
      gap: "14px",
      width: "100%",
      boxSizing: "border-box",
    });

    // Icon
    const iconEl = document.createElement("img");
    iconEl.src = RALLYING_CRY_ICON_PATH;
    iconEl.alt = RALLYING_CRY_NAME;
    iconEl.draggable = false;
    Object.assign(iconEl.style, {
      width: "40px",
      height: "40px",
      objectFit: "cover",
      borderRadius: "5px",
      border: "1px solid rgba(255, 68, 0, 0.45)",
      boxShadow: "0 0 10px rgba(255, 68, 0, 0.25)",
      flexShrink: "0",
    });

    iconEl.onerror = () => {
      iconEl.style.display = "none";
      const fallback = document.createElement("div");
      Object.assign(fallback.style, {
        width: "40px",
        height: "40px",
        borderRadius: "5px",
        background: "linear-gradient(135deg, rgba(255, 68, 0, 0.7), rgba(255, 68, 0, 0.3))",
        border: "1px solid rgba(255, 68, 0, 0.45)",
        flexShrink: "0",
      });
      box.prepend(fallback);
    };

    // Text block
    const textBlock = document.createElement("div");
    Object.assign(textBlock.style, {
      display: "flex",
      flexDirection: "column",
      gap: "3px",
    });

    const nameEl = document.createElement("div");
    Object.assign(nameEl.style, {
      fontFamily: SERIF_FONT,
      fontSize: "14px",
      fontWeight: "700",
      color: "rgba(255, 180, 100, 0.92)",
      letterSpacing: "0.03em",
    });
    nameEl.textContent = RALLYING_CRY_NAME;

    const descEl = document.createElement("div");
    Object.assign(descEl.style, {
      fontFamily: SERIF_FONT,
      fontSize: "13px",
      fontWeight: "400",
      color: "rgba(255, 241, 224, 0.72)",
      lineHeight: "1.45",
    });
    descEl.textContent =
      "Score 10 headshot kills in a single wave to activate all four buffs simultaneously at the start of the next wave.";

    textBlock.append(nameEl, descEl);
    box.append(iconEl, textBlock);
    return box;
  }

  /* ── Public API ── */

  show(): void {
    if (this.visible) return;
    this.visible = true;
    this.fadeTimerS = 0;
    this.root.style.display = "flex";
    this.root.style.opacity = "0";
    this.root.style.pointerEvents = "auto";
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.root.style.display = "none";
    this.root.style.opacity = "0";
    this.root.style.pointerEvents = "none";
  }

  update(deltaSeconds: number): void {
    if (!this.visible) return;
    this.fadeTimerS = Math.min(this.FADE_IN_S, this.fadeTimerS + deltaSeconds);
    this.root.style.opacity = (this.fadeTimerS / this.FADE_IN_S).toFixed(3);
  }

  isVisible(): boolean {
    return this.visible;
  }

  dispose(): void {
    this.root.remove();
  }
}
