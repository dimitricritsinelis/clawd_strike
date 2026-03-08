type PointerLockControllerOptions = {
  lockEl: HTMLElement;
  onLockChange: (locked: boolean) => void;
  onMouseDelta: (deltaX: number, deltaY: number) => void;
};

export class PointerLockController {
  private softLocked = false;

  private readonly onPointerDown = (): void => {
    if (this.isLocked()) return;
    this.softLocked = true;
    this.options.onLockChange(true);
    this.requestPointerLock();
  };

  private readonly onPointerLockChange = (): void => {
    const locked = document.pointerLockElement === this.options.lockEl;
    this.softLocked = false;
    this.options.onLockChange(locked);
  };

  private readonly onPointerLockError = (): void => {
    this.options.onLockChange(this.isLocked());
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.isLocked()) return;
    this.options.onMouseDelta(event.movementX, event.movementY);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== "Escape") return;
    if (!this.softLocked) return;
    if (document.pointerLockElement === this.options.lockEl) return;
    this.releaseSoftLock();
  };

  private readonly onWindowBlur = (): void => {
    this.releaseSoftLock();
  };

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === "visible") return;
    this.releaseSoftLock();
  };

  constructor(private readonly options: PointerLockControllerOptions) {}

  init(): void {
    this.options.lockEl.addEventListener("pointerdown", this.onPointerDown, { passive: true });
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    document.addEventListener("pointerlockerror", this.onPointerLockError);
    document.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("blur", this.onWindowBlur);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  isLocked(): boolean {
    return document.pointerLockElement === this.options.lockEl || this.softLocked;
  }

  dispose(): void {
    this.options.lockEl.removeEventListener("pointerdown", this.onPointerDown);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    document.removeEventListener("pointerlockerror", this.onPointerLockError);
    document.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("blur", this.onWindowBlur);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
  }

  private requestPointerLock(): void {
    if (document.pointerLockElement === this.options.lockEl) return;
    try {
      const result = this.options.lockEl.requestPointerLock();
      if (result && typeof (result as Promise<void>).catch === "function") {
        void (result as Promise<void>).catch(() => {
          this.onPointerLockError();
        });
      }
    } catch {
      this.onPointerLockError();
    }
  }

  private releaseSoftLock(): void {
    if (!this.softLocked) return;
    this.softLocked = false;
    this.options.onLockChange(false);
  }
}
