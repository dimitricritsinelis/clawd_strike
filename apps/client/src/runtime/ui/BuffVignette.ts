import {
  type BuffType,
  BUFF_DEFINITIONS,
  BUFF_TYPES,
  RALLYING_CRY_VIGNETTE_COLOR,
} from "../buffs/BuffTypes";

const STEADY_OPACITY = 0.15;
const FLASH_OPACITY = 0.35;
const FLASH_DECAY_RATE = 2.5; // per second
const PULSE_FREQUENCY = 0.5; // Hz — gentle pulse
const PULSE_AMPLITUDE = 0.04;
const FADE_OUT_RATE = 3.0; // per second

type VignetteLayer = {
  element: HTMLDivElement;
  targetOpacity: number;
  currentOpacity: number;
  flashTimer: number;
  active: boolean;
};

export class BuffVignette {
  private readonly layers = new Map<BuffType, VignetteLayer>();
  private rallyingCryLayer: VignetteLayer | null = null;
  private rallyingCryActive = false;
  private elapsedS = 0;

  constructor(mountEl: HTMLElement) {
    for (const type of BUFF_TYPES) {
      const def = BUFF_DEFINITIONS[type];
      const layer = this.createLayer(mountEl, def.vignetteColor);
      this.layers.set(type, layer);
    }
  }

  activate(type: BuffType): void {
    const layer = this.layers.get(type);
    if (!layer) return;
    layer.active = true;
    layer.flashTimer = FLASH_OPACITY;
    layer.targetOpacity = STEADY_OPACITY;
  }

  deactivate(type: BuffType): void {
    const layer = this.layers.get(type);
    if (!layer) return;
    layer.active = false;
    layer.targetOpacity = 0;
  }

  setRallyingCry(active: boolean, mountEl: HTMLElement): void {
    if (active && !this.rallyingCryActive) {
      this.rallyingCryActive = true;
      if (!this.rallyingCryLayer) {
        this.rallyingCryLayer = this.createLayer(mountEl, RALLYING_CRY_VIGNETTE_COLOR);
      }
      this.rallyingCryLayer.active = true;
      this.rallyingCryLayer.flashTimer = FLASH_OPACITY;
      this.rallyingCryLayer.targetOpacity = STEADY_OPACITY;
    } else if (!active && this.rallyingCryActive) {
      this.rallyingCryActive = false;
      if (this.rallyingCryLayer) {
        this.rallyingCryLayer.active = false;
        this.rallyingCryLayer.targetOpacity = 0;
      }
    }
  }

  update(deltaSeconds: number): void {
    this.elapsedS += deltaSeconds;

    for (const layer of this.layers.values()) {
      this.updateLayer(layer, deltaSeconds);
    }
    if (this.rallyingCryLayer) {
      this.updateLayer(this.rallyingCryLayer, deltaSeconds);
    }
  }

  clear(): void {
    for (const layer of this.layers.values()) {
      layer.active = false;
      layer.targetOpacity = 0;
      layer.currentOpacity = 0;
      layer.flashTimer = 0;
      layer.element.style.opacity = "0";
    }
    if (this.rallyingCryLayer) {
      this.rallyingCryLayer.active = false;
      this.rallyingCryLayer.targetOpacity = 0;
      this.rallyingCryLayer.currentOpacity = 0;
      this.rallyingCryLayer.flashTimer = 0;
      this.rallyingCryLayer.element.style.opacity = "0";
    }
    this.rallyingCryActive = false;
  }

  dispose(): void {
    for (const layer of this.layers.values()) {
      layer.element.remove();
    }
    this.layers.clear();
    if (this.rallyingCryLayer) {
      this.rallyingCryLayer.element.remove();
      this.rallyingCryLayer = null;
    }
  }

  private createLayer(mountEl: HTMLElement, colorRgb: string): VignetteLayer {
    const element = document.createElement("div");
    Object.assign(element.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      zIndex: "26",
      opacity: "0",
      background: `radial-gradient(ellipse at center, transparent 45%, rgba(${colorRgb}, 0.25) 100%)`,
      transition: "none",
    } satisfies Partial<CSSStyleDeclaration>);
    mountEl.append(element);

    return {
      element,
      targetOpacity: 0,
      currentOpacity: 0,
      flashTimer: 0,
      active: false,
    };
  }

  private updateLayer(layer: VignetteLayer, deltaSeconds: number): void {
    if (layer.flashTimer > 0) {
      // Flash decay
      layer.flashTimer = Math.max(0, layer.flashTimer - FLASH_DECAY_RATE * deltaSeconds);
      layer.currentOpacity = layer.targetOpacity + layer.flashTimer;
    } else if (layer.active) {
      // Gentle pulse
      const pulse = PULSE_AMPLITUDE * Math.sin(this.elapsedS * Math.PI * 2 * PULSE_FREQUENCY);
      layer.currentOpacity = layer.targetOpacity + pulse;
    } else {
      // Fade out
      layer.currentOpacity = Math.max(0, layer.currentOpacity - FADE_OUT_RATE * deltaSeconds);
    }

    const clamped = Math.max(0, Math.min(1, layer.currentOpacity));
    layer.element.style.opacity = clamped.toFixed(3);
  }
}
