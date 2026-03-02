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

type WebGLContextLike = WebGLRenderingContext | WebGL2RenderingContext;

function tryCreateWebGLContext(canvas: HTMLCanvasElement): WebGLContextLike | null {
  try {
    const attributes: WebGLContextAttributes = {
      alpha: false,
      antialias: true,
      depth: true,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: false,
      desynchronized: true,
    };

    const webgl2 = canvas.getContext("webgl2", attributes) as WebGL2RenderingContext | null;
    if (webgl2) return webgl2;

    const webgl1 = canvas.getContext("webgl", attributes) as WebGLRenderingContext | null;
    if (webgl1) return webgl1;

    const experimental = canvas.getContext("experimental-webgl", attributes) as WebGLRenderingContext | null;
    if (experimental) return experimental;
  } catch {
    // Ignore and treat WebGL as unavailable.
  }
  return null;
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly hasWebGL: boolean;
  private readonly renderer: WebGLRenderer | null;
  private width = 1;
  private height = 1;

  constructor(private readonly mountEl: HTMLElement, options: RendererOptions) {
    const palette = resolveBlockoutPalette(options.highVis);
    const canvas = document.createElement("canvas");
    const context = tryCreateWebGLContext(canvas);

    let renderer: WebGLRenderer | null = null;
    if (context) {
      try {
        renderer = new WebGLRenderer({
          canvas,
          context,
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        });
      } catch {
        renderer = null;
      }
    }

    this.renderer = renderer;
    this.hasWebGL = Boolean(renderer);
    this.canvas = renderer ? renderer.domElement : canvas;
    this.canvas.dataset.testid = "game-canvas";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.display = "block";
    this.canvas.style.touchAction = "none";

    this.mountEl.append(this.canvas);

    if (this.renderer) {
      this.renderer.outputColorSpace = SRGBColorSpace;
      this.renderer.toneMapping = ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.45;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = PCFSoftShadowMap;
      this.renderer.shadowMap.autoUpdate = false;
      this.renderer.info.autoReset = false;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
      this.renderer.setClearColor(
        options.lightingPreset === "golden" ? 0xF9E6C4 : palette.background,
        1,
      );
    }

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
    if (!this.renderer) return 1;
    return this.renderer.getPixelRatio();
  }

  requestShadowUpdate(): void {
    if (!this.renderer) return;
    this.renderer.shadowMap.needsUpdate = true;
  }

  getPerfInfo(): RendererPerfInfo {
    if (!this.renderer) {
      return {
        drawCalls: 0,
        triangles: 0,
        geometries: 0,
        textures: 0,
      };
    }
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
    if (this.renderer) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
      this.renderer.setSize(nextWidth, nextHeight, false);
      return;
    }

    // Headless / no-WebGL fallback: keep a correctly-sized canvas for layout and overlays.
    this.canvas.width = nextWidth;
    this.canvas.height = nextHeight;
  }

  render(scene: Scene, camera: PerspectiveCamera): void {
    if (!this.renderer) return;
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
    if (!this.renderer) return;
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
    this.renderer?.dispose();
  }
}
