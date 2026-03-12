const DEFAULT_INNER_CLEAR_STOP_PCT = 42;
const DEFAULT_SHOULDER_STOP_PCT = 74;

function clampAlpha(value: number): number {
  return Math.max(0, Math.min(1, value));
}

type EdgeVignetteBackgroundOptions = {
  colorRgb: string;
  midAlpha: number;
  outerAlpha: number;
  innerClearStopPct?: number;
  shoulderStopPct?: number;
};

type EdgeVignetteLayerOptions = EdgeVignetteBackgroundOptions & {
  zIndex: number;
};

export function buildEdgeVignetteBackground({
  colorRgb,
  midAlpha,
  outerAlpha,
  innerClearStopPct = DEFAULT_INNER_CLEAR_STOP_PCT,
  shoulderStopPct = DEFAULT_SHOULDER_STOP_PCT,
}: EdgeVignetteBackgroundOptions): string {
  return `radial-gradient(ellipse at center, rgba(${colorRgb}, 0) 0%, rgba(${colorRgb}, 0) ${innerClearStopPct}%, rgba(${colorRgb}, ${clampAlpha(midAlpha).toFixed(3)}) ${shoulderStopPct}%, rgba(${colorRgb}, ${clampAlpha(outerAlpha).toFixed(3)}) 100%)`;
}

export function createEdgeVignetteLayer({
  colorRgb,
  midAlpha,
  outerAlpha,
  zIndex,
}: EdgeVignetteLayerOptions): HTMLDivElement {
  const layer = document.createElement("div");
  Object.assign(layer.style, {
    position: "absolute",
    inset: "0",
    pointerEvents: "none",
    zIndex: String(zIndex),
    opacity: "0",
    background: buildEdgeVignetteBackground({ colorRgb, midAlpha, outerAlpha }),
    transformOrigin: "50% 50%",
    willChange: "opacity, transform",
  } satisfies Partial<CSSStyleDeclaration>);
  return layer;
}

export function setEdgeVignetteColor(
  layer: HTMLDivElement,
  colorRgb: string,
  midAlpha: number,
  outerAlpha: number,
  innerClearStopPct?: number,
  shoulderStopPct?: number,
): void {
  const backgroundOptions: EdgeVignetteBackgroundOptions = {
    colorRgb,
    midAlpha,
    outerAlpha,
  };
  if (typeof innerClearStopPct === "number") {
    backgroundOptions.innerClearStopPct = innerClearStopPct;
  }
  if (typeof shoulderStopPct === "number") {
    backgroundOptions.shoulderStopPct = shoulderStopPct;
  }
  layer.style.background = buildEdgeVignetteBackground(backgroundOptions);
}
