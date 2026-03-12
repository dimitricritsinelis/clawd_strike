import {
  type BuffType,
  BUFF_DEFINITIONS,
  RALLYING_CRY_VIGNETTE_COLOR,
} from "../buffs/BuffTypes";
import { createEdgeVignetteLayer, setEdgeVignetteColor } from "./EdgeVignette";

const BASE_LAYER_MID_ALPHA = 0.18;
const BASE_LAYER_OUTER_ALPHA = 0.84;
const INNER_CLEAR_STOP_PCT = 35;
const SHOULDER_STOP_PCT = 69;
const PICKUP_FLASH_DURATION_S = 0.26;
const PULSE_FREQUENCY_HZ = 0.92;
const FADE_IN_RATE = 11.5;
const FADE_OUT_RATE = 5.0;
const BASE_LAYER_OPACITY = 0.19;
const PULSE_LAYER_MIN_OPACITY = 0.055;
const PULSE_LAYER_RANGE = 0.15;
const FLASH_LAYER_OPACITY = 0.22;
const PULSE_SCALE_RANGE = 0.026;
const FLASH_SCALE_RANGE = 0.028;

export type BuffVignetteDebugState = {
  dominantBuff: BuffType | null;
  colorRgb: string | null;
  activeBuffCount: number;
  visibility: number;
  baseOpacity: number;
  pulseOpacity: number;
  flashOpacity: number;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function easeInOut(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

function easeOutQuad(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped;
}

export class BuffVignette {
  private readonly root: HTMLDivElement;
  private readonly baseLayer: HTMLDivElement;
  private readonly pulseLayer: HTMLDivElement;
  private readonly flashLayer: HTMLDivElement;
  private readonly activeBuffs = new Set<BuffType>();
  private promotionOrder: BuffType[] = [];
  private dominantBuff: BuffType | null = null;
  private rallyingCryActive = false;
  private elapsedS = 0;
  private visibility = 0;
  private flashTimerS = 0;
  private currentColorRgb = RALLYING_CRY_VIGNETTE_COLOR;
  private lastBaseOpacity = 0;
  private lastPulseOpacity = 0;
  private lastFlashOpacity = 0;

  constructor(mountEl: HTMLElement) {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "absolute",
      inset: "0",
      overflow: "hidden",
      pointerEvents: "none",
      zIndex: "26",
      opacity: "0",
    } satisfies Partial<CSSStyleDeclaration>);

    this.baseLayer = createEdgeVignetteLayer({
      colorRgb: this.currentColorRgb,
      midAlpha: BASE_LAYER_MID_ALPHA,
      outerAlpha: BASE_LAYER_OUTER_ALPHA,
      innerClearStopPct: INNER_CLEAR_STOP_PCT,
      shoulderStopPct: SHOULDER_STOP_PCT,
      zIndex: 0,
    });
    this.pulseLayer = createEdgeVignetteLayer({
      colorRgb: this.currentColorRgb,
      midAlpha: BASE_LAYER_MID_ALPHA,
      outerAlpha: BASE_LAYER_OUTER_ALPHA,
      innerClearStopPct: INNER_CLEAR_STOP_PCT,
      shoulderStopPct: SHOULDER_STOP_PCT,
      zIndex: 0,
    });
    this.flashLayer = createEdgeVignetteLayer({
      colorRgb: this.currentColorRgb,
      midAlpha: BASE_LAYER_MID_ALPHA,
      outerAlpha: BASE_LAYER_OUTER_ALPHA,
      innerClearStopPct: INNER_CLEAR_STOP_PCT,
      shoulderStopPct: SHOULDER_STOP_PCT,
      zIndex: 0,
    });

    this.root.append(this.baseLayer, this.pulseLayer, this.flashLayer);
    mountEl.append(this.root);
    this.applyColorToLayers(this.currentColorRgb);
  }

  activate(type: BuffType): void {
    this.activeBuffs.add(type);
    this.promote(type);
    this.triggerFlash();
    this.syncVisualColor();
  }

  refresh(type: BuffType): void {
    this.activeBuffs.add(type);
    this.promote(type);
    this.triggerFlash();
    this.syncVisualColor();
  }

  deactivate(type: BuffType): void {
    if (!this.activeBuffs.delete(type)) {
      return;
    }
    this.promotionOrder = this.promotionOrder.filter((entry) => entry !== type);
    this.dominantBuff = this.promotionOrder.length > 0
      ? this.promotionOrder[this.promotionOrder.length - 1]!
      : null;
    this.syncVisualColor();
  }

  setRallyingCry(active: boolean): void {
    if (this.rallyingCryActive === active) {
      return;
    }
    this.rallyingCryActive = active;
    if (active) {
      this.triggerFlash();
    }
    this.syncVisualColor();
  }

  update(deltaSeconds: number): void {
    this.elapsedS += deltaSeconds;
    this.flashTimerS = Math.max(0, this.flashTimerS - deltaSeconds);
    const targetVisibility = this.shouldRender() ? 1 : 0;
    const fadeRate = targetVisibility > this.visibility ? FADE_IN_RATE : FADE_OUT_RATE;
    this.visibility = this.moveToward(this.visibility, targetVisibility, fadeRate * deltaSeconds);
    this.render();
  }

  clear(): void {
    this.activeBuffs.clear();
    this.promotionOrder = [];
    this.dominantBuff = null;
    this.rallyingCryActive = false;
    this.elapsedS = 0;
    this.visibility = 0;
    this.flashTimerS = 0;
    this.render(true);
  }

  getDebugState(): BuffVignetteDebugState {
    return {
      dominantBuff: this.dominantBuff,
      colorRgb: this.shouldRender() ? this.currentColorRgb : null,
      activeBuffCount: this.activeBuffs.size,
      visibility: this.visibility,
      baseOpacity: this.lastBaseOpacity,
      pulseOpacity: this.lastPulseOpacity,
      flashOpacity: this.lastFlashOpacity,
    };
  }

  dispose(): void {
    this.root.remove();
  }

  private promote(type: BuffType): void {
    this.promotionOrder = this.promotionOrder.filter((entry) => entry !== type);
    this.promotionOrder.push(type);
    this.dominantBuff = type;
  }

  private triggerFlash(): void {
    this.flashTimerS = PICKUP_FLASH_DURATION_S;
    this.visibility = Math.max(this.visibility, 0.82);
  }

  private shouldRender(): boolean {
    return this.rallyingCryActive || this.dominantBuff !== null;
  }

  private syncVisualColor(): void {
    const nextColor = this.resolveColorRgb();
    if (!nextColor || nextColor === this.currentColorRgb) {
      return;
    }
    this.currentColorRgb = nextColor;
    this.applyColorToLayers(nextColor);
  }

  private resolveColorRgb(): string | null {
    if (this.rallyingCryActive) {
      return RALLYING_CRY_VIGNETTE_COLOR;
    }
    if (!this.dominantBuff) {
      return null;
    }
    return BUFF_DEFINITIONS[this.dominantBuff].vignetteColor;
  }

  private render(forceHidden = false): void {
    if (forceHidden || this.visibility <= 0.001) {
      this.lastBaseOpacity = 0;
      this.lastPulseOpacity = 0;
      this.lastFlashOpacity = 0;
      this.root.style.opacity = "0";
      this.baseLayer.style.opacity = "0";
      this.pulseLayer.style.opacity = "0";
      this.flashLayer.style.opacity = "0";
      this.baseLayer.style.transform = "scale(1)";
      this.pulseLayer.style.transform = "scale(1)";
      this.flashLayer.style.transform = "scale(1)";
      return;
    }

    const pulse = this.computePulse();
    const flashStrength = this.flashTimerS > 0
      ? easeOutQuad(this.flashTimerS / PICKUP_FLASH_DURATION_S)
      : 0;
    const baseOpacity = clamp01(this.visibility * BASE_LAYER_OPACITY);
    const pulseOpacity = clamp01(
      this.visibility * (PULSE_LAYER_MIN_OPACITY + pulse * PULSE_LAYER_RANGE),
    );
    const flashOpacity = clamp01(this.visibility * flashStrength * FLASH_LAYER_OPACITY);

    this.lastBaseOpacity = baseOpacity;
    this.lastPulseOpacity = pulseOpacity;
    this.lastFlashOpacity = flashOpacity;

    this.root.style.opacity = "1";
    this.baseLayer.style.opacity = baseOpacity.toFixed(3);
    this.pulseLayer.style.opacity = pulseOpacity.toFixed(3);
    this.flashLayer.style.opacity = flashOpacity.toFixed(3);
    this.baseLayer.style.transform = "scale(1)";
    this.pulseLayer.style.transform = `scale(${(1 + pulse * PULSE_SCALE_RANGE).toFixed(3)})`;
    this.flashLayer.style.transform = `scale(${(1 + flashStrength * FLASH_SCALE_RANGE).toFixed(3)})`;
  }

  private applyColorToLayers(colorRgb: string): void {
    setEdgeVignetteColor(
      this.baseLayer,
      colorRgb,
      BASE_LAYER_MID_ALPHA,
      BASE_LAYER_OUTER_ALPHA,
      INNER_CLEAR_STOP_PCT,
      SHOULDER_STOP_PCT,
    );
    setEdgeVignetteColor(
      this.pulseLayer,
      colorRgb,
      BASE_LAYER_MID_ALPHA,
      BASE_LAYER_OUTER_ALPHA,
      INNER_CLEAR_STOP_PCT,
      SHOULDER_STOP_PCT,
    );
    setEdgeVignetteColor(
      this.flashLayer,
      colorRgb,
      BASE_LAYER_MID_ALPHA,
      BASE_LAYER_OUTER_ALPHA,
      INNER_CLEAR_STOP_PCT,
      SHOULDER_STOP_PCT,
    );
  }

  private moveToward(current: number, target: number, maxStep: number): number {
    if (Math.abs(target - current) <= maxStep) {
      return target;
    }
    return current + Math.sign(target - current) * maxStep;
  }

  private computePulse(): number {
    const wave = 0.5 - 0.5 * Math.cos(this.elapsedS * Math.PI * 2 * PULSE_FREQUENCY_HZ);
    return easeInOut(wave);
  }
}
