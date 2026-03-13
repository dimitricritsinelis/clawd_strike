import { PerspectiveCamera, Vector3 } from "three";
import { Game } from "./game/Game";
import { PerfHud } from "./debug/PerfHud";
import { setEnemyVisualModelStreamingEnabled } from "./enemies/EnemyVisual";
import { ENEMIES_PER_WAVE } from "./enemies/EnemyManager";
import { PointerLockController } from "./input/PointerLock";
import { loadMap, RuntimeMapLoadError } from "./map/loadMap";
import { designToWorldVec3 } from "./map/coordinateTransforms";
import { resolveShot } from "./map/shots";
import type { RuntimeAnchor, RuntimeBlockoutSpec, RuntimeMapAssets } from "./map/types";
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
import { HowToPlayOverlay } from "./ui/HowToPlayOverlay";
import { ControlsOverlay } from "./ui/ControlsOverlay";
import { FadeOverlay } from "./ui/FadeOverlay";
import { HeadshotBanner } from "./ui/HeadshotBanner";
import { parseRuntimeUrlParams, type RuntimeControlMode } from "./utils/UrlParams";
import { normalizeAgentAction, type AgentAction } from "./input/AgentAction";
import { isMobileDevice } from "./input/MobileDetect";
import { TouchInputManager } from "./input/TouchInputManager";
import { MobileTouchHud } from "./ui/MobileTouchHud";
import { MobileOrientationGuard } from "./ui/MobileOrientationGuard";
import { MobileFullscreenHint } from "./ui/MobileFullscreenHint";
import { BulletHoleManager } from "./effects/BulletHoleManager";
import { BuffManager } from "./buffs/BuffManager";
import { warmupOrbMaterials } from "./buffs/BuffOrb";
import { BUFF_TYPES, type BuffType } from "./buffs/BuffTypes";
import { BuffHud } from "./ui/BuffHud";
import { BuffTextHud } from "./ui/BuffTextHud";
import { BuffVignette } from "./ui/BuffVignette";
import type { RuntimeWarmupAssets } from "./warmup";
import { isLocalhostHostname } from "../shared/hostEnvironment";
import {
  getSharedChampionSnapshot,
  loadSharedChampion,
  loadSharedChampionWithMeta,
  startSharedChampionRunSession,
  submitSharedChampionRunSession,
  type SharedChampionRunSession,
} from "../shared/sharedChampionClient";
import {
  SHARED_CHAMPION_SCORE_RULESET,
  isBetterSharedChampionCandidate,
  normalizeScore,
  type SharedChampion,
  type SharedChampionRunSummary,
  type SharedChampionSnapshot,
} from "../../../shared/highScore";
import {
  PUBLIC_AGENT_API_VERSION,
  PUBLIC_AGENT_CONTRACT,
} from "../../../shared/publicAgentContract";

type ViewModelInstance = InstanceType<typeof import("./weapons/Ak47ViewModel")["Ak47ViewModel"]>;

const OVERVIEW_VIEWMODEL_DISABLE_HEIGHT_M = 10;
const PERF_SCENE_SAMPLE_INTERVAL_MS = 300;
const POINTER_LOCK_BANNER_GRACE_MS = 2600;
const FLOOR_MANIFEST_URL = "/assets/textures/environment/bazaar/floors/bazaar_floor_textures_pack_v4/materials.json";
const WALL_MANIFEST_URL = "/assets/textures/environment/bazaar/walls/bazaar_wall_textures_pack_v5/materials.json";
const PROP_MANIFEST_URL = "/assets/models/environment/bazaar/props/bazaar_prop_models_pack_v1/models.json";
const DOOR_MANIFEST_URL = "/assets/models/environment/bazaar/doors/models.json";
const PBR_FLOORS_ENABLED = true;
const PBR_WALLS_ENABLED = true;
const MAP_PROPS_ENABLED = false;
const DOOR_MODELS_ENABLED = true;
const RUNTIME_TEXT_API_VERSION = 4;
const SCORE_STORAGE_PREFIX = "clawd-strike:score-best";
const SCORE_RULESET_KEY = SHARED_CHAMPION_SCORE_RULESET;
const AGENT_VISIBLE_RENDER_INTERVAL_MS = 1000 / 30;
const AGENT_BACKGROUND_STEP_INTERVAL_MS = 500;
const TEXTURE_STABLE_WINDOW_MS = 500;

type ScenePerfSnapshot = {
  materials: number;
  instancedMeshes: number;
  instancedInstances: number;
};

type RevealPhase = "warming" | "ready" | "revealing" | "active";

type QueuedCombatFeedbackEvent =
  | {
      type: "hit";
      isHeadshot: boolean;
    }
  | {
      type: "damage-number";
      worldPos: { x: number; y: number; z: number };
      damage: number;
      isHeadshot: boolean;
    }
  | {
      type: "kill";
      enemyName: string;
      isHeadshot: boolean;
    };

type DebugCombatFeedbackPayload = {
  isHeadshot?: boolean;
  didKill?: boolean;
  damage?: number;
  enemyName?: string;
};

type DebugBuffOrbPayload = {
  count?: number;
};

type DebugBuffVignettePayload = {
  action?: "activate" | "deactivate" | "clear";
  type?: BuffType | "rallying_cry";
  exclusive?: boolean;
};

function shouldReplaceSharedChampion(
  currentChampion: SharedChampion | null,
  nextChampion: SharedChampion | null,
): boolean {
  if (nextChampion === null) {
    return currentChampion === null;
  }
  if (currentChampion === null) {
    return true;
  }
  if (nextChampion.score !== currentChampion.score) {
    return nextChampion.score > currentChampion.score;
  }
  return nextChampion.updatedAt >= currentChampion.updatedAt;
}

function isDebugBuffType(value: string): value is BuffType {
  return (BUFF_TYPES as readonly string[]).includes(value);
}

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
  apiVersion: number;
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
  render: {
    webgl: boolean;
    viewport: {
      width: number;
      height: number;
    };
    warnings: string[];
  };
  boot: {
    revealPhase: RevealPhase;
    warmupTimedOut: boolean;
    performanceSafeFallback: boolean;
    enemyVisualsReady: boolean;
    viewModelPrewarmed: boolean;
    hiddenWarmupRenderDone: boolean;
    precompiled: boolean;
    readyAtMs: number | null;
    readyTextureCount: number | null;
    textureStableAtMs: number | null;
    stableTextureCount: number | null;
    lateTextureGrowth: number;
  };
  view: {
    camera: {
      pos: { x: number; y: number; z: number };
      yawDeg: number;
      pitchDeg: number;
      fovDeg: number;
      aspect: number;
    };
  };
  gameplay: {
    active: boolean;
    alive: boolean;
    pointerLocked: boolean;
    focused: boolean;
    visibility: "visible" | "hidden";
    inputFrozen: boolean;
    grounded: boolean;
    speedMps: number;
  };
  agent: {
    enabled: boolean;
    name: string;
  };
  player: {
    name: string;
    pos: { x: number; y: number; z: number };
    vel: { x: number; y: number; z: number };
    withinPlayableBounds: boolean;
    zoneId: string | null;
    zoneType: string | null;
    zoneLabel: string | null;
    collision: {
      hitX: boolean;
      hitY: boolean;
      hitZ: boolean;
      grounded: boolean;
    };
  };
  bots: {
    waveNumber: number;
    waveElapsedS: number;
    tier: number;
    aliveCount: number;
    graphNodeCount: number;
    searchPhase: "caution" | "probe" | "sweep" | "collapse" | "pinch";
    topSearchZones: Array<{
      zoneId: string;
      score: number;
      reason: string;
      lastClearedAgeS: number | null;
    }>;
    squadTasks: Array<{
      enemyId: string;
      kind: "hold" | "clear" | "contain" | "flank";
      zoneId: string;
      lane: "west" | "main" | "east";
      reason: string;
    }>;
    roleCounts: Record<"anchor" | "rifler" | "flanker" | "roamer", number>;
    preventedFriendlyFireCount: number;
    lastSeenPlayer: {
      x: number;
      y: number;
      z: number;
      timeS: number;
      zoneId: string | null;
      lane: "west" | "main" | "east";
      radiusM: number;
      confidence: number;
      sourceEnemyId?: string;
      source: "gunshot" | "footstep" | "visual" | "radio" | "hunt";
      kind?: "gunshot" | "footstep" | "visual" | "radio" | "hunt";
      precise: boolean;
      shared: boolean;
    } | null;
    lastHeardPlayer: {
      x: number;
      y: number;
      z: number;
      timeS: number;
      zoneId: string | null;
      lane: "west" | "main" | "east";
      radiusM: number;
      confidence: number;
      sourceEnemyId?: string;
      source: "gunshot" | "footstep" | "visual" | "radio" | "hunt";
      kind?: "gunshot" | "footstep" | "visual" | "radio" | "hunt";
      precise: boolean;
      shared: boolean;
    } | null;
    lastSpawn: {
      mode: "authored-fixed" | "adaptive";
      distanceFloorM: number | null;
      minDistanceToPlayerM: number | null;
      visibleCount: number;
      selectedNodeIds: string[];
      playerZoneId: string | null;
      usedAdjacentZoneFallback: boolean;
      usedVisibilityFallback: boolean;
      usedPlayerZoneEmergencyFallback: boolean;
      usedDistanceEmergencyFallback: boolean;
      correctedPlacements: number;
    } | null;
    enemies?: Array<{
      id: string;
      name: string;
      team: "player" | "enemy";
      role: "anchor" | "rifler" | "flanker" | "roamer";
      state: "HOLD" | "OVERWATCH" | "ROTATE" | "INVESTIGATE" | "PEEK" | "PRESSURE" | "FALLBACK" | "RELOAD";
      tier: number;
      health: number;
      reloading: boolean;
      mag: number;
      reserve: number;
      assignedNodeId: string | null;
      targetNodeId: string | null;
      memoryRemainingS: number;
      reactionRemainingS: number;
      burstShotsRemaining: number;
      debugReason: string;
      position: { x: number; y: number; z: number };
      movePoint: { x: number; z: number } | null;
      holdPoint: { x: number; z: number } | null;
      focusPoint: { x: number; y: number; z: number } | null;
      directSight: boolean;
      aimYawErrorDeg: number;
      directiveAgeS: number;
      targetNodeChangeCount: number;
      spawnValidation?: {
        spawnX: number;
        spawnY: number;
        spawnZ: number;
        actualZoneId: string | null;
        expectedZoneId: string | null;
        withinPlayableBounds: boolean;
        insideExpectedZone: boolean;
        blockingColliderIds: string[];
        elevated: boolean;
        valid: boolean;
        correctionKind: "none" | "same-lane-fallback" | "global-fallback";
        fallbackNodeId: string | null;
      } | null;
    }>;
  };
  landmarks: {
    visible: Array<{
      id: string;
      type: string;
      zone: string;
      distanceM: number;
      screenX: number;
      screenY: number;
    }>;
    nearest: {
      id: string;
      type: string;
      zone: string;
      distanceM: number;
    } | null;
  };
  assets: {
    floor: {
      requestedMode: string;
      activeMode: string;
      materialCount: number;
    };
    wall: {
      requestedMode: string;
      activeMode: string;
      materialCount: number;
    };
    props: {
      requestedVisualMode: string;
      activeVisualMode: string;
      modelCount: number;
    };
  };
  score: {
    current: number;
    best: number;
    lastRun?: number;
  };
  sharedChampion: SharedChampion | null;
  gameOver: {
    visible: boolean;
    finalScore: number;
    bestScore: number;
    canPlayAgain: boolean;
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
    combatFeedbackQueue: number;
    lastCombatFeedbackMs: number;
    lastKillFeedbackMs: number;
    orbCount: number;
    orbCapacity: number;
    orbSpawnMs: number;
    orbUpdateMs: number;
  };
};

