type KillEntry = {
  el: HTMLDivElement;
  timerS: number;
  fadingOut: boolean;
};

type KillFeedOptions = {
  anchorEl?: HTMLElement;
  gapPx?: number;
};

const KILL_DISPLAY_S = 3.0;
const KILL_FADE_S = 0.4;
const MAX_ENTRIES = 4;
const DEFAULT_FEED_WIDTH_PX = 332;

export class KillFeed {
  readonly root: HTMLDivElement;
  private readonly entries: KillEntry[] = [];
  private readonly freeEls: HTMLDivElement[] = [];
  private readonly gapPx: number;
  private anchorEl: HTMLElement | null;
  private readonly resizeHandler: () => void;

  constructor(mountEl: HTMLElement, options: KillFeedOptions = {}) {
    this.gapPx = options.gapPx ?? 8;
    this.anchorEl = options.anchorEl ?? null;
    this.resizeHandler = () => this.updatePositionFromAnchor();

    this.root = document.createElement("div");
    this.root.style.position = "absolute";
    this.root.style.top = "116px";
    this.root.style.right = "22px";
    this.root.style.zIndex = "24";
    this.root.style.display = "flex";
    this.root.style.flexDirection = "column";
    this.root.style.gap = "8px";
    this.root.style.pointerEvents = "none";
    this.root.style.width = `${DEFAULT_FEED_WIDTH_PX}px`;
    this.root.style.minWidth = `${DEFAULT_FEED_WIDTH_PX}px`;
    this.root.style.alignItems = "stretch";

    mountEl.append(this.root);
    this.updatePositionFromAnchor();
    window.addEventListener("resize", this.resizeHandler);
  }

  setAnchorElement(anchorEl: HTMLElement | null): void {
    this.anchorEl = anchorEl;
    this.updatePositionFromAnchor();
  }

  prewarm(count = 1): void {
    const targetCount = Math.max(0, Math.ceil(count));
    while (this.freeEls.length < targetCount) {
      this.freeEls.push(this.createEntryElement());
    }
  }

  /** @param isHeadshot Pass true to use headshot phrasing and gold tint. */
  addKill(killerName: string, enemyName: string, isHeadshot = false): void {
    this.updatePositionFromAnchor();

    // Trim to MAX_ENTRIES by removing oldest (last visible row).
    if (this.entries.length >= MAX_ENTRIES) {
      const oldest = this.entries.pop();
      if (oldest) {
        this.recycleEntry(oldest);
      }
    }

    const el = this.freeEls.pop() ?? this.createEntryElement();
    el.style.opacity = "1";
    el.style.transform = "translateX(20px)";
    const killer = killerName.toUpperCase();
    const enemy = enemyName.toUpperCase();
    el.style.color = isHeadshot ? "#ffd700" : "rgba(228, 238, 252, 0.92)";
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
        this.recycleEntry(entry);
        const lastIndex = this.entries.length - 1;
        if (i !== lastIndex) {
          this.entries[i] = this.entries[lastIndex]!;
        }
        this.entries.pop();
      }
    }
  }

  clear(): void {
    while (this.entries.length > 0) {
      const entry = this.entries.pop()!;
      this.recycleEntry(entry);
    }
  }

  dispose(): void {
    window.removeEventListener("resize", this.resizeHandler);
    for (const entry of this.entries) {
      entry.el.remove();
    }
    for (const el of this.freeEls) {
      el.remove();
    }
    this.root.remove();
  }

  private createEntryElement(): HTMLDivElement {
    const el = document.createElement("div");
    el.style.padding = "8px 12px 9px";
    el.style.borderRadius = "6px";
    el.style.border = "1px solid rgba(255,255,255,0.08)";
    el.style.background = "rgba(8, 16, 28, 0.68)";
    el.style.boxShadow = "0 6px 16px rgba(0, 0, 0, 0.24)";
    el.style.fontFamily = '"Segoe UI", Tahoma, Verdana, sans-serif';
    el.style.fontSize = "14px";
    el.style.fontWeight = "700";
    el.style.lineHeight = "1.1";
    el.style.letterSpacing = "0.08em";
    el.style.textTransform = "uppercase";
    el.style.textAlign = "center";
    el.style.textShadow = "0 1px 2px rgba(0, 0, 0, 0.9)";
    el.style.whiteSpace = "nowrap";
    el.style.overflow = "hidden";
    el.style.textOverflow = "ellipsis";
    el.style.width = "100%";
    el.style.boxSizing = "border-box";
    el.style.transition = `transform 0.16s ease-out, opacity ${KILL_FADE_S}s ease-out`;
    return el;
  }

  private recycleEntry(entry: KillEntry): void {
    entry.el.remove();
    entry.el.textContent = "";
    entry.el.style.opacity = "0";
    entry.el.style.transform = "translateX(20px)";
    this.freeEls.push(entry.el);
  }

  private updatePositionFromAnchor(): void {
    if (!this.anchorEl) return;

    const anchorTop = this.anchorEl.offsetTop;
    const anchorLeft = this.anchorEl.offsetLeft;
    const anchorHeight = this.anchorEl.offsetHeight;
    const anchorWidth = Math.max(DEFAULT_FEED_WIDTH_PX, this.anchorEl.offsetWidth);
    const top = Math.max(0, anchorTop + anchorHeight + this.gapPx);

    this.root.style.top = `${top}px`;
    this.root.style.left = `${anchorLeft}px`;
    this.root.style.right = "auto";
    this.root.style.width = `${anchorWidth}px`;
    this.root.style.minWidth = `${anchorWidth}px`;
  }
}
