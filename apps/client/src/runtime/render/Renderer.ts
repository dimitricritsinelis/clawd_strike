import {
  ACESFilmicToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";
import { resolveBlockoutPalette } from "./BlockoutMaterials";
import type { RuntimeLightingPreset } from "../utils/UrlParams";

const MAX_PIXEL_RATIO = 1.10;

// ── SSAO tuning constants ───────────────────────────────────────────
const SSAO_KERNEL_RADIUS = 2;
const SSAO_MIN_DISTANCE = 0.001;
const SSAO_MAX_DISTANCE = 0.04;

type RendererOptions = {
  highVis: boolean;
  lightingPreset: RuntimeLightingPreset;
  ao: boolean;
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
    // Skip hardware MSAA when the native DPR is high enough that supersampling
    // already suppresses aliasing.  Saves significant fill cost on high-DPI panels.
    const needsAA = (window.devicePixelRatio || 1) < 1.5;
    const attributes: WebGLContextAttributes = {
      alpha: false,
      antialias: needsAA,
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
  private composer: EffectComposer | null = null;
  private worldPass: RenderPass | null = null;
  private ssaoPass: SSAOPass | null = null;
  private width = 1;
  private height = 1;

  constructor(private readonly mountEl: HTMLElement, options: RendererOptions) {
    const palette = resolveBlockoutPalette(options.highVis);
    const canvas = document.createElement("canvas");
    const context = tryCreateWebGLContext(canvas);

    let renderer: WebGLRenderer | null = null;
    if (context) {
      try {
        const needsAA = (window.devicePixelRatio || 1) < 1.5;
        renderer = new WebGLRenderer({
          canvas,
          context,
          antialias: needsAA,
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
      this.renderer.toneMappingExposure = 1.50;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = PCFShadowMap;
      this.renderer.shadowMap.autoUpdate = false;
      this.renderer.shadowMap.needsUpdate = true;
      this.renderer.info.autoReset = false;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
      this.renderer.setClearColor(
        options.lightingPreset === "golden" ? 0xEADBC8 : palette.background,
        1,
      );
    }

    this.resize();

    // ── SSAO composer (world-only; viewmodel is rendered directly after) ──
    if (this.renderer && options.ao && options.lightingPreset === "golden") {
      const dpr = this.renderer.getPixelRatio();
      this.composer = new EffectComposer(this.renderer);
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(this.width, this.height);

      // Placeholder scene/camera — swapped each frame before render
      this.worldPass = new RenderPass(new Scene(), new PerspectiveCamera());
      this.composer.addPass(this.worldPass);

      const halfW = Math.max(1, Math.floor(this.width / 2));
      const halfH = Math.max(1, Math.floor(this.height / 2));
      this.ssaoPass = new SSAOPass(new Scene(), new PerspectiveCamera(), halfW, halfH);
      this.ssaoPass.kernelRadius = SSAO_KERNEL_RADIUS;
      this.ssaoPass.minDistance = SSAO_MIN_DISTANCE;
      this.ssaoPass.maxDistance = SSAO_MAX_DISTANCE;
      this.composer.addPass(this.ssaoPass);

      // OutputPass applies tone mapping + sRGB conversion (required since Three.js r154+)
      this.composer.addPass(new OutputPass());
    }
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
      this.composer?.setSize(nextWidth, nextHeight);
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

    if (this.composer && this.worldPass && this.ssaoPass) {
      // Swap scene/camera into the passes for this frame
      this.worldPass.scene = worldScene;
      this.worldPass.camera = worldCamera;
      this.ssaoPass.scene = worldScene;
      this.ssaoPass.camera = worldCamera;
      this.composer.render();
    } else {
      this.renderer.render(worldScene, worldCamera);
    }

    if (!renderViewModel || !viewModelScene || !viewModelCamera) return;

    // Viewmodel rendered directly — no SSAO applied to weapon
    const prevAutoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(viewModelScene, viewModelCamera);
    this.renderer.autoClear = prevAutoClear;
  }

  async compileSceneAsync(
    worldScene: Scene,
    worldCamera: PerspectiveCamera,
    viewModelScene: Scene | null,
    viewModelCamera: PerspectiveCamera | null,
    renderViewModel: boolean,
  ): Promise<void> {
    if (!this.renderer) return;

    await this.renderer.compileAsync(worldScene, worldCamera);
    if (renderViewModel && viewModelScene && viewModelCamera) {
      await this.renderer.compileAsync(viewModelScene, viewModelCamera);
    }
  }

  getWebGLRenderer(): WebGLRenderer | null {
    return this.renderer;
  }

  dispose(): void {
    this.renderer?.dispose();
  }
}
