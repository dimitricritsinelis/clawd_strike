import {
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { resolveBlockoutPalette } from "./BlockoutMaterials";
import type { RuntimeLightingPreset } from "../utils/UrlParams";

const MAX_PIXEL_RATIO = 2;

type RendererOptions = {
  highVis: boolean;
  lightingPreset: RuntimeLightingPreset;
};

export type RendererPerfInfo = {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
};

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private width = 1;
  private height = 1;

  constructor(private readonly mountEl: HTMLElement, options: RendererOptions) {
    const palette = resolveBlockoutPalette(options.highVis);
    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.45;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.info.autoReset = false;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.renderer.setClearColor(
      options.lightingPreset === "golden" ? 0xF9E6C4 : palette.background,
      1,
    );

    this.canvas = this.renderer.domElement;
    this.canvas.dataset.testid = "game-canvas";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.display = "block";
    this.canvas.style.touchAction = "none";

    this.mountEl.append(this.canvas);
    this.resize();
  }

  getAspect(): number {
    return this.width / this.height;
  }

  getWidth(): number {
    return this.width;
  }

  getHeight(): number {
    return this.height;
  }

  getPixelRatioCap(): number {
    return MAX_PIXEL_RATIO;
  }

  getCurrentPixelRatio(): number {
    return this.renderer.getPixelRatio();
  }

  getPerfInfo(): RendererPerfInfo {
    return {
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
    };
  }

  resize(): void {
    const nextWidth = Math.max(1, this.mountEl.clientWidth || window.innerWidth);
    const nextHeight = Math.max(1, this.mountEl.clientHeight || window.innerHeight);

    this.width = nextWidth;
    this.height = nextHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.renderer.setSize(nextWidth, nextHeight, false);
  }

  render(scene: Scene, camera: PerspectiveCamera): void {
    this.renderer.info.reset();
    this.renderer.render(scene, camera);
  }

  renderWithViewModel(
    worldScene: Scene,
    worldCamera: PerspectiveCamera,
    viewModelScene: Scene | null,
    viewModelCamera: PerspectiveCamera | null,
    renderViewModel: boolean,
  ): void {
    this.renderer.info.reset();
    this.renderer.render(worldScene, worldCamera);
    if (!renderViewModel || !viewModelScene || !viewModelCamera) return;

    const prevAutoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(viewModelScene, viewModelCamera);
    this.renderer.autoClear = prevAutoClear;
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
