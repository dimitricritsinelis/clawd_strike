import { Game } from "./game/Game";
import { PerfHud } from "./debug/PerfHud";
import { PointerLockController } from "./input/PointerLock";
import { loadMap, RuntimeMapLoadError } from "./map/loadMap";
import { resolveShot } from "./map/shots";
import type { RuntimeMapAssets } from "./map/types";
import { Renderer } from "./render/Renderer";
import { WeaponAudio } from "./audio/WeaponAudio";
import { AmmoHud } from "./ui/AmmoHud";
import { parseRuntimeUrlParams } from "./utils/UrlParams";

type ViewModelInstance = InstanceType<typeof import("./weapons/Ak47ViewModel")["Ak47ViewModel"]>;

const OVERVIEW_VIEWMODEL_DISABLE_HEIGHT_M = 10;
const PERF_SCENE_SAMPLE_INTERVAL_MS = 300;

type ScenePerfSnapshot = {
  materials: number;
  instancedMeshes: number;
  instancedInstances: number;
};

function collectScenePerfSnapshot(worldScene: { traverse: (cb: (node: unknown) => void) => void }, viewModelScene: { traverse: (cb: (node: unknown) => void) => void } | null): ScenePerfSnapshot {
  const materials = new Set<unknown>();
  let instancedMeshes = 0;
  let instancedInstances = 0;

  const walk = (scene: { traverse: (cb: (node: unknown) => void) => void }): void => {
    scene.traverse((node) => {
      const mesh = node as {
        isMesh?: boolean;
        material?: unknown;
        isInstancedMesh?: boolean;
        count?: number;
      };
      if (!mesh.isMesh) return;

      if (Array.isArray(mesh.material)) {
        for (const material of mesh.material) {
          if (material) materials.add(material);
        }
      } else if (mesh.material) {
        materials.add(mesh.material);
      }

      if (mesh.isInstancedMesh) {
        instancedMeshes += 1;
        instancedInstances += Math.max(0, mesh.count ?? 0);
      }
    });
  };

  walk(worldScene);
  if (viewModelScene) {
    walk(viewModelScene);
  }

  return {
    materials: materials.size,
    instancedMeshes,
    instancedInstances,
  };
}

export type RuntimeTextState = {
  mode: "runtime";
  map: {
    loaded: boolean;
    mapId: string;
    seed: number;
    spawn: "A" | "B";
    highVis: boolean;
    colliderCount: number;
    error?: string;
  };
  shot: {
    active: boolean;
    id: string | null;
  };
  gameplay: {
    active: true;
    pointerLocked: boolean;
    inputFrozen: boolean;
    grounded: boolean;
    speedMps: number;
  };
  anchorsDebug: {
    markersVisible: boolean;
    labelsVisible: boolean;
    totalAnchors: number;
    filteredAnchors: number;
    shownLabels: number;
    filterTypes: readonly string[];
  };
  props: {
    profile: "subtle" | "medium" | "high";
    jitter: number;
    cluster: number;
    density: number;
    candidatesTotal: number;
    collidersPlaced: number;
    rejections: {
      clearZone: number;
      bounds: number;
      gapRule: number;
    };
    visualOnlyLandmarks: number;
    stallFillersPlaced: number;
  };
  weapon: {
    enabled: boolean;
    visible: boolean;
    loaded: boolean;
    alignDot: number;
    alignAngleDeg: number;
  };
  perf: {
    visible: boolean;
    fps: number;
    msPerFrame: number;
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    materials: number;
    instancedMeshes: number;
    instancedInstances: number;
  };
};

export type RuntimeHandle = {
  teardown: () => void;
};

function getAppRoot(): HTMLElement {
  const app = document.querySelector<HTMLElement>("#app");
  if (!app) throw new Error("Missing #app mount root");
  return app;
}

function createRuntimeRoot(appRoot: HTMLElement): HTMLDivElement {
  const existing = appRoot.querySelector<HTMLDivElement>("#runtime-root");
  if (existing) return existing;

  const runtimeRoot = document.createElement("div");
  runtimeRoot.id = "runtime-root";
  runtimeRoot.style.position = "absolute";
  runtimeRoot.style.inset = "0";
  runtimeRoot.style.background = "#e8f2ff";
  runtimeRoot.style.overflow = "hidden";
  runtimeRoot.style.userSelect = "none";
  appRoot.prepend(runtimeRoot);
  return runtimeRoot;
}

function createOverlay(root: HTMLElement, style: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const el = document.createElement("div");
  el.style.position = "absolute";
  el.style.maxWidth = "min(90vw, 640px)";
  el.style.display = "none";
  el.style.whiteSpace = "pre-wrap";
  el.style.zIndex = "20";
  Object.assign(el.style, style);
  root.append(el);
  return el;
}

