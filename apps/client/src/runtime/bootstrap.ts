import { Vector3 } from "three";
import { Game } from "./game/Game";
import { PerfHud } from "./debug/PerfHud";
import { PointerLockController } from "./input/PointerLock";
import { loadMap, RuntimeMapLoadError } from "./map/loadMap";
import { resolveShot } from "./map/shots";
import type { RuntimeMapAssets } from "./map/types";
import { Renderer } from "./render/Renderer";
import { FloorMaterialLibrary } from "./render/materials/FloorMaterialLibrary";
import { WallMaterialLibrary } from "./render/materials/WallMaterialLibrary";
import { PropModelLibrary } from "./render/models/PropModelLibrary";
import { WeaponAudio } from "./audio/WeaponAudio";
import { AmmoHud } from "./ui/AmmoHud";
import { HealthHud } from "./ui/HealthHud";
import { DeathScreen } from "./ui/DeathScreen";
import { HitVignette } from "./ui/HitVignette";
import { KillFeed } from "./ui/KillFeed";
import { HitMarker } from "./ui/HitMarker";
import { ScoreHud } from "./ui/ScoreHud";
import { RoundEndScreen, type RoundStats } from "./ui/RoundEndScreen";
import { TimerHud } from "./ui/TimerHud";
import { DamageNumbers } from "./ui/DamageNumbers";
import { PauseMenu } from "./ui/PauseMenu";
import { FadeOverlay } from "./ui/FadeOverlay";
import { parseRuntimeUrlParams } from "./utils/UrlParams";

type ViewModelInstance = InstanceType<typeof import("./weapons/Ak47ViewModel")["Ak47ViewModel"]>;