export type PublicAgentRunSummary = {
  survivalTimeS: number;
  kills: number;
  headshots: number;
  shotsFired: number;
  shotsHit: number;
  accuracy: number;
  finalScore: number;
  bestScore: number;
  deathCause?: "enemy-fire" | "unknown";
};

export type PublicAgentObserveState = {
  apiVersion: number;
  contract: "public-agent-v1";
  mode: "loading-screen" | "runtime";
  runtimeReady: boolean;
  gameplay: {
    alive: boolean;
    gameOverVisible: boolean;
  };
  health: number | null;
  ammo:
    | {
        mag: number;
        reserve: number;
        reloading: boolean;
      }
    | null;
  score: {
    current: number;
    best: number;
    lastRun: number | null;
    scope: "browser-session";
  };
  sharedChampion: SharedChampion | null;
  lastRunSummary: PublicAgentRunSummary | null;
};

export type RuntimeHandle = {
  teardown: () => void;
  getRootElement: () => HTMLDivElement;
  beginReveal: () => void;
  activate: () => void;
};

export type RuntimeBootstrapOptions = {
  controlMode?: RuntimeControlMode;
  playerName?: string;
  warmup?: RuntimeWarmupAssets | null;
};

function getAppRoot(): HTMLElement {
  const app = document.querySelector<HTMLElement>("#app");
  if (!app) throw new Error("Missing #app mount root");
  return app;
}