function createCrosshair(root: HTMLElement): HTMLDivElement {
  const crosshair = document.createElement("div");
  crosshair.style.position = "absolute";
  crosshair.style.left = "50%";
  crosshair.style.top = "50%";
  crosshair.style.width = "18px";
  crosshair.style.height = "18px";
  crosshair.style.transform = "translate(-50%, -50%)";
  crosshair.style.pointerEvents = "none";
  crosshair.style.zIndex = "16";

  const horizontal = document.createElement("div");
  horizontal.style.position = "absolute";
  horizontal.style.left = "0";
  horizontal.style.top = "8px";
  horizontal.style.width = "18px";
  horizontal.style.height = "2px";
  horizontal.style.background = "rgba(13, 23, 38, 0.92)";
  horizontal.style.borderRadius = "1px";
  crosshair.append(horizontal);

  const vertical = document.createElement("div");
  vertical.style.position = "absolute";
  vertical.style.left = "8px";
  vertical.style.top = "0";
  vertical.style.width = "2px";
  vertical.style.height = "18px";
  vertical.style.background = "rgba(13, 23, 38, 0.92)";
  vertical.style.borderRadius = "1px";
  crosshair.append(vertical);

  root.append(crosshair);
  return crosshair;
}

function formatMapLoadError(error: unknown): string {
  if (error instanceof RuntimeMapLoadError) {
    const status = typeof error.status === "number" ? ` (status ${error.status})` : "";
    return `Failed to load map JSON\nURL: ${error.url}${status}\n${error.message}`;
  }
  if (error instanceof Error) {
    return `Failed to load map JSON\n${error.message}`;
  }
  return `Failed to load map JSON\n${String(error)}`;
}

