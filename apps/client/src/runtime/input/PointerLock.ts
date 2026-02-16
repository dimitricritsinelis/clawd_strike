type PointerLockControllerOptions = {
  mountEl: HTMLElement;
  lockEl: HTMLElement;
  onLockChange: (locked: boolean) => void;
  onMouseDelta: (deltaX: number, deltaY: number) => void;
};

export class PointerLockController {
  private readonly hintEl: HTMLButtonElement;
  private readonly onPointerDown = (): void => {
    this.requestPointerLock();
  };

  private readonly onHintClick = (): void => {
    this.requestPointerLock();
  };

  private readonly onPointerLockChange = (): void => {
    const locked = document.pointerLockElement === this.options.lockEl;
    this.options.onLockChange(locked);
    this.hintEl.style.display = locked ? "none" : "block";
    if (!locked) {
      this.hintEl.textContent = "Click to lock pointer";
    }
  };

  private readonly onPointerLockError = (): void => {
    this.hintEl.style.display = "block";
    this.hintEl.textContent = "Pointer lock blocked. Click again.";
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (document.pointerLockElement !== this.options.lockEl) return;
    this.options.onMouseDelta(event.movementX, event.movementY);
  };

  constructor(private readonly options: PointerLockControllerOptions) {
    this.hintEl = document.createElement("button");
    this.hintEl.type = "button";
    this.hintEl.textContent = "Click to lock pointer";
    this.hintEl.style.position = "absolute";
    this.hintEl.style.left = "50%";
    this.hintEl.style.top = "16px";
    this.hintEl.style.transform = "translateX(-50%)";
    this.hintEl.style.padding = "6px 10px";
    this.hintEl.style.borderRadius = "8px";
    this.hintEl.style.border = "1px solid rgba(0,0,0,0.28)";
    this.hintEl.style.background = "rgba(255,255,255,0.82)";
    this.hintEl.style.color = "#1e2b33";
    this.hintEl.style.fontSize = "12px";
    this.hintEl.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    this.hintEl.style.letterSpacing = "0.01em";
    this.hintEl.style.cursor = "pointer";
    this.hintEl.style.zIndex = "10";
  }

  init(): void {
    this.options.mountEl.append(this.hintEl);
    this.options.lockEl.addEventListener("pointerdown", this.onPointerDown, { passive: true });
    this.hintEl.addEventListener("click", this.onHintClick);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    document.addEventListener("pointerlockerror", this.onPointerLockError);
    document.addEventListener("mousemove", this.onMouseMove);
    this.onPointerLockChange();
  }

  isLocked(): boolean {
    return document.pointerLockElement === this.options.lockEl;
  }

  dispose(): void {
    this.options.lockEl.removeEventListener("pointerdown", this.onPointerDown);
    this.hintEl.removeEventListener("click", this.onHintClick);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    document.removeEventListener("pointerlockerror", this.onPointerLockError);
    document.removeEventListener("mousemove", this.onMouseMove);
    this.hintEl.remove();
  }

  private requestPointerLock(): void {
    if (document.pointerLockElement === this.options.lockEl) return;
    void this.options.lockEl.requestPointerLock();
  }
}