function createRuntimeRoot(appRoot: HTMLElement): HTMLDivElement {
  const existing = appRoot.querySelector<HTMLDivElement>("#runtime-root");
  if (existing) {
    existing.style.position = "absolute";
    existing.style.inset = "0";
    existing.style.background = "#0b0b0b";
    existing.style.overflow = "hidden";
    existing.style.userSelect = "none";
    existing.style.opacity = "0";
    existing.style.pointerEvents = "none";
    existing.style.willChange = "opacity";
    existing.style.transition = "none";
    return existing;
  }

  const runtimeRoot = document.createElement("div");
  runtimeRoot.id = "runtime-root";
  runtimeRoot.style.position = "absolute";
  runtimeRoot.style.inset = "0";
  runtimeRoot.style.background = "#0b0b0b";
  runtimeRoot.style.overflow = "hidden";
  runtimeRoot.style.userSelect = "none";
  runtimeRoot.style.opacity = "0";
  runtimeRoot.style.pointerEvents = "none";
  runtimeRoot.style.willChange = "opacity";
  runtimeRoot.style.transition = "none";
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

function makeScoreStorageKey(mapId: string): string {
  return `${SCORE_STORAGE_PREFIX}:${mapId}:${SCORE_RULESET_KEY}`;
}

function normalizeScoreValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function splitOverlayMessages(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function findCurrentZone(spec: RuntimeBlockoutSpec | null, x: number, z: number): { id: string; type: string; label: string } | null {
  if (!spec) return null;

  let bestMatch: { id: string; type: string; label: string; area: number } | null = null;
  for (const zone of spec.zones) {
    const insideX = x >= zone.rect.x && x <= zone.rect.x + zone.rect.w;
    const insideZ = z >= zone.rect.y && z <= zone.rect.y + zone.rect.h;
    if (!insideX || !insideZ) continue;

    const area = zone.rect.w * zone.rect.h;
    if (!bestMatch || area < bestMatch.area) {
      bestMatch = {
        id: zone.id,
        type: zone.type,
        label: zone.label,
        area,
      };
    }
  }

  if (!bestMatch) return null;
  return {
    id: bestMatch.id,
    type: bestMatch.type,
    label: bestMatch.label,
  };
}

function isLandmarkAnchor(anchor: RuntimeAnchor): boolean {
  const normalized = anchor.type.toLowerCase();
  return normalized === "landmark" || normalized === "hero_landmark";
}

function collectLandmarkState(
  anchors: readonly RuntimeAnchor[] | null,
  camera: PerspectiveCamera,
  viewportWidth: number,
  viewportHeight: number,
): RuntimeTextState["landmarks"] {
  if (!anchors || anchors.length === 0) {
    return {
      visible: [],
      nearest: null,
    };
  }

  const scratch = new Vector3();
  const visible: RuntimeTextState["landmarks"]["visible"] = [];
  let nearest: RuntimeTextState["landmarks"]["nearest"] = null;

  for (const anchor of anchors) {
    if (!isLandmarkAnchor(anchor)) continue;

    const world = designToWorldVec3(anchor.pos);
    const dx = world.x - camera.position.x;
    const dy = world.y - camera.position.y;
    const dz = world.z - camera.position.z;
    const distanceM = Math.hypot(dx, dy, dz);

    if (!nearest || distanceM < nearest.distanceM) {
      nearest = {
        id: anchor.id,
        type: anchor.type,
        zone: anchor.zone,
        distanceM,
      };
    }

    scratch.set(world.x, world.y, world.z).project(camera);
    const inClipSpace = scratch.z >= -1 && scratch.z <= 1;
    const inViewport = Math.abs(scratch.x) <= 1 && Math.abs(scratch.y) <= 1;
    if (!inClipSpace || !inViewport) continue;

    visible.push({
      id: anchor.id,
      type: anchor.type,
      zone: anchor.zone,
      distanceM,
      screenX: ((scratch.x + 1) * 0.5) * viewportWidth,
      screenY: ((1 - scratch.y) * 0.5) * viewportHeight,
    });
  }

  visible.sort((a, b) => a.distanceM - b.distanceM || a.id.localeCompare(b.id));

  return {
    visible: visible.slice(0, 6),
    nearest,
  };
}

function readBestScore(storageKey: string): number {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (raw === null) return 0;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return 0;
    return normalizeScoreValue(parsed);
  } catch {
    return 0;
  }
}

function writeBestScore(storageKey: string, value: number): void {
  try {
    window.sessionStorage.setItem(storageKey, String(normalizeScoreValue(value)));
  } catch {
    // Ignore storage errors in constrained browser contexts.
  }
}

export async function bootstrapRuntime(options: RuntimeBootstrapOptions = {}): Promise<RuntimeHandle> {
  const appRoot = getAppRoot();
  const runtimeRoot = createRuntimeRoot(appRoot);
  const parsedUrlParams = parseRuntimeUrlParams(window.location.search);
  const controlMode = options.controlMode ?? parsedUrlParams.controlMode;
  const playerName = options.playerName ?? parsedUrlParams.playerName;
  if (!playerName) {
    throw new Error("Runtime requires a validated player name.");
  }
  const runtimeParams = {
    ...parsedUrlParams,
    controlMode,
    playerName,
  };
  const isLocalHostRuntime = isLocalhostHostname(window.location.hostname);
  const isLocalHumanRuntime = isLocalHostRuntime && runtimeParams.controlMode === "human";
  const effectiveUnlimitedHealth =
    isLocalHostRuntime && (isLocalHumanRuntime || runtimeParams.unlimitedHealth);
  const warmupAssets = options.warmup ?? null;
  const warmupTimedOut = warmupAssets?.timedOut === true;
  const performanceSafeFallback = warmupTimedOut;
  const bootStartedAtMs = performance.now();

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
  const perfHud = new PerfHud(runtimeRoot, runtimeParams.perf);
  const ammoHud = new AmmoHud(runtimeRoot);
  const healthHud = new HealthHud(runtimeRoot);
  healthHud.setGodModeEnabled(effectiveUnlimitedHealth);
  const hitVignette = new HitVignette(runtimeRoot);
  const deathScreen = new DeathScreen(runtimeRoot);
  const hitMarker = new HitMarker(crosshair);
  const scoreHud = new ScoreHud(runtimeRoot, runtimeParams.playerName);
  const killFeed = new KillFeed(runtimeRoot, {
    anchorEl: scoreHud.root,
    gapPx: 8,
  });
  const roundEndScreen = new RoundEndScreen(runtimeRoot);
  const timerHud = new TimerHud(runtimeRoot);
  const headshotBanner = new HeadshotBanner(runtimeRoot);
  const damageNumbers = new DamageNumbers(runtimeRoot);
  const pauseMenu = new PauseMenu(runtimeRoot);
  const howToPlayOverlay = new HowToPlayOverlay(runtimeRoot);
  const controlsOverlay = new ControlsOverlay(runtimeRoot);
  const fadeOverlay = new FadeOverlay(runtimeRoot);
  killFeed.prewarm(4);
  damageNumbers.prewarm(4);

  let mapLoaded = false;
  let mapErrorMessage: string | null = null;
  let shotActive = false;
  let shotId: string | null = null;
  let inputFrozen = false;
  let respawnInProgress = false;

  let mapAssets: RuntimeMapAssets | null = null;
  try {
    mapAssets = await loadMap(runtimeParams.mapId);
    mapLoaded = true;
  } catch (error) {
    mapErrorMessage = formatMapLoadError(error);
    errorOverlay.textContent = mapErrorMessage;
    errorOverlay.style.display = "block";
  }

  setEnemyVisualModelStreamingEnabled(
    !performanceSafeFallback && (warmupAssets?.enemyVisualsReady ?? true),
  );

  const mobile = isMobileDevice();
  const renderer = new Renderer(runtimeRoot, {
    highVis: runtimeParams.highVis,
    lightingPreset: runtimeParams.lightingPreset,
    ao: (performanceSafeFallback || mobile) ? false : runtimeParams.ao,
    maxPixelRatio: mobile ? 1.0 : undefined,
    disableShadows: mobile,
  });
  let disposed = false;
  let shadowWarmupFrames = 0;
  const weaponAudio = new WeaponAudio();
  weaponAudio.prewarmCombatFeedback();
  const viewModelEnabled = runtimeParams.vm && !performanceSafeFallback;
  let viewModel: ViewModelInstance | null = warmupAssets?.viewModel ?? null;
  let viewModelVisible = false;

  const appendWarning = (message: string): void => {
    if (warningOverlay.textContent && warningOverlay.textContent.length > 0) {
      warningOverlay.textContent = `${warningOverlay.textContent}\n${message}`;
    } else {
      warningOverlay.textContent = message;
    }
    warningOverlay.style.display = "block";
  };

  if (performanceSafeFallback) {
    appendWarning("Runtime warmup timed out. Using performance-safe fallback before spawn.");
  }
  if (warmupAssets && !warmupAssets.enemyVisualsReady) {
    appendWarning("Enemy model warmup failed. Using fallback enemy meshes to avoid late asset streaming.");
  }

  let resolvedFloorMode = PBR_FLOORS_ENABLED ? runtimeParams.floorMode : "blockout";
  if (performanceSafeFallback) {
    resolvedFloorMode = "blockout";
  }
  let floorMaterials: FloorMaterialLibrary | null = null;
  if (PBR_FLOORS_ENABLED && resolvedFloorMode === "pbr") {
    try {
      floorMaterials = warmupAssets?.floorMaterials ?? await FloorMaterialLibrary.load(FLOOR_MANIFEST_URL);
      await floorMaterials.preloadAllTextures(runtimeParams.floorQuality);
    } catch (error) {
      floorMaterials = null;
      resolvedFloorMode = "blockout";
      appendWarning(
        `Failed to load floor PBR pack. Falling back to blockout floors.\n${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  let resolvedWallMode = PBR_WALLS_ENABLED ? runtimeParams.wallMode : "blockout";
  if (performanceSafeFallback) {
    resolvedWallMode = "blockout";
  }
  let wallMaterials: WallMaterialLibrary | null = null;
  if (PBR_WALLS_ENABLED && resolvedWallMode === "pbr") {
    try {
      const wallQuality = runtimeParams.floorQuality === "1k" ? "1k" : "2k";
      wallMaterials = warmupAssets?.wallMaterials ?? await WallMaterialLibrary.load(WALL_MANIFEST_URL);
      await wallMaterials.preloadAllTextures(wallQuality);
    } catch (error) {
      wallMaterials = null;
      resolvedWallMode = "blockout";
      appendWarning(
        `Failed to load wall PBR pack. Falling back to blockout walls.\n${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  let resolvedPropVisuals = MAP_PROPS_ENABLED ? runtimeParams.propVisuals : "blockout";
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

  let doorModels: PropModelLibrary | null = null;
  if (DOOR_MODELS_ENABLED) {
    try {
      doorModels = await PropModelLibrary.load(DOOR_MANIFEST_URL);
    } catch (error) {
      appendWarning(
        `Failed to load door model pack. Doors will use flat void panels.\n${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (viewModelEnabled && viewModel) {
    viewModel.setAspect(renderer.getAspect());
  }
  if (viewModelEnabled && !viewModel) {
    try {
      const { Ak47ViewModel } = await import("./weapons/Ak47ViewModel");
      const nextViewModel = new Ak47ViewModel({
        vmDebug: runtimeParams.vmDebug && runtimeParams.debug,
      });
      nextViewModel.setAspect(renderer.getAspect());
      await nextViewModel.load();
      viewModel = nextViewModel;
    } catch (error: unknown) {
      const message = `Failed to load AK47 viewmodel\n${error instanceof Error ? error.message : String(error)}`;
      appendWarning(message);
      viewModel?.dispose();
      viewModel = null;
    }
  }

  const bootTelemetry = {
    revealPhase: "warming" as RevealPhase,
    warmupTimedOut,
    performanceSafeFallback,
    enemyVisualsReady: warmupAssets?.enemyVisualsReady ?? false,
    viewModelPrewarmed: Boolean(warmupAssets?.viewModel),
    hiddenWarmupRenderDone: false,
    precompiled: false,
    readyAtMs: null as number | null,
    readyTextureCount: null as number | null,
    textureStableAtMs: null as number | null,
    stableTextureCount: null as number | null,
    lateTextureGrowth: 0,
  };
  let trackedBootTextureCount: number | null = null;
  let lastBootTextureChangeAtMs: number | null = null;

  const markBootReady = (): void => {
    const now = performance.now();
    const perfInfo = renderer.getPerfInfo();
    bootTelemetry.readyAtMs = now - bootStartedAtMs;
    bootTelemetry.readyTextureCount = perfInfo.textures;
    if (bootTelemetry.textureStableAtMs === null) {
      bootTelemetry.textureStableAtMs = bootTelemetry.readyAtMs;
      bootTelemetry.stableTextureCount = perfInfo.textures;
    }
    trackedBootTextureCount = perfInfo.textures;
    lastBootTextureChangeAtMs = now;
  };

  const updateBootTextureTelemetry = (): void => {
    if (bootTelemetry.readyAtMs === null || bootTelemetry.textureStableAtMs !== null) return;

    const now = performance.now();
    const textureCount = renderer.getPerfInfo().textures;
    if (trackedBootTextureCount === null) {
      trackedBootTextureCount = textureCount;
      lastBootTextureChangeAtMs = now;
      return;
    }

    if (textureCount !== trackedBootTextureCount) {
      if (textureCount > trackedBootTextureCount) {
        bootTelemetry.lateTextureGrowth += textureCount - trackedBootTextureCount;
      }
      trackedBootTextureCount = textureCount;
      lastBootTextureChangeAtMs = now;
    }

    if (lastBootTextureChangeAtMs !== null && now - lastBootTextureChangeAtMs >= TEXTURE_STABLE_WINDOW_MS) {
      bootTelemetry.textureStableAtMs = now - bootStartedAtMs;
      bootTelemetry.stableTextureCount = trackedBootTextureCount;
    }
  };

  const waitForHiddenTextureStability = async (): Promise<void> => {
    const stableWindowStartMs = performance.now();
    let lastTextureCount = -1;
    let lastTextureChangeAtMs = stableWindowStartMs;

    while (performance.now() - stableWindowStartMs <= 2_000) {
      renderer.renderWithViewModel(
        game.scene,
        game.camera,
        viewModel?.viewModelScene ?? null,
        viewModel?.viewModelCamera ?? null,
        viewModelVisible,
      );

      const textureCount = renderer.getPerfInfo().textures;
      const now = performance.now();
      if (textureCount !== lastTextureCount) {
        lastTextureCount = textureCount;
        lastTextureChangeAtMs = now;
      }
      if (now - lastTextureChangeAtMs >= TEXTURE_STABLE_WINDOW_MS) {
        bootTelemetry.textureStableAtMs = now - bootStartedAtMs;
        bootTelemetry.stableTextureCount = textureCount;
        return;
      }

      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    }

    const perfInfo = renderer.getPerfInfo();
    bootTelemetry.textureStableAtMs = performance.now() - bootStartedAtMs;
    bootTelemetry.stableTextureCount = perfInfo.textures;
  };

  const resolvedShot = mapAssets ? resolveShot(mapAssets.shots, runtimeParams.shot) : null;
  shotActive = resolvedShot?.active ?? false;
  shotId = resolvedShot?.id ?? null;
  inputFrozen = resolvedShot?.freezeInput ?? false;

  let bulletHoles: BulletHoleManager | null = null;

  const game = new Game({
    controlMode: runtimeParams.controlMode,
    mapId: runtimeParams.mapId,
    seedOverride: runtimeParams.seed,
    propChaos: runtimeParams.propChaos,
    floorMode: resolvedFloorMode,
    wallMode: resolvedWallMode,
    wallDetails: runtimeParams.wallDetails,
    wallDetailDensity: runtimeParams.wallDetailDensity,
    floorQuality: runtimeParams.floorQuality,
    lightingPreset: runtimeParams.lightingPreset,
    floorMaterials,
    wallMaterials,
    propVisuals: resolvedPropVisuals,
    propModels,
    doorModels,
    freezeInput: inputFrozen,
    spawn: runtimeParams.spawn,
    debug: runtimeParams.debug,
    highVis: runtimeParams.highVis,
    mountEl: runtimeRoot,
    anchorsDebug: {
      showMarkers: runtimeParams.anchors,
      showLabels: runtimeParams.labels,
      anchorTypes: runtimeParams.anchorTypes,
    },
    onWeaponShot: (shot) => {
      viewModel?.triggerShotFx();
      weaponAudio.playAk47Shot();
      game.reportPlayerGunshot();
      waveStats.shotsFired++;
      runStats.shotsFired++;

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
          runStats.shotsHit++;
          game.applyDamageToEnemy(enemyHit.enemyId, damage, isHeadshot);
          enqueueCombatFeedback({ type: "hit", isHeadshot });
          enqueueCombatFeedback({
            type: "damage-number",
            worldPos: { x: enemyHit.hitX, y: enemyHit.hitY, z: enemyHit.hitZ },
            damage,
            isHeadshot,
          });
        } else if (shot.hitNormal) {
          // Bullet hit world surface (wall/floor/prop), not an enemy — spawn decal
          bulletHoles?.spawn(shot.hitPoint!, shot.hitNormal);
        }

        // Check if bullet hit a buff orb (pick up by shooting)
        const orbHit = buffManager.checkRaycastHit(
          camPos.x, camPos.y, camPos.z,
          camFwd.x, camFwd.y, camFwd.z,
          worldHitDist + 0.5,
        );
        if (orbHit.hit) {
          buffManager.collectOrbAtIndex(orbHit.orbIndex);
        }
      }
    },
    ...(isLocalHumanRuntime ? { playerRunSpeedMps: 9 } : {}),
    unlimitedHealth: effectiveUnlimitedHealth,
    ...(runtimeParams.debug ? { onTogglePerfHud: () => perfHud.toggle() } : {}),
  });

  // Bullet hole decals on world surfaces
  bulletHoles = new BulletHoleManager(game.scene, runtimeParams.seed ?? 1);

  // ── Buff system ─────────────────────────────────────────────────────────────
  const buffManager = new BuffManager(game.scene);
  const buffHud = new BuffHud(runtimeRoot);
  const buffTextHud = new BuffTextHud(runtimeRoot);
  const buffVignette = new BuffVignette(runtimeRoot);

  const resetAllBuffModifiers = (): void => {
    game.setPlayerSpeedMultiplier(1.0);
    game.setWeaponFireInterval(0.1);
    game.setWeaponReloadSpeed(1.0);
    game.setWeaponUnlimitedAmmo(false);
    game.setOvershield(0);
    buffVignette.clear();
  };

  const clearAllBuffRuntimeState = (): void => {
    buffManager.clearAllBuffs();
    resetAllBuffModifiers();
    buffHud.clear();
    buffTextHud.clear();
  };

  buffManager.setOnBuffActivated((type) => {
    switch (type) {
      case "speed_boost":
        game.setPlayerSpeedMultiplier(1.5);
        break;
      case "rapid_fire":
        game.setWeaponFireInterval(0.05);
        game.setWeaponReloadSpeed(2.0);
        break;
      case "unlimited_ammo":
        game.setWeaponUnlimitedAmmo(true);
        break;
      case "health_boost":
        game.setOvershield(50);
        break;
    }
    buffVignette.activate(type);
  });

  buffManager.setOnBuffExpired((type) => {
    switch (type) {
      case "speed_boost":
        game.setPlayerSpeedMultiplier(1.0);
        break;
      case "rapid_fire":
        game.setWeaponFireInterval(0.1);
        game.setWeaponReloadSpeed(1.0);
        break;
      case "unlimited_ammo":
        game.setWeaponUnlimitedAmmo(false);
        break;
      case "health_boost":
        game.setOvershield(0);
        break;
    }
    buffVignette.deactivate(type);
  });

  buffManager.setOnBuffPickedUp((type, result) => {
    if (result === "refreshed") {
      buffVignette.refresh(type);
    }
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
    onReloadCancel: () => weaponAudio.stopReload(),
    onDryFire: () => weaponAudio.playDryFire(),
  });

  // Pause menu: resume by re-requesting pointer lock (desktop) or just unfreezing (mobile)
  pauseMenu.onResume = () => {
    if (runtimeParams.controlMode === "human" && !mobile) {
      void renderer.canvas.requestPointerLock();
    }
  };
  if (mobile) {
    pauseMenu.setMobileMode(true);
  }
  pauseMenu.onReturnToLobby = () => {
    const lobbyUrl = `${window.location.origin}${window.location.pathname}`;
    window.location.href = lobbyUrl;
  };
  pauseMenu.onShowHowToPlay = () => {
    howToPlayOverlay.show();
  };
  pauseMenu.onShowControls = () => {
    controlsOverlay.show();
  };

  // Wire kill feed
  // Wire kill events → feed + ding + score counter
  const TOTAL_ENEMIES = ENEMIES_PER_WAVE;
  scoreHud.setTotal(TOTAL_ENEMIES);
  game.setEnemyKillCallback((name, isHeadshot, deathPos, enemyIndex) => {
    enqueueCombatFeedback({
      type: "kill",
      enemyName: name,
      isHeadshot,
    });
    buffManager.recordKill(isHeadshot);
    buffManager.onEnemyDeath(enemyIndex, deathPos);
  });

  // New wave → keep run score, but reset per-wave breakdowns and timing.
  game.setEnemyNewWaveCallback((_wave) => {
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

    // Buff system: check Rallying Cry, clear orbs
    buffManager.onNewWave();
    buffManager.clearOrbs();
    if (buffManager.checkRallyingCry()) {
      // Previous wave was 10/10 headshots — defer activation so player
      // sees the round-end screen disappear before buffs kick in
      pendingRallyingCry = true;
      rallyingCryDelayS = 0.5;
    }
  });

  // Death screen restart handler — fires on both click and auto-countdown.
  // Fade to black → reset the run → fade back in for a smooth transition.
  deathScreen.onRespawn = () => {
    respawnInProgress = true;
    fadeOverlay.fadeOut(0.18, () => {
      // Reset happens while the screen is black so the restart feels atomic.
      pendingAgentActions.length = 0;
      combatFeedbackQueue.length = 0;
      lastCombatFeedbackMs = 0;
      lastKillFeedbackMs = 0;
      game.restartRun();
      clearAllBuffRuntimeState();
      roundEndScreen.hide();
      roundEndShowing = false;
      pendingRallyingCry = false;
      rallyingCryDelayS = 0;
      killFeed.clear();
      headshotBanner.clear();
      hitMarker.clear();
      hitVignette.clear();
      damageNumbers.clear();
      bulletHoles?.clear();
      scoreHud.reset();
      sharedChampionFinalizedForCurrentRun = false;
      waveElapsedS = 0;
      timerHud.reset();
      timerHud.start();
      waveStats.kills = 0;
      waveStats.totalEnemies = TOTAL_ENEMIES;
      waveStats.shotsFired = 0;
      waveStats.shotsHit = 0;
      waveStats.headshots = 0;
      runStats.kills = 0;
      runStats.shotsFired = 0;
      runStats.shotsHit = 0;
      runStats.headshots = 0;
      runHeadshotsPerWave = [];
      runStartedAtMs = performance.now();
      lastDamageCause = null;
      previousHealth = game.getPlayerHealth();
      footstepTimerS = 0;
      wasAlive = true;
      beginSharedChampionRun();
      game.setFreezeInput(false);
      pauseMenu.hide();
      howToPlayOverlay.hide();
      controlsOverlay.hide();
      if (runtimeParams.controlMode === "human" && !mobile) {
        void renderer.canvas.requestPointerLock();
      }
      respawnInProgress = false;
      // Brief hold at black, then fade back in
      setTimeout(() => {
        fadeOverlay.fadeIn(0.3);
      }, 60);
    });
  };

  if (mapAssets) {
    game.setBlockoutSpec(mapAssets.blockout);
    game.setAnchorsSpec(mapAssets.anchors);
    shadowWarmupFrames = 0;
  }
  if (resolvedShot?.cameraPose) {
    game.setCameraPose(resolvedShot.cameraPose);
  }
  if (resolvedShot?.warning) {
    warningOverlay.textContent = resolvedShot.warning;
    warningOverlay.style.display = "block";
  }

  // Let any async map assignments resolve before we draw the first visible gameplay frame.
  await Promise.resolve();
  syncViewportNow();
  renderer.requestShadowUpdate();

  const overviewCameraAtBoot = game.camera.position.y > OVERVIEW_VIEWMODEL_DISABLE_HEIGHT_M;
  viewModelVisible = Boolean(viewModelEnabled && viewModel && !overviewCameraAtBoot);
  crosshair.style.display = overviewCameraAtBoot ? "none" : "block";
  ammoHud.setVisible(!overviewCameraAtBoot);
  healthHud.setVisible(!overviewCameraAtBoot);
  timerHud.setVisible(!overviewCameraAtBoot);

  if (viewModel) {
    viewModel.updateFromMainCamera(game.camera, 0);
    const weaponDebug = viewModel.getAlignmentSnapshot();
    game.setWeaponDebugSnapshot(weaponDebug.loaded, weaponDebug.dot, weaponDebug.angleDeg);
  } else {
    game.setWeaponDebugSnapshot(false, -1, 180);
  }

  renderStagedFrame();
  bootTelemetry.hiddenWarmupRenderDone = true;

  // Pre-warm buff orb materials so shader variants compile during warmup (not on first orb spawn)
  const disposeWarmupOrb = warmupOrbMaterials(game.scene, game.camera);

  try {
    if (syncViewportIfChanged()) {
      renderStagedFrame();
    }
    await renderer.compileSceneAsync(
      game.scene,
      game.camera,
      viewModel?.viewModelScene ?? null,
      viewModel?.viewModelCamera ?? null,
      viewModelVisible,
    );
    bootTelemetry.precompiled = true;
  } catch (error) {
    appendWarning(
      `Shader precompile failed. Continuing without compile warmup.\n${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Clean up warmup orb now that shaders are compiled
  disposeWarmupOrb();

  if (syncViewportIfChanged()) {
    renderStagedFrame();
  }
  await waitForHiddenTextureStability();
  markBootReady();
  bootTelemetry.revealPhase = "ready";

  let pointerLock: PointerLockController | null = null;
  let touchInput: TouchInputManager | null = null;
  let mobileTouchHud: MobileTouchHud | null = null;
  let mobileOrientationGuard: MobileOrientationGuard | null = null;

  if (mobile && !inputFrozen && runtimeParams.controlMode === "human") {
    // ── Mobile: touch controls instead of pointer lock ──────────────
    game.setMobileActive(true);
    touchInput = new TouchInputManager(runtimeRoot);
    mobileTouchHud = new MobileTouchHud(runtimeRoot, touchInput);
    mobileOrientationGuard = new MobileOrientationGuard(runtimeRoot);
    void mobileOrientationGuard.requestLandscape();

    // Pause button wiring
    mobileTouchHud.onPause = () => {
      if (game.getIsDead() || inputFrozen) return;
      if (pauseMenu.isVisible()) {
        pauseMenu.hide();
        pauseMenu.onResume?.();
      } else {
        pauseMenu.show();
      }
    };

    // Unlock audio on first touch (since there's no pointer lock gesture)
    const unlockAudioOnTouch = (): void => {
      weaponAudio.ensureResumedFromGesture();
      weaponAudio.startAmbient();
      runtimeRoot.removeEventListener("touchstart", unlockAudioOnTouch);
    };
    runtimeRoot.addEventListener("touchstart", unlockAudioOnTouch, { passive: true });

    // ── Scale all HUD elements for iPhone landscape ──────────────
    // Effective viewport: ~667x325 (SE) to ~932x380 (Pro Max)

    // Health: scale down, anchor bottom-left
    healthHud.root.style.bottom = `calc(8px + env(safe-area-inset-bottom, 0px))`;
    healthHud.root.style.left = `calc(8px + env(safe-area-inset-left, 0px))`;
    healthHud.root.style.transform = "scale(0.6)";
    healthHud.root.style.transformOrigin = "bottom left";

    // Ammo: scale down, anchor bottom-right above fire button
    ammoHud.root.style.bottom = `calc(100px + env(safe-area-inset-bottom, 0px))`;
    ammoHud.root.style.right = `calc(8px + env(safe-area-inset-right, 0px))`;
    ammoHud.root.style.transform = "scale(0.6)";
    ammoHud.root.style.transformOrigin = "bottom right";

    // Score: reduce width and scale significantly
    scoreHud.root.style.top = `calc(4px + env(safe-area-inset-top, 0px))`;
    scoreHud.root.style.right = `calc(4px + env(safe-area-inset-right, 0px))`;
    scoreHud.root.style.width = "220px";
    scoreHud.root.style.minWidth = "220px";
    scoreHud.root.style.transform = "scale(0.65)";
    scoreHud.root.style.transformOrigin = "top right";

    // Timer: scale and reposition
    timerHud.root.style.top = `calc(4px + env(safe-area-inset-top, 0px))`;
    timerHud.root.style.transform = "translateX(-50%) scale(0.7)";
    timerHud.root.style.transformOrigin = "top center";

    // Add touch-action: manipulation to root to prevent 300ms tap delay
    runtimeRoot.style.touchAction = "manipulation";

    // Show one-time fullscreen hint
    const fullscreenHint = new MobileFullscreenHint(runtimeRoot);
    fullscreenHint.show();
  } else if (!inputFrozen && runtimeParams.controlMode === "human") {
    // ── Desktop: pointer lock as before ─────────────────────────────
    pointerLock = new PointerLockController({
      lockEl: renderer.canvas,
      onLockChange: (locked) => {
        game.setPointerLocked(locked);
        if (locked) {
          pointerLockBannerGraceMs = POINTER_LOCK_BANNER_GRACE_MS;
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

  let runtimeActive = false;
  let runtimeLoopStarted = false;
  let runtimeBindingsAttached = false;
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
  let pendingRallyingCry = false;  // true when rallying cry should fire after delay
  let rallyingCryDelayS = 0;       // countdown before rallying cry activates

  // Per-wave stats counters (reset each new wave)
  const waveStats: RoundStats = {
    kills: 0,
    totalEnemies: TOTAL_ENEMIES,
    shotsFired: 0,
    shotsHit: 0,
    headshots: 0,
  };
  const runStats = {
    kills: 0,
    shotsFired: 0,
    shotsHit: 0,
    headshots: 0,
  };
  let runHeadshotsPerWave: number[] = [];
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
  const scoreStorageKey = makeScoreStorageKey(runtimeParams.mapId);
  let bestScore = readBestScore(scoreStorageKey);
  scoreHud.setBestScore(bestScore);
  let sharedChampionSnapshot: SharedChampionSnapshot = getSharedChampionSnapshot();
  let sharedChampionFinalizedForCurrentRun = false;
  const applySharedChampionSnapshot = (snapshot: SharedChampionSnapshot): void => {
    const nextChampion = shouldReplaceSharedChampion(sharedChampionSnapshot.champion, snapshot.champion)
      ? snapshot.champion
      : sharedChampionSnapshot.champion;
    sharedChampionSnapshot = {
      status: nextChampion ? "ready" : snapshot.status,
      champion: nextChampion,
    };
    scoreHud.setSharedChampion(sharedChampionSnapshot);
    deathScreen.setSharedChampion(sharedChampionSnapshot);
  };
  applySharedChampionSnapshot(sharedChampionSnapshot);
  void loadSharedChampion().then((snapshot) => {
    if (disposed) return;
    applySharedChampionSnapshot(snapshot);
  });
  let activeSharedChampionRun: SharedChampionRunSession | null = null;
  let sharedChampionRunRequestSerial = 0;
  const beginSharedChampionRun = (): void => {
    const requestSerial = ++sharedChampionRunRequestSerial;
    activeSharedChampionRun = null;
    void startSharedChampionRunSession({
      playerName: runtimeParams.playerName,
      controlMode: runtimeParams.controlMode,
      mapId: runtimeParams.mapId,
    }).then((session) => {
      if (disposed || requestSerial !== sharedChampionRunRequestSerial) return;
      activeSharedChampionRun = session;
    });
  };
  const finalizeSharedChampionForDeath = async (input: {
    lastRunScore: number;
    sharedChampionRunSummary: SharedChampionRunSummary;
    runSession: SharedChampionRunSession | null;
  }): Promise<void> => {
    const refreshed = await loadSharedChampionWithMeta({ force: true });
    if (!disposed) {
      applySharedChampionSnapshot(refreshed.snapshot);
    }

    const candidateScore = normalizeScore(input.lastRunScore);
    const shouldSubmitSharedChampion = !refreshed.loadedFromNetwork
      || refreshed.snapshot.status === "idle"
      || refreshed.snapshot.status === "loading"
      || refreshed.snapshot.status === "unavailable"
      || isBetterSharedChampionCandidate(refreshed.snapshot.champion, candidateScore);

    if (!shouldSubmitSharedChampion || !input.runSession) {
      return;
    }

    const { snapshot } = await submitSharedChampionRunSession(input.runSession, input.sharedChampionRunSummary);
    if (disposed) return;
    applySharedChampionSnapshot(snapshot);
  };
  let lastRunScore: number | null = null;
  let lastRunSummary: PublicAgentRunSummary | null = null;
  let runStartedAtMs = performance.now();
  let lastDamageCause: PublicAgentRunSummary["deathCause"] | null = null;
  let wasAlive = !game.getIsDead();
  beginSharedChampionRun();
  const pendingAgentActions: AgentAction[] = [];
  const isInternalDebugSurface = import.meta.env.DEV || isLocalHostRuntime;
  const applyQueuedAgentActions = (): void => {
    if (pendingAgentActions.length === 0) return;
    if (runtimeParams.controlMode === "agent") {
      for (const action of pendingAgentActions) {
        game.applyAgentAction(action);
      }
    }
    pendingAgentActions.length = 0;
  };
  const combatFeedbackQueue: QueuedCombatFeedbackEvent[] = [];
  let lastCombatFeedbackMs = 0;
  let lastKillFeedbackMs = 0;
  const debugFeedbackForwardScratch = new Vector3();
  const debugBuffForwardScratch = new Vector3();
  const enqueueCombatFeedback = (event: QueuedCombatFeedbackEvent): void => {
    combatFeedbackQueue.push(event);
  };
  const enqueueDebugCombatFeedback = (payload: DebugCombatFeedbackPayload): void => {
    const isHeadshot = payload.isHeadshot === true;
    const didKill = payload.didKill === true;
    const damage = Math.max(0, payload.damage ?? (isHeadshot ? 100 : 25));
    const enemyName = payload.enemyName?.trim() || "DebugTarget";

    game.camera.getWorldDirection(debugFeedbackForwardScratch);
    const worldPos = {
      x: game.camera.position.x + debugFeedbackForwardScratch.x * 8,
      y: game.camera.position.y + debugFeedbackForwardScratch.y * 8,
      z: game.camera.position.z + debugFeedbackForwardScratch.z * 8,
    };

    enqueueCombatFeedback({ type: "hit", isHeadshot });
    enqueueCombatFeedback({
      type: "damage-number",
      worldPos,
      damage,
      isHeadshot,
    });
    if (didKill) {
      enqueueCombatFeedback({
        type: "kill",
        enemyName,
        isHeadshot,
      });
    }
  };
  const drainCombatFeedback = (): void => {
    if (combatFeedbackQueue.length === 0) {
      lastCombatFeedbackMs = 0;
      lastKillFeedbackMs = 0;
      return;
    }

    const queued = combatFeedbackQueue.splice(0, combatFeedbackQueue.length);
    const feedbackStartedAtMs = performance.now();
    let killFeedbackMs = 0;

    for (const event of queued) {
      switch (event.type) {
        case "hit": {
          if (event.isHeadshot) {
            headshotBanner.trigger();
          }
          hitMarker.trigger(event.isHeadshot);
          weaponAudio.playHitThud();
          break;
        }
        case "damage-number": {
          damageNumbers.spawn(event.worldPos, game.camera, event.damage, event.isHeadshot);
          break;
        }
        case "kill": {
          const killStartedAtMs = performance.now();
          killFeed.addKill(runtimeParams.playerName, event.enemyName, event.isHeadshot);
          weaponAudio.playKillDing();
          const waveIndex = Math.floor(runStats.kills / TOTAL_ENEMIES); // before increment
          scoreHud.recordKill({ isHeadshot: event.isHeadshot });
          waveStats.kills++;
          runStats.kills++;
          if (event.isHeadshot) {
            waveStats.headshots++;
            runStats.headshots++;
            while (runHeadshotsPerWave.length <= waveIndex) {
              runHeadshotsPerWave.push(0);
            }
            runHeadshotsPerWave[waveIndex] = (runHeadshotsPerWave[waveIndex] ?? 0) + 1;
          }
          killFeedbackMs += performance.now() - killStartedAtMs;
          break;
        }
      }
    }

    lastCombatFeedbackMs = performance.now() - feedbackStartedAtMs;
    lastKillFeedbackMs = killFeedbackMs;
  };

  const state = (): RuntimeTextState => {
    const yawPitch = game.getYawPitchDeg();
    const playerPosition = game.getPlayerPosition();
    const playerVelocity = game.getPlayerVelocity();
    const playerCollision = game.getPlayerCollisionState();
    const botDebug = game.getBotDebugSnapshot();
    const currentZone = findCurrentZone(mapAssets?.blockout ?? null, playerPosition.x, playerPosition.z);
    const warningMessages = splitOverlayMessages(warningOverlay.textContent);
    const landmarkState = collectLandmarkState(
      mapAssets?.anchors.anchors ?? null,
      game.camera,
      renderer.getWidth(),
      renderer.getHeight(),
    );
    const alive = !game.getIsDead();
    const pointerLocked = game.isPointerLocked();
    const currentScore = scoreHud.getScore();
    const finalScore = lastRunScore ?? currentScore;
    const gameOverVisible = deathScreen.isVisible();
    const visibility = document.visibilityState === "hidden" ? "hidden" : "visible";
    const buffPerf = buffManager.getPerfSnapshot();
    return {
      apiVersion: RUNTIME_TEXT_API_VERSION,
      mode: "runtime",
      map: {
        loaded: mapLoaded,
        mapId: runtimeParams.mapId,
        seed: game.getPropsBuildStats().seed,
        spawn: runtimeParams.spawn,
        highVis: runtimeParams.highVis,
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
      render: {
        webgl: renderer.hasWebGL,
        viewport: {
          width: renderer.getWidth(),
          height: renderer.getHeight(),
        },
        warnings: warningMessages,
      },
      boot: {
        ...bootTelemetry,
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
          aspect: game.camera.aspect,
        },
      },
      gameplay: {
        active: runtimeActive && mapLoaded,
        alive,
        pointerLocked,
        focused: document.hasFocus(),
        visibility,
        inputFrozen,
        grounded: game.getGrounded(),
        speedMps: game.getSpeedMps(),
      },
      agent: {
        enabled: runtimeParams.controlMode === "agent",
        name: runtimeParams.controlMode === "agent" ? runtimeParams.playerName : "",
      },
      player: {
        name: runtimeParams.playerName,
        pos: playerPosition,
        vel: playerVelocity,
        withinPlayableBounds: game.isPlayerWithinPlayableBounds(),
        zoneId: currentZone?.id ?? null,
        zoneType: currentZone?.type ?? null,
        zoneLabel: currentZone?.label ?? null,
        collision: playerCollision,
      },
      bots: {
        waveNumber: game.getWaveNumber(),
        waveElapsedS: game.getWaveElapsedS(),
        tier: botDebug?.tier ?? 0,
        aliveCount: botDebug?.aliveCount ?? 0,
        graphNodeCount: botDebug?.graphNodeCount ?? 0,
        searchPhase: botDebug?.searchPhase ?? "caution",
        topSearchZones: botDebug?.topSearchZones ?? [],
        squadTasks: botDebug?.squadTasks ?? [],
        roleCounts: botDebug?.roleCounts ?? {
          anchor: 0,
          rifler: 0,
          flanker: 0,
          roamer: 0,
        },
        preventedFriendlyFireCount: botDebug?.preventedFriendlyFireCount ?? 0,
        lastSeenPlayer: botDebug?.lastSeenPlayer ?? null,
        lastHeardPlayer: botDebug?.lastHeardPlayer ?? null,
        lastSpawn: botDebug?.lastSpawn ?? null,
        ...(runtimeParams.debug && botDebug ? { enemies: botDebug.enemies } : {}),
      },
      landmarks: landmarkState,
      assets: {
        floor: {
          requestedMode: runtimeParams.floorMode,
          activeMode: resolvedFloorMode,
          materialCount: floorMaterials?.getMaterialIds().length ?? 0,
        },
        wall: {
          requestedMode: runtimeParams.wallMode,
          activeMode: resolvedWallMode,
          materialCount: wallMaterials?.getMaterialIds().length ?? 0,
        },
        props: {
          requestedVisualMode: runtimeParams.propVisuals,
          activeVisualMode: resolvedPropVisuals,
          modelCount: 0,
        },
      },
      score: {
        current: currentScore,
        best: bestScore,
        ...(lastRunScore !== null ? { lastRun: lastRunScore } : {}),
      },
      sharedChampion: sharedChampionSnapshot.champion,
      gameOver: {
        visible: gameOverVisible,
        finalScore,
        bestScore,
        canPlayAgain: gameOverVisible,
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
        combatFeedbackQueue: combatFeedbackQueue.length,
        lastCombatFeedbackMs,
        lastKillFeedbackMs,
        orbCount: buffPerf.orbCount,
        orbCapacity: buffPerf.orbCapacity,
        orbSpawnMs: buffPerf.orbSpawnMs,
        orbUpdateMs: buffPerf.orbUpdateMs,
      },
    };
  };

  const publicObserveState = (): PublicAgentObserveState => {
    const alive = !game.getIsDead();
    const ammoSnapshot = game.getAmmoSnapshot();
    return {
      apiVersion: PUBLIC_AGENT_API_VERSION,
      contract: PUBLIC_AGENT_CONTRACT,
      mode: "runtime",
      runtimeReady: runtimeActive && mapLoaded,
      gameplay: {
        alive,
        gameOverVisible: deathScreen.isVisible(),
      },
      health: Math.max(0, Math.round(game.getPlayerHealth())),
      ammo: {
        mag: Math.max(0, Math.floor(ammoSnapshot.mag)),
        reserve: Math.max(0, Math.floor(ammoSnapshot.reserve)),
        reloading: ammoSnapshot.reloading,
      },
      score: {
        current: normalizeScoreValue(scoreHud.getScore()),
        best: normalizeScoreValue(bestScore),
        lastRun: lastRunScore === null ? null : normalizeScoreValue(lastRunScore),
        scope: "browser-session",
      },
      sharedChampion: sharedChampionSnapshot.champion,
      lastRunSummary,
    };
  };

  function syncViewportNow(): void {
    renderer.resize();
    game.setAspect(renderer.getAspect());
    game.setViewportSize(renderer.getWidth(), renderer.getHeight());
    viewModel?.setAspect(renderer.getAspect());
  }

  function syncViewportIfChanged(): boolean {
    const nextWidth = Math.max(1, runtimeRoot.clientWidth || window.innerWidth);
    const nextHeight = Math.max(1, runtimeRoot.clientHeight || window.innerHeight);
    if (renderer.getWidth() === nextWidth && renderer.getHeight() === nextHeight) {
      return false;
    }
    syncViewportNow();
    return true;
  }

  function renderStagedFrame(): void {
    renderer.renderWithViewModel(
      game.scene,
      game.camera,
      viewModel?.viewModelScene ?? null,
      viewModel?.viewModelCamera ?? null,
      viewModelVisible,
    );
  }

  function onResize(): void {
    syncViewportNow();
    mobileOrientationGuard?.check();
    mobileTouchHud?.relayout();
  }

  const step = (deltaMs: number, options: { renderFrame?: boolean } = {}): void => {
    const clampedMs = Math.min(Math.max(deltaMs, 0), 100);
    const dt = clampedMs / 1000;
    const renderFrame = options.renderFrame ?? true;
    applyQueuedAgentActions();

    // Feed mobile touch input before game update
    if (touchInput) {
      game.feedMobileInput({
        moveX: touchInput.moveX,
        moveZ: touchInput.moveZ,
        lookDeltaX: touchInput.lookDeltaX,
        lookDeltaY: touchInput.lookDeltaY,
        fire: touchInput.fireHeld,
        jump: touchInput.jumpQueued,
        reload: touchInput.reloadQueued,
        crouch: touchInput.crouchHeld,
      });
      touchInput.consumeFrame();

      // Update button visual feedback
      mobileTouchHud?.updateFireVisual(touchInput.fireHeld);
      mobileTouchHud?.updateCrouchVisual(touchInput.crouchHeld);

      // Hide touch controls during death/pause
      const touchVisible = !game.getIsDead() && !pauseMenu.isVisible();
      mobileTouchHud?.setVisible(touchVisible);
    }

    // Freeze game input when pause menu, overlays, or orientation guard are open (death-freeze is managed inside Game.ts)
    if (pauseMenu.isVisible() || howToPlayOverlay.isVisible() || controlsOverlay.isVisible() || mobileOrientationGuard?.isBlocking()) {
      game.setFreezeInput(true);
    } else if (!game.getIsDead() && !inputFrozen) {
      game.setFreezeInput(false);
    }
    game.update(dt);
    drainCombatFeedback();

    const aliveNow = !game.getIsDead();
    if (!aliveNow && wasAlive) {
      lastRunScore = normalizeScoreValue(scoreHud.getScore());
      const nextBestScore = Math.max(bestScore, lastRunScore);
      const deathCause = lastDamageCause ?? "unknown";
      const accuracy = runStats.shotsFired > 0
        ? Math.round(((runStats.shotsHit / runStats.shotsFired) * 100) * 10) / 10
        : 0;
      // Pad headshotsPerWave to expected length (waves with 0 headshots)
      const expectedWaves = runStats.kills > 0 ? Math.ceil(runStats.kills / TOTAL_ENEMIES) : 0;
      while (runHeadshotsPerWave.length < expectedWaves) {
        runHeadshotsPerWave.push(0);
      }
      const sharedChampionRunSummary: SharedChampionRunSummary = {
        survivalTimeS: Math.round((Math.max(0, performance.now() - runStartedAtMs) / 1000) * 10) / 10,
        kills: runStats.kills,
        headshots: runStats.headshots,
        headshotsPerWave: [...runHeadshotsPerWave],
        shotsFired: runStats.shotsFired,
        shotsHit: runStats.shotsHit,
        accuracy,
        finalScore: lastRunScore,
        deathCause,
      };
      lastRunSummary = {
        survivalTimeS: sharedChampionRunSummary.survivalTimeS,
        kills: sharedChampionRunSummary.kills,
        headshots: sharedChampionRunSummary.headshots,
        shotsFired: sharedChampionRunSummary.shotsFired,
        shotsHit: sharedChampionRunSummary.shotsHit,
        accuracy: sharedChampionRunSummary.accuracy,
        finalScore: sharedChampionRunSummary.finalScore,
        bestScore: normalizeScoreValue(nextBestScore),
        deathCause,
      };
      if (lastRunScore > bestScore) {
        bestScore = lastRunScore;
        writeBestScore(scoreStorageKey, bestScore);
        scoreHud.setBestScore(bestScore);
      }
      if (!sharedChampionFinalizedForCurrentRun) {
        sharedChampionFinalizedForCurrentRun = true;
        const runSession = activeSharedChampionRun;
        activeSharedChampionRun = null;
        void finalizeSharedChampionForDeath({
          lastRunScore,
          sharedChampionRunSummary,
          runSession,
        });
      }
    }
    wasAlive = aliveNow;
    updateBootTextureTelemetry();

    // ── Health tracking & hit vignette ───────────────────────────────────────
    const currentHealth = game.getPlayerHealth();
    if (currentHealth < previousHealth) {
      hitVignette.triggerHit(previousHealth - currentHealth);
      lastDamageCause = "enemy-fire";
    }
    previousHealth = currentHealth;
    hitVignette.setHealth(currentHealth);

    // ── Footstep audio ───────────────────────────────────────────────────────
    const grounded = game.getGrounded();
    const speedMps = game.getSpeedMps();
    if (grounded && speedMps > 0.5) {
      footstepTimerS -= dt;
      if (footstepTimerS <= 0) {
        footstepTimerS = speedMps > 4.5 ? 0.45 : 0.65;
        weaponAudio.playFootstep(Math.min(1, speedMps / 6.0));
        game.reportPlayerFootstep(speedMps);
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
    if (game.getIsDead() && !deathScreen.isVisible() && !respawnInProgress) {
      deathScreen.show({
        playerName: runtimeParams.playerName,
        finalScore: scoreHud.getScore(),
        bestScore,
      });
    }

    const overviewCamera = game.camera.position.y > OVERVIEW_VIEWMODEL_DISABLE_HEIGHT_M;
    viewModelVisible = Boolean(viewModelEnabled && viewModel && !overviewCamera);
    crosshair.style.display = overviewCamera ? "none" : "block";
    ammoHud.setVisible(!overviewCamera);
    healthHud.setVisible(!overviewCamera);
    timerHud.setVisible(!overviewCamera);
    if (!overviewCamera) {
      ammoHud.update(game.getAmmoSnapshot());
      const overshield = game.getOvershield();
      healthHud.update({ health: currentHealth + overshield, maxHealth: overshield > 0 ? 150 : 100 }, dt);
    }

    // ── Deferred Rallying Cry activation ──────────────────────────────────────
    if (pendingRallyingCry && !roundEndShowing) {
      rallyingCryDelayS -= dt;
      if (rallyingCryDelayS <= 0) {
        pendingRallyingCry = false;
        buffManager.activateRallyingCry();
      }
    }

    // ── Buff system per-frame update ──────────────────────────────────────────
    buffManager.update(dt, game.getPlayerPosition(), game.camera);
    const activeBuffs = buffManager.getActiveBuffs();
    const rcActive = buffManager.isRallyingCryActive();
    buffHud.update({ buffs: activeBuffs, rallyingCryActive: rcActive }, dt);
    buffTextHud.update(activeBuffs, rcActive);
    buffVignette.setRallyingCry(rcActive);
    buffVignette.update(dt);

    // Update pause menu and overlays
    pauseMenu.update(dt);
    howToPlayOverlay.update(dt);
    controlsOverlay.update(dt);

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
    scoreHud.update(dt);
    killFeed.update(dt);
    headshotBanner.update(dt);
    hitMarker.update(dt);
    damageNumbers.update(dt);
    bulletHoles?.update(dt);

    if (renderFrame && viewModel) {
      viewModel.setFrameInput(speedMps, grounded, swayMouseDeltaX, swayMouseDeltaY);
      swayMouseDeltaX = 0;
      swayMouseDeltaY = 0;
      viewModel.updateFromMainCamera(game.camera, dt);
      const weaponDebug = viewModel.getAlignmentSnapshot();
      game.setWeaponDebugSnapshot(weaponDebug.loaded, weaponDebug.dot, weaponDebug.angleDeg);
    } else {
      swayMouseDeltaX = 0;
      swayMouseDeltaY = 0;
      game.setWeaponDebugSnapshot(false, -1, 180);
    }

    if (renderFrame && shadowWarmupFrames > 0) {
      renderer.requestShadowUpdate();
      shadowWarmupFrames -= 1;
    }

    if (renderFrame) {
      renderer.renderWithViewModel(
        game.scene,
        game.camera,
        viewModel?.viewModelScene ?? null,
        viewModel?.viewModelCamera ?? null,
        viewModelVisible,
      );
    }

    if (renderFrame && perfHud.isVisible()) {
      perfMsPerFrame = perfMsPerFrame * 0.9 + clampedMs * 0.1;
      perfFps = 1000 / Math.max(0.01, perfMsPerFrame);
      const buffPerf = buffManager.getPerfSnapshot();

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
        debugEnabled: runtimeParams.debug,
        orbCount: buffPerf.orbCount,
        orbCapacity: buffPerf.orbCapacity,
        orbSpawnMs: buffPerf.orbSpawnMs,
        orbUpdateMs: buffPerf.orbUpdateMs,
      });
    } else if (renderFrame) {
      // Sample immediately when the HUD is re-enabled.
      scenePerfSampleElapsed = PERF_SCENE_SAMPLE_INTERVAL_MS;
    }
  };

  const advanceSimulation = (ms: number, options: { renderFrame?: boolean } = {}): void => {
    const frameMs = 1000 / 60;
    let remaining = Math.max(0, ms);

    if (remaining === 0) {
      step(0, options);
      return;
    }

    while (remaining > 0) {
      const nextStep = Math.min(frameMs, remaining);
      step(nextStep, options);
      remaining -= nextStep;
    }
  };

  let lastAgentRenderTime = 0;
  let hiddenAgentTimerId: number | null = null;
  const isAgentHiddenLowPowerMode = (): boolean =>
    runtimeParams.controlMode === "agent" && document.visibilityState === "hidden";
  const stopHiddenAgentLoop = (): void => {
    if (hiddenAgentTimerId === null) return;
    window.clearTimeout(hiddenAgentTimerId);
    hiddenAgentTimerId = null;
  };
  const scheduleHiddenAgentLoop = (): void => {
    stopHiddenAgentLoop();
    if (!isAgentHiddenLowPowerMode() || disposed) return;

    hiddenAgentTimerId = window.setTimeout(() => {
      hiddenAgentTimerId = null;
      if (disposed || !isAgentHiddenLowPowerMode()) return;
      advanceSimulation(AGENT_BACKGROUND_STEP_INTERVAL_MS, { renderFrame: false });
      scheduleHiddenAgentLoop();
    }, AGENT_BACKGROUND_STEP_INTERVAL_MS);
  };
  const onVisibilityModeChange = (): void => {
    previousFrameTime = performance.now();
    lastAgentRenderTime = 0;
    // Reset mobile touch state — browser drops touch events when app is backgrounded
    touchInput?.resetState();
    if (isAgentHiddenLowPowerMode()) {
      scheduleHiddenAgentLoop();
      return;
    }
    stopHiddenAgentLoop();
  };

  const animate = (time: number): void => {
    if (disposed) return;
    if (isAgentHiddenLowPowerMode()) {
      previousFrameTime = time;
      rafId = window.requestAnimationFrame(animate);
      return;
    }

    const deltaMs = time - previousFrameTime;
    previousFrameTime = time;
    const shouldRender = runtimeParams.controlMode !== "agent"
      || lastAgentRenderTime === 0
      || time - lastAgentRenderTime >= AGENT_VISIBLE_RENDER_INTERVAL_MS;
    step(deltaMs, { renderFrame: shouldRender });
    if (shouldRender) {
      lastAgentRenderTime = time;
    }
    rafId = window.requestAnimationFrame(animate);
  };

  // Escape key toggles pause menu (when pointer lock is NOT held by the browser)
  const onKeyDownPause = (e: KeyboardEvent): void => {
    if (runtimeParams.controlMode !== "human") return;
    if (e.code !== "Escape") return;
    if (game.getIsDead()) return; // ignore Esc on death screen
    if (inputFrozen) return;
    // If how-to-play or controls overlay is open, close it (pause menu stays visible)
    if (howToPlayOverlay.isVisible()) {
      howToPlayOverlay.hide();
      howToPlayOverlay.onClose?.();
      return;
    }
    if (controlsOverlay.isVisible()) {
      controlsOverlay.hide();
      controlsOverlay.onClose?.();
      return;
    }
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

  const attachRuntimeBindings = (): void => {
    if (runtimeBindingsAttached) return;
    runtimeBindingsAttached = true;
    if (!mobile) {
      window.addEventListener("keydown", onKeyDownPause);
    }
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibilityModeChange);
    pointerLock?.init();
    touchInput?.init();
    mobileOrientationGuard?.check();
  };

  const beginReveal = (): void => {
    if (disposed) return;
    if (bootTelemetry.revealPhase === "active") return;
    if (syncViewportIfChanged()) {
      renderStagedFrame();
    }
    bootTelemetry.revealPhase = "revealing";
  };

  const activate = (): void => {
    if (disposed || runtimeActive) return;
    if (syncViewportIfChanged()) {
      renderStagedFrame();
    }
    runtimeActive = true;
    runtimeRoot.style.pointerEvents = "auto";
    bootTelemetry.revealPhase = "active";
    attachRuntimeBindings();
    previousFrameTime = performance.now();
    lastAgentRenderTime = 0;
    onVisibilityModeChange();
    timerHud.start();
    if (!runtimeLoopStarted) {
      runtimeLoopStarted = true;
      rafId = window.requestAnimationFrame(animate);
    }
  };

  window.agent_apply_action = (action: AgentAction) => {
    const normalized = normalizeAgentAction(action);
    if (!normalized) return;
    pendingAgentActions.push(normalized);
  };
  window.agent_observe = () => JSON.stringify(publicObserveState());
  window.render_game_to_text = () => JSON.stringify(isInternalDebugSurface ? state() : publicObserveState());
  window.advanceTime = async (ms: number) => {
    if (!runtimeActive) return;
    advanceSimulation(ms, {
      renderFrame: runtimeParams.controlMode !== "agent" || document.visibilityState === "visible",
    });
  };
  if (isInternalDebugSurface) {
    window.__debug_emit_combat_feedback = (payload: DebugCombatFeedbackPayload) => {
      enqueueDebugCombatFeedback(payload);
    };
    window.__debug_trigger_hit_vignette = (damage = 25) => {
      hitVignette.triggerHit(damage);
    };
    window.__debug_eliminate_all_bots = () => game.eliminateAllEnemiesForDebug();
    window.__debug_set_buff_orbs = (payload: DebugBuffOrbPayload) => {
      game.camera.getWorldDirection(debugBuffForwardScratch);
      return buffManager.debugSetOrbCount(
        Math.max(0, Math.floor(payload.count ?? 0)),
        game.getPlayerPosition(),
        debugBuffForwardScratch,
      );
    };
    window.__debug_set_buff_vignette = (payload: DebugBuffVignettePayload = {}) => {
      const action = payload.action ?? (payload.type ? "activate" : "clear");
      const exclusive = payload.exclusive !== false;
      const readState = () => {
        buffVignette.setRallyingCry(buffManager.isRallyingCryActive());
        buffVignette.update(0);
        return {
          buffs: buffManager.getActiveBuffs().map((buff) => buff.type),
          rallyingCryActive: buffManager.isRallyingCryActive(),
          visual: buffVignette.getDebugState(),
        };
      };
      const clearDebugState = (): void => {
        pendingRallyingCry = false;
        rallyingCryDelayS = 0;
        clearAllBuffRuntimeState();
      };

      if (action === "clear") {
        clearDebugState();
        return readState();
      }

      const requestedType = payload.type;
      if (requestedType === "rallying_cry") {
        if (action === "deactivate") {
          clearDebugState();
          return readState();
        }
        if (exclusive) {
          clearDebugState();
        }
        buffManager.activateRallyingCry();
        return readState();
      }
      if (!requestedType || !isDebugBuffType(requestedType)) {
        return readState();
      }

      if (action === "deactivate") {
        buffManager.debugDeactivateBuff(requestedType);
        return readState();
      }

      if (exclusive) {
        clearDebugState();
      }
      const result = buffManager.debugActivateBuff(requestedType);
      if (result === "refreshed") {
        buffVignette.refresh(requestedType);
      }
      return readState();
    };
    window.__debug_set_player_pose = (payload: { x: number; y: number; z: number; yawDeg?: number }) => {
      const yawRad = typeof payload.yawDeg === "number" ? (payload.yawDeg * Math.PI) / 180 : undefined;
      game.debugSetPlayerPose({ x: payload.x, y: payload.y, z: payload.z }, yawRad);
    };
    window.__debug_reset_bot_knowledge = () => {
      game.resetBotKnowledgeForDebug();
    };
    window.__debug_suppress_bot_intel_ms = (durationMs: number) => {
      game.suppressBotIntelForDebug(durationMs);
    };
  }

  const teardown = (): void => {
    if (disposed) return;
    disposed = true;
    sharedChampionRunRequestSerial += 1;
    activeSharedChampionRun = null;

    window.cancelAnimationFrame(rafId);
    stopHiddenAgentLoop();
    window.removeEventListener("resize", onResize);
    window.removeEventListener("pagehide", teardown);
    window.removeEventListener("beforeunload", teardown);
    document.removeEventListener("visibilitychange", onVisibilityModeChange);
    delete window.agent_apply_action;
    delete window.agent_observe;
    delete window.render_game_to_text;
    delete window.advanceTime;
    delete window.__debug_emit_combat_feedback;
    delete window.__debug_trigger_hit_vignette;
    delete window.__debug_eliminate_all_bots;
    delete window.__debug_set_buff_orbs;
    delete window.__debug_set_buff_vignette;
    delete window.__debug_set_player_pose;
    delete window.__debug_reset_bot_knowledge;
    delete window.__debug_suppress_bot_intel_ms;

    pointerLock?.dispose();
    touchInput?.dispose();
    mobileTouchHud?.dispose();
    mobileOrientationGuard?.dispose();
    game.teardown();
    weaponAudio.dispose();
    perfHud.dispose();
    ammoHud.dispose();
    healthHud.dispose();
    buffManager.dispose();
    buffHud.dispose();
    buffTextHud.dispose();
    buffVignette.dispose();
    hitVignette.dispose();
    deathScreen.dispose();
    killFeed.dispose();
    headshotBanner.dispose();
    hitMarker.dispose();
    scoreHud.dispose();
    roundEndScreen.dispose();
    timerHud.dispose();
    damageNumbers.dispose();
    pauseMenu.dispose();
    howToPlayOverlay.dispose();
    controlsOverlay.dispose();
    fadeOverlay.dispose();
    if (!mobile) {
      window.removeEventListener("keydown", onKeyDownPause);
    }
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

  return {
    teardown,
    getRootElement: () => runtimeRoot,
    beginReveal,
    activate,
  };
}
