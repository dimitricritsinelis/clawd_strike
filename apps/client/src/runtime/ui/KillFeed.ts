type KillEntry = {
  el: HTMLDivElement;
  timerS: number;
  fadingOut: boolean;
};

const KILL_DISPLAY_S = 3.0;
const KILL_FADE_S = 0.4;
const MAX_ENTRIES = 4;

export class KillFeed {
  private readonly root: HTMLDivElement;
  private readonly entries: KillEntry[] = [];

  constructor(mountEl: HTMLElement) {
    this.root = document.createElement("div");
    this.root.style.position = "absolute";
    // Share the same top-right anchor as ScoreHud so the two HUDs align cleanly.
    this.root.style.top = "116px";
    this.root.style.right = "22px";
    this.root.style.zIndex = "24";
    this.root.style.display = "flex";
    this.root.style.flexDirection = "column";
    this.root.style.gap = "8px";
    this.root.style.pointerEvents = "none";
    this.root.style.width = "300px";
    this.root.style.minWidth = "300px";
    this.root.style.alignItems = "stretch";

    mountEl.append(this.root);
  }

  /** @param isHeadshot Pass true to use headshot phrasing and gold tint. */
  addKill(killerName: string, enemyName: string, isHeadshot = false): void {
    // Trim to MAX_ENTRIES by removing oldest (last visible row).
    if (this.entries.length >= MAX_ENTRIES) {
      const oldest = this.entries.pop();
      if (oldest) {
        oldest.el.remove();
      }
    }

    const el = document.createElement("div");
    el.style.padding = "8px 12px 9px";
    el.style.borderRadius = "6px";
    el.style.border = "1px solid rgba(255,255,255,0.08)";
    el.style.background = "rgba(8, 16, 28, 0.68)";
    el.style.boxShadow = "0 6px 16px rgba(0, 0, 0, 0.24)";
    el.style.color = isHeadshot ? "#ffd700" : "rgba(228, 238, 252, 0.92)";
    el.style.fontFamily = '"Segoe UI", Tahoma, Verdana, sans-serif';
    el.style.fontSize = "14px";
    el.style.fontWeight = "700";
    el.style.lineHeight = "1.1";
    el.style.letterSpacing = "0.08em";
    el.style.textTransform = "uppercase";
    el.style.textAlign = "center";
    el.style.textShadow = "0 1px 2px rgba(0, 0, 0, 0.9)";
    el.style.whiteSpace = "nowrap";
    el.style.width = "100%";
    el.style.boxSizing = "border-box";
    el.style.opacity = "1";
    // Slide-in from right + fade-out transition.
    el.style.transform = "translateX(20px)";
    el.style.transition = `transform 0.16s ease-out, opacity ${KILL_FADE_S}s ease-out`;
    const killer = killerName.toUpperCase();
    const enemy = enemyName.toUpperCase();
    el.textContent = isHeadshot
      ? `${killer} HEADSHOT ${enemy}`
      : `${killer} KILLED ${enemy}`;

    this.root.prepend(el);

    // Trigger slide-in on next paint
    requestAnimationFrame(() => {
      el.style.transform = "translateX(0)";
    });

    this.entries.unshift({ el, timerS: KILL_DISPLAY_S, fadingOut: false });
  }

  update(deltaSeconds: number): void {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i]!;
      entry.timerS -= deltaSeconds;

      if (!entry.fadingOut && entry.timerS <= KILL_FADE_S) {
        entry.fadingOut = true;
        entry.el.style.opacity = "0";
      }

      if (entry.timerS <= 0) {
        entry.el.remove();
        this.entries.splice(i, 1);
      }
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