export async function bootstrapRuntime(): Promise<RuntimeHandle> {
  const appRoot = getAppRoot();
  const runtimeRoot = createRuntimeRoot(appRoot);
  const urlParams = parseRuntimeUrlParams(window.location.search);

  const warningOverlay = createOverlay(runtimeRoot, {
    left: "16px",
    top: "16px",
    borderRadius: "10px",
    padding: "8px 12px",
    border: "1px solid rgba(85, 74, 15, 0.48)",
    background: "rgba(255, 242, 200, 0.92)",
    color: "#4f4300",
    fontSize: "12px",
    lineHeight: "1.35",
  });

  const errorOverlay = createOverlay(runtimeRoot, {
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    borderRadius: "12px",
    padding: "12px 14px",
    border: "1px solid rgba(138, 12, 12, 0.45)",
    background: "rgba(255, 236, 236, 0.96)",
    color: "#730f0f",
    fontSize: "13px",
    lineHeight: "1.35",
  });
  const crosshair = createCrosshair(runtimeRoot);
  const perfHud = new PerfHud(runtimeRoot, urlParams.perf);
  const ammoHud = new AmmoHud(runtimeRoot);

  let mapLoaded = false;
  let mapErrorMessage: string | null = null;
  let shotActive = false;
  let shotId: string | null = null;
  let inputFrozen = false;

  let mapAssets: RuntimeMapAssets | null = null;
  try {
    mapAssets = await loadMap(urlParams.mapId);
    mapLoaded = true;
  } catch (error) {
    mapErrorMessage = formatMapLoadError(error);
    errorOverlay.textContent = mapErrorMessage;
    errorOverlay.style.display = "block";
  }

  const renderer = new Renderer(runtimeRoot, { highVis: urlParams.highVis });
  let disposed = false;
  const weaponAudio = new WeaponAudio();
  const viewModelEnabled = urlParams.vm;
  let viewModel: ViewModelInstance | null = null;
  let viewModelLoadStarted = false;
  let viewModelVisible = false;

  const appendWarning = (message: string): void => {
    if (warningOverlay.textContent && warningOverlay.textContent.length > 0) {
      warningOverlay.textContent = `${warningOverlay.textContent}\n${message}`;
    } else {
      warningOverlay.textContent = message;
    }
    warningOverlay.style.display = "block";
  };

  const startViewModelLoad = (): void => {
    if (!viewModelEnabled || disposed || viewModelLoadStarted || viewModel) {
      return;
    }

    viewModelLoadStarted = true;
    void (async () => {
      const { Ak47ViewModel } = await import("./weapons/Ak47ViewModel");
      if (disposed) return;

      const nextViewModel = new Ak47ViewModel({
        vmDebug: urlParams.vmDebug && urlParams.debug,
      });
      nextViewModel.setAspect(renderer.getAspect());
      viewModel = nextViewModel;
      await nextViewModel.load();
    })().catch((error: unknown) => {
      const message = `Failed to load AK47 viewmodel\n${error instanceof Error ? error.message : String(error)}`;
      appendWarning(message);
      viewModel?.dispose();
      viewModel = null;
      viewModelLoadStarted = false;
    });
  };

  const resolvedShot = mapAssets ? resolveShot(mapAssets.shots, urlParams.shot) : null;
  shotActive = resolvedShot?.active ?? false;
  shotId = resolvedShot?.id ?? null;
  inputFrozen = resolvedShot?.freezeInput ?? false;

  const game = new Game({
    mapId: urlParams.mapId,
    seedOverride: urlParams.seed,
    propChaos: urlParams.propChaos,
    freezeInput: inputFrozen,
    spawn: urlParams.spawn,
    debug: urlParams.debug,
    highVis: urlParams.highVis,
    mountEl: runtimeRoot,
    anchorsDebug: {
      showMarkers: urlParams.anchors,
      showLabels: urlParams.labels,
      anchorTypes: urlParams.anchorTypes,
    },
    onWeaponShot: () => {
      viewModel?.triggerShotFx();
      weaponAudio.playAk47Shot();
    },
    ...(urlParams.debug ? { onTogglePerfHud: () => perfHud.toggle() } : {}),
  });

  // Preload the weapon model at runtime boot so first shots don't miss viewmodel FX.
  startViewModelLoad();

  if (mapAssets) {
    game.setBlockoutSpec(mapAssets.blockout);
    game.setAnchorsSpec(mapAssets.anchors);
  }
  if (resolvedShot?.cameraPose) {
    game.setCameraPose(resolvedShot.cameraPose);
  }
  if (resolvedShot?.warning) {
    warningOverlay.textContent = resolvedShot.warning;
    warningOverlay.style.display = "block";
  }

  let pointerLock: PointerLockController | null = null;
  if (!inputFrozen) {
    pointerLock = new PointerLockController({
      mountEl: runtimeRoot,
      lockEl: renderer.canvas,
      onLockChange: (locked) => {
        game.setPointerLocked(locked);
        if (locked) {
          startViewModelLoad();
          weaponAudio.ensureResumedFromGesture();
        }
      },
      onMouseDelta: (deltaX, deltaY) => game.onMouseDelta(deltaX, deltaY),
    });
  }

  let rafId = 0;
  let previousFrameTime = performance.now();
  let perfMsPerFrame = 16.67;
  let perfFps = 60;
  let perfDrawCalls = 0;
  let perfTriangles = 0;
  let perfGeometries = 0;
  let perfTextures = 0;
  let scenePerfSampleElapsed = PERF_SCENE_SAMPLE_INTERVAL_MS;
  let scenePerfSnapshot: ScenePerfSnapshot = {
    materials: 0,
    instancedMeshes: 0,
    instancedInstances: 0,
  };

  const state = (): RuntimeTextState => ({
    mode: "runtime",
    map: {
      loaded: mapLoaded,
      mapId: urlParams.mapId,
      seed: game.getPropsBuildStats().seed,
      spawn: urlParams.spawn,
      highVis: urlParams.highVis,
      colliderCount: game.getColliderCount(),
      ...(mapErrorMessage ? { error: mapErrorMessage } : {}),
    },
    shot: {
      active: shotActive,
      id: shotId,
    },
    gameplay: {
      active: true,
      pointerLocked: pointerLock?.isLocked() ?? false,
      inputFrozen,
      grounded: game.getGrounded(),
      speedMps: game.getSpeedMps(),
    },
    anchorsDebug: game.getAnchorsDebugState(),
    props: {
      profile: game.getPropsBuildStats().profile,
      jitter: game.getPropsBuildStats().jitter,
      cluster: game.getPropsBuildStats().cluster,
      density: game.getPropsBuildStats().density,
      candidatesTotal: game.getPropsBuildStats().candidatesTotal,
      collidersPlaced: game.getPropsBuildStats().collidersPlaced,
      rejections: {
        clearZone: game.getPropsBuildStats().rejectedClearZone,
        bounds: game.getPropsBuildStats().rejectedBounds,
        gapRule: game.getPropsBuildStats().rejectedGapRule,
      },
      visualOnlyLandmarks: game.getPropsBuildStats().visualOnlyLandmarks,
      stallFillersPlaced: game.getPropsBuildStats().stallFillersPlaced,
    },
    weapon: {
      enabled: viewModelEnabled,
      visible: viewModelVisible,
      loaded: game.getWeaponDebugSnapshot().loaded,
      alignDot: game.getWeaponDebugSnapshot().dot,
      alignAngleDeg: game.getWeaponDebugSnapshot().angleDeg,
    },
    perf: {
      visible: perfHud.isVisible(),
      fps: perfFps,
      msPerFrame: perfMsPerFrame,
      drawCalls: perfDrawCalls,
      triangles: perfTriangles,
      geometries: perfGeometries,
      textures: perfTextures,
      materials: scenePerfSnapshot.materials,
      instancedMeshes: scenePerfSnapshot.instancedMeshes,
      instancedInstances: scenePerfSnapshot.instancedInstances,
    },
  });

  const onResize = (): void => {
    renderer.resize();
    game.setAspect(renderer.getAspect());
    game.setViewportSize(renderer.getWidth(), renderer.getHeight());
    viewModel?.setAspect(renderer.getAspect());
  };

  const step = (deltaMs: number): void => {
    const clampedMs = Math.min(Math.max(deltaMs, 0), 100);
    game.update(clampedMs / 1000);

    const overviewCamera = game.camera.position.y > OVERVIEW_VIEWMODEL_DISABLE_HEIGHT_M;
    viewModelVisible = Boolean(viewModelEnabled && viewModel && !overviewCamera);
    crosshair.style.display = overviewCamera ? "none" : "block";
    ammoHud.setVisible(!overviewCamera);
    if (!overviewCamera) {
      ammoHud.update(game.getAmmoSnapshot());
    }

    if (viewModel) {
      viewModel.updateFromMainCamera(game.camera, clampedMs / 1000);
      const weaponDebug = viewModel.getAlignmentSnapshot();
      game.setWeaponDebugSnapshot(weaponDebug.loaded, weaponDebug.dot, weaponDebug.angleDeg);
    } else {
      game.setWeaponDebugSnapshot(false, -1, 180);
    }

    renderer.renderWithViewModel(
      game.scene,
      game.camera,
      viewModel?.viewModelScene ?? null,
      viewModel?.viewModelCamera ?? null,
      viewModelVisible,
    );

    perfMsPerFrame = perfMsPerFrame * 0.9 + clampedMs * 0.1;
    perfFps = 1000 / Math.max(0.01, perfMsPerFrame);

    const perfInfo = renderer.getPerfInfo();
    perfDrawCalls = perfInfo.drawCalls;
    perfTriangles = perfInfo.triangles;
    perfGeometries = perfInfo.geometries;
    perfTextures = perfInfo.textures;

    scenePerfSampleElapsed += clampedMs;
    if (scenePerfSampleElapsed >= PERF_SCENE_SAMPLE_INTERVAL_MS) {
      scenePerfSnapshot = collectScenePerfSnapshot(game.scene, viewModel?.viewModelScene ?? null);
      scenePerfSampleElapsed = 0;
    }

    perfHud.update({
      fps: perfFps,
      msPerFrame: perfMsPerFrame,
      drawCalls: perfDrawCalls,
      triangles: perfTriangles,
      geometries: perfGeometries,
      textures: perfTextures,
      materials: scenePerfSnapshot.materials,
      instancedMeshes: scenePerfSnapshot.instancedMeshes,
      instancedInstances: scenePerfSnapshot.instancedInstances,
      dpr: renderer.getCurrentPixelRatio(),
      dprCap: renderer.getPixelRatioCap(),
      debugEnabled: urlParams.debug,
    });
  };

  const animate = (time: number): void => {
    if (disposed) return;
    const deltaMs = time - previousFrameTime;
    previousFrameTime = time;
    step(deltaMs);
    rafId = window.requestAnimationFrame(animate);
  };

  pointerLock?.init();
  onResize();
  window.addEventListener("resize", onResize);
  rafId = window.requestAnimationFrame(animate);

  window.render_game_to_text = () => JSON.stringify(state());
  window.advanceTime = async (ms: number) => {
    const frameMs = 1000 / 60;
    let remaining = Math.max(0, ms);

    if (remaining === 0) {
      step(0);
      return;
    }

    while (remaining > 0) {
      const nextStep = Math.min(frameMs, remaining);
      step(nextStep);
      remaining -= nextStep;
    }
  };

  const teardown = (): void => {
    if (disposed) return;
    disposed = true;

    window.cancelAnimationFrame(rafId);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("pagehide", teardown);
    window.removeEventListener("beforeunload", teardown);

    pointerLock?.dispose();
    game.teardown();
    weaponAudio.dispose();
    perfHud.dispose();
    ammoHud.dispose();
    viewModel?.dispose();
    renderer.dispose();
    crosshair.remove();
    warningOverlay.remove();
    errorOverlay.remove();
    runtimeRoot.remove();
  };

  window.addEventListener("pagehide", teardown);
  window.addEventListener("beforeunload", teardown);

  return { teardown };
}
