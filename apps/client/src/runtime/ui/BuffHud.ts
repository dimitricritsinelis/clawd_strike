import {
  type BuffType,
  BUFF_DEFINITIONS,
  RALLYING_CRY_NAME,
  RALLYING_CRY_ICON_PATH,
} from "../buffs/BuffTypes";

export type BuffHudEntry = {
  type: BuffType;
  remainingS: number;
  durationS: number;
};

export type BuffHudSnapshot = {
  buffs: BuffHudEntry[];
  rallyingCryActive: boolean;
};

type BuffEntryElements = {
  container: HTMLDivElement;
  iconEl: HTMLImageElement;
  fallbackEl: HTMLDivElement;
  timerOverlay: HTMLDivElement;
  timerLabel: HTMLDivElement;
};

const ICON_SIZE = 48;
const FONT_FAMILY = '"Segoe UI", Tahoma, Verdana, sans-serif';

function hexToRgba(colorStr: string, alpha: number): string {
  return `rgba(${colorStr}, ${alpha})`;
}

export class BuffHud {
  private readonly root: HTMLDivElement;
  private readonly entries = new Map<BuffType, BuffEntryElements>();
  private rallyingCryEntry: BuffEntryElements | null = null;
  private visible = true;

  constructor(mountEl: HTMLElement) {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "absolute",
      top: "20px",
      right: "362px",
      zIndex: "23",
      display: "flex",
      flexDirection: "row",
      gap: "8px",
      pointerEvents: "none",
    } satisfies Partial<CSSStyleDeclaration>);
    mountEl.append(this.root);
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    this.root.style.display = visible ? "flex" : "none";
  }

  update(snapshot: BuffHudSnapshot, _deltaSeconds: number): void {
    const activeTypes = new Set(snapshot.buffs.map((b) => b.type));

    // Show/hide Rallying Cry badge
    if (snapshot.rallyingCryActive) {
      if (!this.rallyingCryEntry) {
        this.rallyingCryEntry = this.createEntry(RALLYING_CRY_NAME, RALLYING_CRY_ICON_PATH, "255, 68, 0");
        this.root.prepend(this.rallyingCryEntry.container);
      }
      // Use the shortest buff remaining for the Rallying Cry timer
      const shortest = snapshot.buffs.reduce(
        (min, b) => (b.remainingS < min.remainingS ? b : min),
        snapshot.buffs[0]!,
      );
      this.updateEntry(this.rallyingCryEntry, shortest.remainingS, shortest.durationS);
    } else if (this.rallyingCryEntry) {
      this.rallyingCryEntry.container.remove();
      this.rallyingCryEntry = null;
    }

    // When Rallying Cry is active, hide all individual buff icons
    if (snapshot.rallyingCryActive) {
      for (const [, entry] of this.entries) {
        entry.container.remove();
      }
      this.entries.clear();
    } else {
      // Update individual buff entries
      for (const buff of snapshot.buffs) {
        let entry = this.entries.get(buff.type);
        if (!entry) {
          const def = BUFF_DEFINITIONS[buff.type];
          entry = this.createEntry(def.name, def.iconPath, def.vignetteColor);
          this.entries.set(buff.type, entry);
          this.root.append(entry.container);
        }
        this.updateEntry(entry, buff.remainingS, buff.durationS);
      }

      // Remove entries for expired buffs
      for (const [type, entry] of this.entries) {
        if (!activeTypes.has(type)) {
          entry.container.remove();
          this.entries.delete(type);
        }
      }
    }
  }

  clear(): void {
    for (const [, entry] of this.entries) {
      entry.container.remove();
    }
    this.entries.clear();
    if (this.rallyingCryEntry) {
      this.rallyingCryEntry.container.remove();
      this.rallyingCryEntry = null;
    }
  }

  dispose(): void {
    this.clear();
    this.root.remove();
  }

  private createEntry(name: string, iconPath: string, colorRgb: string): BuffEntryElements {
    const container = document.createElement("div");
    Object.assign(container.style, {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "3px",
    } satisfies Partial<CSSStyleDeclaration>);

    // Icon wrapper
    const iconWrap = document.createElement("div");
    Object.assign(iconWrap.style, {
      position: "relative",
      width: `${ICON_SIZE}px`,
      height: `${ICON_SIZE}px`,
      borderRadius: "6px",
      overflow: "hidden",
      border: `2px solid ${hexToRgba(colorRgb, 0.5)}`,
      boxShadow: `0 0 12px ${hexToRgba(colorRgb, 0.35)}`,
      background: "rgba(6, 10, 16, 0.6)",
    } satisfies Partial<CSSStyleDeclaration>);

    // Actual icon image
    const iconEl = document.createElement("img");
    Object.assign(iconEl.style, {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block",
    } satisfies Partial<CSSStyleDeclaration>);
    iconEl.src = iconPath;
    iconEl.alt = name;
    iconEl.draggable = false;

    // Fallback colored square (shown if image fails to load)
    const fallbackEl = document.createElement("div");
    Object.assign(fallbackEl.style, {
      position: "absolute",
      inset: "0",
      background: `linear-gradient(135deg, ${hexToRgba(colorRgb, 0.7)}, ${hexToRgba(colorRgb, 0.3)})`,
      display: "none",
    } satisfies Partial<CSSStyleDeclaration>);

    iconEl.onerror = () => {
      iconEl.style.display = "none";
      fallbackEl.style.display = "block";
    };

    // Radial timer overlay (conic-gradient)
    const timerOverlay = document.createElement("div");
    Object.assign(timerOverlay.style, {
      position: "absolute",
      inset: "0",
      borderRadius: "4px",
      pointerEvents: "none",
      background: "transparent",
    } satisfies Partial<CSSStyleDeclaration>);

    // Timer seconds label
    const timerLabel = document.createElement("div");
    Object.assign(timerLabel.style, {
      position: "absolute",
      bottom: "2px",
      left: "0",
      right: "0",
      textAlign: "center",
      fontSize: "11px",
      fontWeight: "700",
      color: "#fff",
      textShadow: "0 1px 3px rgba(0, 0, 0, 0.95)",
      fontFamily: FONT_FAMILY,
      lineHeight: "1",
    } satisfies Partial<CSSStyleDeclaration>);

    iconWrap.append(iconEl, fallbackEl, timerOverlay, timerLabel);

    container.append(iconWrap);

    return { container, iconEl, fallbackEl, timerOverlay, timerLabel };
  }

  private updateEntry(entry: BuffEntryElements, remainingS: number, durationS: number): void {
    const elapsed = durationS - remainingS;
    const pct = Math.min(100, (elapsed / durationS) * 100);

    // Conic gradient: transparent for remaining time, dark for elapsed
    entry.timerOverlay.style.background = `conic-gradient(from 0deg, rgba(0, 0, 0, 0.65) ${pct.toFixed(1)}%, transparent ${pct.toFixed(1)}%)`;

    const seconds = Math.ceil(Math.max(0, remainingS));
    entry.timerLabel.textContent = `${seconds}s`;
  }
}
