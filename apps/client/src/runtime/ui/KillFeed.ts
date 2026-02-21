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
    this.root.style.top = "86px";
    this.root.style.right = "22px";
    this.root.style.zIndex = "24";
    this.root.style.display = "flex";
    this.root.style.flexDirection = "column-reverse";
    this.root.style.gap = "6px";
    this.root.style.pointerEvents = "none";
    this.root.style.minWidth = "180px";

    mountEl.append(this.root);
  }

  /** @param isHeadshot Pass true to use headshot phrasing and gold tint. */
  addKill(killerName: string, enemyName: string, isHeadshot = false): void {
    // Trim to MAX_ENTRIES by removing oldest
    if (this.entries.length >= MAX_ENTRIES) {
      const oldest = this.entries.shift();
      if (oldest) {
        oldest.el.remove();
      }
    }

    const el = document.createElement("div");
    el.style.padding = "6px 10px";
    el.style.borderRadius = "8px";
    el.style.border = "1px solid rgba(230, 238, 248, 0.2)";
    el.style.background = "rgba(6, 10, 16, 0.56)";
    el.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.28)";
    el.style.backdropFilter = "blur(1.5px)";
    el.style.color = isHeadshot ? "#ffe84e" : "#e8f0fa";
    el.style.fontFamily = '"Segoe UI", Tahoma, Verdana, sans-serif';
    el.style.fontSize = "13px";
    el.style.fontWeight = "600";
    el.style.letterSpacing = "0.01em";
    el.style.opacity = "1";
    // Slide-in from right + fade-out transition
    el.style.transform = "translateX(220px)";
    el.style.transition = `transform 0.18s cubic-bezier(0.34,1.56,0.64,1), opacity ${KILL_FADE_S}s ease-out`;
    el.textContent = isHeadshot
      ? `${killerName} headshot ${enemyName}`
      : `${killerName} killed ${enemyName}`;

    this.root.append(el);

    // Trigger slide-in on next paint
    requestAnimationFrame(() => {
      el.style.transform = "translateX(0)";
    });

    this.entries.push({ el, timerS: KILL_DISPLAY_S, fadingOut: false });
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
