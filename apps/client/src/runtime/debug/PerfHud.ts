export type PerfHudSnapshot = {
  fps: number;
  msPerFrame: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  materials: number;
  instancedMeshes: number;
  instancedInstances: number;
  dpr: number;
  dprCap: number;
  debugEnabled: boolean;
};

const DRAW_CALL_WARNING_THRESHOLD = 140;

function formatLarge(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return `${value}`;
}

export class PerfHud {
  private readonly root: HTMLDivElement;
  private visible: boolean;

  constructor(mountEl: HTMLElement, visible: boolean) {
    this.visible = visible;

    this.root = document.createElement("div");
    this.root.style.position = "absolute";
    this.root.style.right = "10px";
    this.root.style.top = "10px";
    this.root.style.padding = "8px 10px";
    this.root.style.borderRadius = "8px";
    this.root.style.background = "rgba(12, 20, 26, 0.78)";
    this.root.style.color = "#d8f0ff";
    this.root.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    this.root.style.fontSize = "12px";
    this.root.style.lineHeight = "1.35";
    this.root.style.whiteSpace = "pre";
    this.root.style.pointerEvents = "none";
    this.root.style.zIndex = "13";
    this.root.style.display = visible ? "block" : "none";
    mountEl.append(this.root);
  }

  isVisible(): boolean {
    return this.visible;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.root.style.display = visible ? "block" : "none";
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  update(snapshot: PerfHudSnapshot): void {
    if (!this.visible) return;

    const lines = [
      `perf: ${snapshot.fps.toFixed(1)} fps | ${snapshot.msPerFrame.toFixed(2)} ms`,
      `draws: ${snapshot.drawCalls}  tris: ${formatLarge(snapshot.triangles)}`,
      `geo/tex/mat: ${snapshot.geometries}/${snapshot.textures}/${snapshot.materials}`,
      `instanced meshes: ${snapshot.instancedMeshes}  instances: ${snapshot.instancedInstances}`,
      `dpr: ${snapshot.dpr.toFixed(2)} (cap ${snapshot.dprCap.toFixed(2)})`,
    ];

    if (!snapshot.debugEnabled && snapshot.drawCalls > DRAW_CALL_WARNING_THRESHOLD) {
      lines.push(`warning: draw calls > ${DRAW_CALL_WARNING_THRESHOLD}`);
    }

    this.root.textContent = lines.join("\n");
  }

  dispose(): void {
    this.root.remove();
  }
}