const OVERVIEW_VIEWMODEL_DISABLE_HEIGHT_M = 10;
const PERF_SCENE_SAMPLE_INTERVAL_MS = 300;
const POINTER_LOCK_BANNER_GRACE_MS = 2600;
const FLOOR_MANIFEST_URL = "/assets/textures/environment/bazaar/floors/bazaar_floor_textures_pack_v4/materials.json";
const WALL_MANIFEST_URL = "/assets/textures/environment/bazaar/walls/bazaar_wall_textures_pack_v5/materials.json";
const PROP_MANIFEST_URL = "/assets/models/environment/bazaar/props/bazaar_prop_models_pack_v1/models.json";
const PBR_SURFACES_ENABLED = false;
const MAP_PROPS_ENABLED = false;

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
    wallDetails: {
      enabled: boolean;
      density: number;
      segmentsDecorated: number;
      instanceCount: number;
    };
    error?: string;
  };
  shot: {
    active: boolean;
    id: string | null;
    cameraPose: {
      pos: { x: number; y: number; z: number };
      lookAt: { x: number; y: number; z: number };
      fovDeg: number;
    } | null;
  };
  view: {
    camera: {
      pos: { x: number; y: number; z: number };
      yawDeg: number;
      pitchDeg: number;
      fovDeg: number;
    };
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
  const healthHud = new HealthHud(runtimeRoot);
  const hitVignette = new HitVignette(runtimeRoot);
  const deathScreen = new DeathScreen(runtimeRoot);
  const killFeed = new KillFeed(runtimeRoot);
  const hitMarker = new HitMarker(crosshair);
  const scoreHud = new ScoreHud(runtimeRoot, urlParams.playerName);
  const roundEndScreen = new RoundEndScreen(runtimeRoot);
  const timerHud = new TimerHud(runtimeRoot);
  const damageNumbers = new DamageNumbers(runtimeRoot);
  const pauseMenu = new PauseMenu(runtimeRoot);
  const fadeOverlay = new FadeOverlay(runtimeRoot);

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

  const renderer = new Renderer(runtimeRoot, {
    highVis: urlParams.highVis,
    lightingPreset: urlParams.lightingPreset,
  });
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

  let resolvedFloorMode = PBR_SURFACES_ENABLED ? urlParams.floorMode : "blockout";
  let floorMaterials: FloorMaterialLibrary | null = null;
  if (PBR_SURFACES_ENABLED && resolvedFloorMode === "pbr") {
    try {
      floorMaterials = await FloorMaterialLibrary.load(FLOOR_MANIFEST_URL);
    } catch (error) {
      resolvedFloorMode = "blockout";
      appendWarning(
        `Failed to load floor PBR pack. Falling back to blockout floors.\n${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  let resolvedWallMode = PBR_SURFACES_ENABLED ? urlParams.wallMode : "blockout";
  let wallMaterials: WallMaterialLibrary | null = null;
  if (PBR_SURFACES_ENABLED && resolvedWallMode === "pbr") {
    try {
      wallMaterials = await WallMaterialLibrary.load(WALL_MANIFEST_URL);
    } catch (error) {
      resolvedWallMode = "blockout";
      appendWarning(
        `Failed to load wall PBR pack. Falling back to blockout walls.\n${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  let resolvedPropVisuals = MAP_PROPS_ENABLED ? urlParams.propVisuals : "blockout";
  let propModels: PropModelLibrary | null = null;
  if (MAP_PROPS_ENABLED && resolvedPropVisuals === "bazaar") {
    try {
      propModels = await PropModelLibrary.load(PROP_MANIFEST_URL);
    } catch (error) {
      resolvedPropVisuals = "blockout";
      appendWarning(
        `Failed to load bazaar prop model pack. Falling back to blockout props.\n${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

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
    floorMode: resolvedFloorMode,
    wallMode: resolvedWallMode,
    wallDetails: urlParams.wallDetails,
    wallDetailDensity: urlParams.wallDetailDensity,
    floorQuality: urlParams.floorQuality,
    lightingPreset: urlParams.lightingPreset,
    floorMaterials,
    wallMaterials,
    propVisuals: resolvedPropVisuals,
    propModels,
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
    onWeaponShot: (shot) => {
      viewModel?.triggerShotFx();
      weaponAudio.playAk47Shot();
      waveStats.shotsFired++;

      // Enemy hit detection: re-raycast against enemy AABBs to see if the bullet hit one
      if (shot.hit && shot.hitPoint) {
        const camPos = game.camera.position;
        const camFwd = camFwdScratch;
        game.camera.getWorldDirection(camFwd);
        const hp = shot.hitPoint;
        const hitPoint = hitPointScratch.set(hp.x, hp.y, hp.z);
        const worldHitDist = camPos.distanceTo(hitPoint);
        const enemyHit = game.checkEnemyRaycastHit(camPos, camFwd, worldHitDist + 0.1);
        if (enemyHit.hit && enemyHit.distance <= worldHitDist + 0.05) {
          // Hit-zone multiplier: head=4× (instant kill), legs=0.75×, body=1×
          // Enemy height is ~1.8m; head zone = top 20%, legs = bottom 25%
          const BASE_DAMAGE = 25;
          const ENEMY_H = 1.8;
          // Use hitY directly (enemies stand on floor_height ≈ 0)
          let damage = BASE_DAMAGE;
          let isHeadshot = false;
          if (enemyHit.hitY > ENEMY_H * 0.78) {
            // Head zone (top 22%) → 4× = instant kill (100 damage)
            damage = BASE_DAMAGE * 4;
            isHeadshot = true;
          } else if (enemyHit.hitY < ENEMY_H * 0.25) {
            // Legs zone (bottom 25%) → 0.75×
            damage = Math.round(BASE_DAMAGE * 0.75);
          }
          waveStats.shotsHit++;
          if (isHeadshot) {
            waveStats.headshots++;
            scoreHud.addHeadshot();
          }
          game.applyDamageToEnemy(enemyHit.enemyId, damage, isHeadshot);
          hitMarker.trigger(isHeadshot);
          weaponAudio.playHitThud();
          // Floating damage number at hit point
          damageNumbers.spawn(
            { x: enemyHit.hitX, y: enemyHit.hitY, z: enemyHit.hitZ },
            game.camera,
            damage,
            isHeadshot,
          );
        }
      }
    },
    unlimitedHealth: urlParams.unlimitedHealth,
    ...(urlParams.debug ? { onTogglePerfHud: () => perfHud.toggle() } : {}),
  });

  // Wire enemy gunshot audio (quiet distant shots from AI enemies)
  game.setEnemyAudio(weaponAudio);

  // Landing impact: heavy thud + camera bob when player hits the ground
  game.setLandingCallback(() => {
    weaponAudio.playLanding();
  });

  // Weapon audio callbacks: reload sounds + dry-fire click
  game.setWeaponCallbacks({
    onReloadStart: () => weaponAudio.playReloadStart(),
    onReloadEnd: () => weaponAudio.playReloadEnd(),
    onDryFire: () => weaponAudio.playDryFire(),
  });

  // Pause menu: resume by re-requesting pointer lock
  pauseMenu.onResume = () => {
    void renderer.canvas.requestPointerLock();
  };
  pauseMenu.onReturnToLobby = () => {
    const lobbyUrl = `${window.location.origin}${window.location.pathname}`;
    window.location.href = lobbyUrl;
  };

  // Wire kill feed
  // Wire kill events → feed + ding + score counter
  const TOTAL_ENEMIES = 9;
  scoreHud.setTotal(TOTAL_ENEMIES);
  game.setEnemyKillCallback((name, isHeadshot) => {
    killFeed.addKill(urlParams.playerName, name, isHeadshot);
    weaponAudio.playKillDing();
    scoreHud.addKill();
    waveStats.kills++;
  });

  // New wave → reset score, stats counters, and hide round-end screen
  game.setEnemyNewWaveCallback((_wave) => {
    scoreHud.reset();
    scoreHud.setTotal(TOTAL_ENEMIES);
    roundEndScreen.hide();
    roundEndShowing = false;
    waveElapsedS = 0;
    timerHud.reset();
    timerHud.start();
    // Reset per-wave stats
    waveStats.kills = 0;
    waveStats.totalEnemies = TOTAL_ENEMIES;
    waveStats.shotsFired = 0;
    waveStats.shotsHit = 0;
    waveStats.headshots = 0;
  });

  // Death screen respawn handler — fires on both click and auto-countdown
  // Fade to black → teleport → fade back in for a smooth transition
  deathScreen.onRespawn = () => {
    fadeOverlay.fadeOut(0.18, () => {
      // Teleport happens while screen is black
      game.respawn();
      game.setFreezeInput(false);
      pauseMenu.hide();
      void renderer.canvas.requestPointerLock();
      // Brief hold at black, then fade back in
      setTimeout(() => {
        fadeOverlay.fadeIn(0.3);
      }, 60);
    });
  };

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
          pointerLockBannerGraceMs = POINTER_LOCK_BANNER_GRACE_MS;
          startViewModelLoad();
          weaponAudio.ensureResumedFromGesture();
          weaponAudio.startAmbient(); // begin wind loop once audio is unlocked
        } else {
          pointerLockBannerGraceMs = 0;
        }
      },
      onMouseDelta: (deltaX, deltaY) => {
        game.onMouseDelta(deltaX, deltaY);
        swayMouseDeltaX += deltaX;
        swayMouseDeltaY += deltaY;
      },
    });
  }

  let rafId = 0;
  let previousFrameTime = performance.now();
  let previousHealth = 100;
  let footstepTimerS = 0;
  let pointerLockBannerGraceMs = 0;
  // Accumulated mouse delta for weapon sway (reset each frame after feeding to viewmodel)
  let swayMouseDeltaX = 0;
  let swayMouseDeltaY = 0;
  // Round / wave timing
  let waveElapsedS = 0;         // time elapsed since current wave started
  let roundEndShowing = false;  // true while round-end overlay is displayed

  // Per-wave stats counters (reset each new wave)
  const waveStats: RoundStats = {
    kills: 0,
    totalEnemies: 9, // matches TOTAL_ENEMIES defined below
    shotsFired: 0,
    shotsHit: 0,
    headshots: 0,
  };
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
  const camFwdScratch = new Vector3();
  const hitPointScratch = new Vector3();

  const state = (): RuntimeTextState => {
    const yawPitch = game.getYawPitchDeg();
    return {
      mode: "runtime",
      map: {
        loaded: mapLoaded,
        mapId: urlParams.mapId,
        seed: game.getPropsBuildStats().seed,
        spawn: urlParams.spawn,
        highVis: urlParams.highVis,
        colliderCount: game.getColliderCount(),
        wallDetails: {
          enabled: game.getWallDetailStats().enabled,
          density: game.getWallDetailStats().density,
          segmentsDecorated: game.getWallDetailStats().segmentsDecorated,
          instanceCount: game.getWallDetailStats().instanceCount,
        },
        ...(mapErrorMessage ? { error: mapErrorMessage } : {}),
      },
      shot: {
        active: shotActive,
        id: shotId,
        cameraPose: resolvedShot?.cameraPose ?? null,
      },
      // Include explicit camera data so screenshot review gates can assert framing consistency.
      // This prevents top-down/floor-only compare-shot regressions from passing unnoticed.
      view: {
        camera: {
          pos: {
            x: game.camera.position.x,
            y: game.camera.position.y,
            z: game.camera.position.z,
          },
          yawDeg: yawPitch.yaw,
          pitchDeg: yawPitch.pitch,
          fovDeg: game.camera.fov,
        },
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
    };
  };

  const onResize = (): void => {
    renderer.resize();
    game.setAspect(renderer.getAspect());
    game.setViewportSize(renderer.getWidth(), renderer.getHeight());
    viewModel?.setAspect(renderer.getAspect());
  };

  const step = (deltaMs: number): void => {
    const clampedMs = Math.min(Math.max(deltaMs, 0), 100);
    const dt = clampedMs / 1000;

    // Freeze game input when pause menu is open (death-freeze is managed inside Game.ts)
    if (pauseMenu.isVisible()) {
      game.setFreezeInput(true);
    } else if (!game.getIsDead() && !inputFrozen) {
      game.setFreezeInput(false);
    }
    game.update(dt);

    // ── Health tracking & hit vignette ───────────────────────────────────────
    const currentHealth = game.getPlayerHealth();
    if (currentHealth < previousHealth) {
      hitVignette.triggerHit();
    }
    previousHealth = currentHealth;

    // ── Footstep audio ───────────────────────────────────────────────────────
    const grounded = game.getGrounded();
    const speedMps = game.getSpeedMps();
    if (grounded && speedMps > 0.5) {
      footstepTimerS -= dt;
      if (footstepTimerS <= 0) {
        footstepTimerS = speedMps > 4.5 ? 0.45 : 0.65;
        weaponAudio.playFootstep(Math.min(1, speedMps / 6.0));
      }
    } else {
      footstepTimerS = 0; // reset so first step fires immediately on landing
    }

    // ── Wave timing & round-end screen ───────────────────────────────────────
    if (!game.getIsDead() && !roundEndShowing) {
      waveElapsedS += dt;
    }
    const allDead = game.getAllEnemiesDead();
    if (allDead && !roundEndShowing && !game.getIsDead()) {
      // First frame all enemies are dead — show the round-end screen with stats
      roundEndShowing = true;
      roundEndScreen.show(waveElapsedS, game.getWaveNumber(), { ...waveStats });
    }
    if (roundEndShowing) {
      const countdown = game.getWaveCountdownS() ?? 0;
      roundEndScreen.update(dt, countdown);
    }

    // ── Death detection ──────────────────────────────────────────────────────
    if (game.getIsDead() && !deathScreen.isVisible()) {
      deathScreen.show();
    }

    const overviewCamera = game.camera.position.y > OVERVIEW_VIEWMODEL_DISABLE_HEIGHT_M;
    viewModelVisible = Boolean(viewModelEnabled && viewModel && !overviewCamera);
    crosshair.style.display = overviewCamera ? "none" : "block";
    ammoHud.setVisible(!overviewCamera);
    healthHud.setVisible(!overviewCamera);
    timerHud.setVisible(!overviewCamera);
    if (!overviewCamera) {
      ammoHud.update(game.getAmmoSnapshot());
      healthHud.update({ health: currentHealth }, dt);
    }

    // Update pause menu
    pauseMenu.update(dt);

    // ── Timer: pause while dead or round-end showing ─────────────────────────
    if (game.getIsDead() || roundEndShowing) {
      timerHud.pause();
    } else {
      timerHud.start();
    }
    pointerLockBannerGraceMs = Math.max(0, pointerLockBannerGraceMs - clampedMs);
    const docWithWebkitFullscreen = document as Document & { webkitFullscreenElement?: Element | null };
    const fullscreenElement = document.fullscreenElement ?? docWithWebkitFullscreen.webkitFullscreenElement ?? null;
    const chromeBannerLikelyVisible = pointerLockBannerGraceMs > 0 || Boolean(fullscreenElement);
    timerHud.setChromeBannerClearance(chromeBannerLikelyVisible);
    timerHud.update(dt);

    // ── Always-on effects ────────────────────────────────────────────────────
    fadeOverlay.update(dt);
    hitVignette.update(dt);
    deathScreen.update(dt);
    killFeed.update(dt);
    hitMarker.update(dt);
    damageNumbers.update(dt);

    if (viewModel) {
      viewModel.setFrameInput(speedMps, grounded, swayMouseDeltaX, swayMouseDeltaY);
      swayMouseDeltaX = 0;
      swayMouseDeltaY = 0;
      viewModel.updateFromMainCamera(game.camera, dt);
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

  // Escape key toggles pause menu (when pointer lock is NOT held by the browser)
  const onKeyDownPause = (e: KeyboardEvent): void => {
    if (e.code !== "Escape") return;
    if (game.getIsDead()) return; // ignore Esc on death screen
    if (inputFrozen) return;
    // When Escape is pressed, pointer lock exits first (browser default),
    // then we show the pause menu.
    // If we're already showing pause, hide it and try to re-lock.
    if (pauseMenu.isVisible()) {
      pauseMenu.hide();
      pauseMenu.onResume?.();
    }
    // If pointer is not locked (Esc just released it), show pause
    // We check via a short delay since pointerlockchange fires after keydown
    setTimeout(() => {
      if (!pointerLock?.isLocked() && !game.getIsDead() && !inputFrozen) {
        pauseMenu.show();
      }
    }, 50);
  };
  window.addEventListener("keydown", onKeyDownPause);

  pointerLock?.init();
  onResize();
  window.addEventListener("resize", onResize);
  timerHud.start(); // begin counting from game boot
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
    healthHud.dispose();
    hitVignette.dispose();
    deathScreen.dispose();
    killFeed.dispose();
    hitMarker.dispose();
    scoreHud.dispose();
    roundEndScreen.dispose();
    timerHud.dispose();
    damageNumbers.dispose();
    pauseMenu.dispose();
    fadeOverlay.dispose();
    window.removeEventListener("keydown", onKeyDownPause);
    propModels?.dispose();
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
