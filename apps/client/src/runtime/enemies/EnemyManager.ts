import { Scene, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { AK47_AUDIO_TUNING, type WeaponAudio } from "../audio/WeaponAudio";
import type { RuntimeAnchorsSpec, RuntimeBlockoutSpec, RuntimeBlockoutZone } from "../map/types";
import { PLAYER_EYE_HEIGHT_M, PLAYER_HEIGHT_M, PLAYER_WIDTH_M } from "../sim/PlayerController";
import { intersectsAabb, setAabbFromFootPosition, type MutableAabb } from "../sim/collision/Aabb";
import { rayVsAabb } from "../sim/collision/rayVsAabb";
import type { WorldColliderEntry, WorldColliders } from "../sim/collision/WorldColliders";
import { DeterministicRng, deriveSubSeed, resolveRuntimeSeed } from "../utils/Rng";
import type { RuntimeSpawnId } from "../utils/UrlParams";
import {
  EnemyController,
  ENEMY_EYE_HEIGHT_M,
  ENEMY_HEIGHT_M,
  ENEMY_HALF_WIDTH_M,
  clampEnemyTier,
  resolveEnemyTierProfile,
  type EnemyAabb,
  type EnemyDebugSnapshot,
  type EnemyDirective,
  type EnemyId,
  type EnemyRole,
  type EnemyState,
  type EnemyTarget,
} from "./EnemyController";
import { EnemyVisual } from "./EnemyVisual";
import {
  buildTacticalGraph,
  findZoneForPoint,
  findNearestTacticalNode,
  findTacticalPath,
  type TacticalGraph,
  type TacticalLane,
  type TacticalNode,
} from "./TacticalGraph";
import { createLineOfSightScratch, hasLineOfSight } from "./enemyLineOfSight";

const PLAYER_HALF_WIDTH_M = PLAYER_WIDTH_M * 0.5;
const FIXED_SPAWN_JITTER_M = 1.5;
const ADAPTIVE_SPAWN_JITTER_M = 0.75;
const WAVE_RESPAWN_DELAY_S = 5.0;
const SCORE_IMPROVEMENT_THRESHOLD = 0.75;
const LONG_SIGHT_OVERWATCH_RANGE_M = 18;
const HUNT_MIN_OVERWATCH_RANGE_M = 1.8;
const GUNSHOT_HEAR_RANGE_M = 44;
const FOOTSTEP_HEAR_RANGE_M = 22;
const ADAPTIVE_RESPAWN_DISTANCE_FLOORS_M = [26, 24, 22, 20, 18] as const;
const ADAPTIVE_RESPAWN_EMERGENCY_DISTANCE_M = 0;
const ADAPTIVE_RESPAWN_MAX_VISIBLE_BOTS = 1;
const ADAPTIVE_RESPAWN_TIGHT_CLUSTER_M = 4;
const ADAPTIVE_RESPAWN_NEAR_CLUSTER_M = 7;
const INITIAL_SPAWN_MIN_PER_LANE = 2;
const INITIAL_SPAWN_TARGET_PER_LANE = 3;
const INITIAL_SPAWN_MAX_PER_LANE = 4;
const SPAWN_MIN_SEPARATION_M = ENEMY_HALF_WIDTH_M * 2 + 0.02;
const LIVE_BOT_MIN_SEPARATION_M = ENEMY_HALF_WIDTH_M * 2;
const LIVE_BOT_DEPENETRATION_PASSES = 3;
const TACTICAL_LANES: readonly TacticalLane[] = ["west", "main", "east"] as const;
const WALKABLE_ZONE_TYPES = new Set(["spawn_plaza", "main_lane_segment", "side_hall", "connector", "cut"]);
const SPAWN_SEARCH_DIRECTIONS = [
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
  { x: 0, z: -1 },
  { x: Math.SQRT1_2, z: Math.SQRT1_2 },
  { x: -Math.SQRT1_2, z: Math.SQRT1_2 },
  { x: -Math.SQRT1_2, z: -Math.SQRT1_2 },
  { x: Math.SQRT1_2, z: -Math.SQRT1_2 },
] as const;
const SPAWN_SEARCH_RING_FACTORS = [0, 0.35, 0.7, 1] as const;
const SPAWN_ZONE_MARGIN_M = ENEMY_HALF_WIDTH_M + 0.05;
const SPAWN_BOUNDS_MARGIN_M = ENEMY_HALF_WIDTH_M + 0.05;
const SPAWN_ELEVATION_EPSILON_M = 0.05;

/** Hunt pressure: forces increasingly aggressive behavior over time to prevent stalling. */
const HUNT_ACTIVATION_S = 10;
const HUNT_FULL_S = 30;

const STATE_COMMIT_S: Record<EnemyState, number> = {
  HOLD: 1.0,
  OVERWATCH: 1.0,
  ROTATE: 0.75,
  INVESTIGATE: 0.75,
  PEEK: 0.9,
  PRESSURE: 0.6,
  FALLBACK: 0.8,
  RELOAD: 0.8,
};

export const ENEMIES_PER_WAVE = 10;

const ENEMY_SPAWN_CONFIG = [
  { name: "Ghost", x: 4.75, z: 20 },
  { name: "Viper", x: 45.25, z: 20 },
  { name: "Wolf", x: 27, z: 41 },
  { name: "Raven", x: 4.75, z: 45 },
  { name: "Hawk", x: 45.25, z: 45 },
  { name: "Cobra", x: 25, z: 59 },
  { name: "Panther", x: 4.75, z: 60 },
  { name: "Fox", x: 45.25, z: 60 },
  { name: "Eagle", x: 25, z: 75 },
  { name: "Lynx", x: 20, z: 75 },
] as const;

const ROLE_TEMPLATE: readonly EnemyRole[] = [
  "anchor",
  "anchor",
  "rifler",
  "rifler",
  "rifler",
  "rifler",
  "flanker",
  "flanker",
  "roamer",
  "roamer",
] as const;

if (ENEMY_SPAWN_CONFIG.length !== ENEMIES_PER_WAVE) {
  throw new Error(`[enemy-manager] ENEMY_SPAWN_CONFIG length ${ENEMY_SPAWN_CONFIG.length} does not match ENEMIES_PER_WAVE ${ENEMIES_PER_WAVE}`);
}

if (ROLE_TEMPLATE.length !== ENEMIES_PER_WAVE) {
  throw new Error(`[enemy-manager] ROLE_TEMPLATE length ${ROLE_TEMPLATE.length} does not match ENEMIES_PER_WAVE ${ENEMIES_PER_WAVE}`);
}

type ContactSource = "visual" | "footstep" | "gunshot" | "radio" | "hunt";

type BlackboardContact = {
  x: number;
  y: number;
  z: number;
  timeS: number;
  zoneId: string | null;
  lane: TacticalLane;
  radiusM: number;
  confidence: number;
  sourceEnemyId?: string;
  source: ContactSource;
  kind?: ContactSource;
  precise: boolean;
  shared: boolean;
};

type BlackboardState = {
  lastSeenPlayer: BlackboardContact | null;
  lastHeardPlayer: BlackboardContact | null;
  occupiedNodeIds: Map<string, string>;
  assignedRoleByEnemyId: Map<string, EnemyRole>;
  roleRankByEnemyId: Map<string, number>;
  currentTier: number;
};

type NodeSelection = {
  node: TacticalNode | null;
  score: number;
};

type DirectiveMemory = {
  state: EnemyState;
  targetNodeId: string | null;
  score: number;
  startedAtS: number;
  commitUntilS: number;
  hadDirectSight: boolean;
};

type PressureProfile = {
  normalized: number;
  overwatchRangeM: number;
  flankBudget: number;
  sharedTrust: number;
  collapseWeight: number;
  commitScale: number;
  certaintyFloor: number;
  radioDelayScale: number;
  overdueCollapseS: number;
  searchRadiusBonusM: number;
  fullHunt: boolean;
};

type SharedContactReport = {
  targetEnemyId: string;
  deliverAtS: number;
  contact: BlackboardContact;
};

type SpawnRequest = {
  mode: "initial" | "respawn";
  playerPos?: { x: number; y: number; z: number } | null;
  playerSpawnId?: RuntimeSpawnId;
};

type SpawnPlacement = {
  spawnX: number;
  spawnZ: number;
  nodeId: string | null;
  zoneId: string | null;
  lane: TacticalLane | null;
  nodeType: TacticalNode["nodeType"] | "authored";
  distanceToPlayerM: number | null;
  visibleToPlayer: boolean;
};

type SpawnFootprint = Pick<SpawnPlacement, "spawnX" | "spawnZ">;

type FinalizedSpawnPlacement = SpawnPlacement & {
  spawnDebug: EnemySpawnDebugSnapshot;
};

type SpawnValidation = {
  valid: boolean;
  withinPlayableBounds: boolean;
  insideExpectedZone: boolean;
  actualZoneId: string | null;
  expectedZoneId: string | null;
  blockingColliderIds: string[];
};

type SpawnResolution = {
  spawnX: number;
  spawnZ: number;
  zoneId: string | null;
  searchDistanceM: number;
  validation: SpawnValidation;
};

type SpawnSearchOptions = {
  expectedZoneId?: string | null;
  requireWalkableZone: boolean;
  occupiedPlacements?: readonly SpawnFootprint[];
};

type SpawnCorrectionKind = "none" | "same-lane-fallback" | "global-fallback";

type EnemySpawnDebugSnapshot = {
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
  correctionKind: SpawnCorrectionKind;
  fallbackNodeId: string | null;
};

type AdaptiveSpawnCandidate = SpawnPlacement & {
  node: TacticalNode;
  nodeId: string;
  zoneId: string;
  lane: TacticalLane;
  nodeType: TacticalNode["nodeType"];
  distanceToPlayerM: number;
};

type RespawnPhase = {
  distanceFloorM: number;
  allowAdjacentZones: boolean;
  allowPlayerZone: boolean;
  maxVisibleBots: number;
};

type SearchPhase = "caution" | "probe" | "sweep" | "collapse" | "pinch";

type SearchBelief = {
  zoneId: string;
  lane: TacticalLane;
  x: number;
  z: number;
  score: number;
  reason: string;
  phase: SearchPhase;
  taskKind: SquadTask["kind"];
};

type ZoneSearchState = {
  zoneId: string;
  belief: number;
  reason: string;
  lastClearedAtS: number | null;
  lastAssignedAtS: number | null;
  lastAssignedEnemyId: string | null;
};

type SquadTask = {
  enemyId: string;
  kind: "hold" | "clear" | "contain" | "flank";
  zoneId: string;
  lane: TacticalLane;
  reason: string;
};

type ScoringMode = "caution" | "search" | "contain" | "collapse";

export type EnemySpawnTelemetry = {
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
};

export type EnemyHitResult =
  | { hit: true; enemyId: string; distance: number; hitX: number; hitY: number; hitZ: number }
  | { hit: false };

export type EnemyManagerDebugSnapshot = {
  waveNumber: number;
  waveElapsedS: number;
  tier: number;
  aliveCount: number;
  graphNodeCount: number;
  searchPhase: SearchPhase;
  topSearchZones: Array<{
    zoneId: string;
    score: number;
    reason: string;
    lastClearedAgeS: number | null;
  }>;
  squadTasks: SquadTask[];
  roleCounts: Record<EnemyRole, number>;
  lastSeenPlayer: BlackboardContact | null;
  lastHeardPlayer: BlackboardContact | null;
  occupiedNodeIds: string[];
  preventedFriendlyFireCount: number;
  lastSpawn: EnemySpawnTelemetry | null;
  enemies: EnemyDebugSnapshot[];
};

const NO_RESPAWN_BLOCKERS: readonly EnemyAabb[] = [];

function distanceSq(aX: number, aZ: number, bX: number, bZ: number): number {
  const dx = aX - bX;
  const dz = aZ - bZ;
  return dx * dx + dz * dz;
}

function distanceM(aX: number, aZ: number, bX: number, bZ: number): number {
  return Math.hypot(aX - bX, aZ - bZ);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function laneFromPosition(x: number): TacticalLane {
  if (x <= 14.5) return "west";
  if (x >= 35.5) return "east";
  return "main";
}

function safeCopyContact(contact: BlackboardContact | null): BlackboardContact | null {
  if (!contact) return null;
  return { ...contact };
}

function safeCopySpawnTelemetry(telemetry: EnemySpawnTelemetry | null): EnemySpawnTelemetry | null {
  if (!telemetry) return null;
  return {
    ...telemetry,
    selectedNodeIds: [...telemetry.selectedNodeIds],
  };
}

function zoneCenter(zone: { rect: { x: number; y: number; w: number; h: number } }): { x: number; z: number } {
  return {
    x: zone.rect.x + zone.rect.w * 0.5,
    z: zone.rect.y + zone.rect.h * 0.5,
  };
}

function createLaneUsageMap(): Map<TacticalLane, number> {
  return new Map(TACTICAL_LANES.map((lane) => [lane, 0]));
}

function zoneSearchSeedReason(phase: SearchPhase, source: string): string {
  return `${phase}:${source}`;
}

export function resolveEnemyTier(waveNumber: number, waveElapsedS: number): number {
  const baseTier = Math.min(Math.max(0, Math.floor((waveNumber - 1) / 2) + 1), 4);
  const timeBonus = (waveElapsedS >= 30 ? 1 : 0) + (waveElapsedS >= 60 ? 1 : 0);
  return clampEnemyTier(baseTier + timeBonus);
}

export class EnemyManager {
  private readonly scene: Scene;
  private readonly sharedLoader: GLTFLoader;
  private controllers: EnemyController[] = [];
  private visuals: EnemyVisual[] = [];
  private weaponAudio: WeaponAudio | null = null;
  private onEnemyKilled: ((name: string, isHeadshot: boolean) => void) | null = null;

  private readonly deathFadeStarted = new Set<number>();
  private waveNumber = 0;
  private waveRespawnTimer: number | null = null;
  private waveElapsedS = 0;
  private worldCollidersRef: WorldColliders | null = null;
  private onNewWave: ((wave: number) => void) | null = null;
  private tacticalGraph: TacticalGraph | null = null;
  private tacticalMapId = "bazaar-map";
  private lastSpawnTelemetry: EnemySpawnTelemetry | null = null;
  private searchPhase: SearchPhase = "caution";
  private assumedPlayerSpawnZoneId: string | null = null;
  private debugPlayerIntelSuppressedUntilS = 0;

  private readonly aabbScratch: EnemyAabb[] = [];
  private readonly targetPool: EnemyTarget[];
  private readonly targetsScratch: EnemyTarget[] = [];
  private currentPlayerHeightM = PLAYER_HEIGHT_M;
  private currentPlayerEyeHeightM = PLAYER_EYE_HEIGHT_M;
  private readonly playerAabb: EnemyAabb = {
    id: "player",
    minX: 0,
    minY: 0,
    minZ: 0,
    maxX: 0,
    maxY: 0,
    maxZ: 0,
  };
  private readonly spawnValidationAabb: MutableAabb = {
    minX: 0,
    minY: 0,
    minZ: 0,
    maxX: 0,
    maxY: 0,
    maxZ: 0,
  };
  private readonly spawnCollisionScratch: WorldColliderEntry[] = [];
  private playerHealthDelta = 0;
  private preventedFriendlyFireCount = 0;
  private readonly spawnDebugByEnemyId = new Map<string, EnemySpawnDebugSnapshot>();

  private readonly blackboard: BlackboardState = {
    lastSeenPlayer: null,
    lastHeardPlayer: null,
    occupiedNodeIds: new Map<string, string>(),
    assignedRoleByEnemyId: new Map<string, EnemyRole>(),
    roleRankByEnemyId: new Map<string, number>(),
    currentTier: 0,
  };

  private readonly lastDirectiveByEnemyId = new Map<string, EnemyDirective>();
  private readonly directiveMemoryByEnemyId = new Map<string, DirectiveMemory>();
  private readonly localKnowledgeByEnemyId = new Map<string, BlackboardContact>();
  private readonly sharedKnowledgeByEnemyId = new Map<string, BlackboardContact>();
  private readonly pendingSharedReports: SharedContactReport[] = [];
  private readonly zoneSearchStateByZoneId = new Map<string, ZoneSearchState>();
  private readonly squadTaskByEnemyId = new Map<string, SquadTask>();
  private readonly respawnLosScratch = createLineOfSightScratch();

  constructor(scene: Scene) {
    this.scene = scene;
    this.sharedLoader = new GLTFLoader();
    this.targetPool = Array.from({ length: ENEMIES_PER_WAVE + 1 }, () => ({
      id: "",
      team: "enemy",
      position: { x: 0, y: 0, z: 0 },
      health: 0,
    }));
    this.targetPool[0]!.id = "player";
    this.targetPool[0]!.team = "player";
  }

  private readonly handleEnemyShot = (targetId: string, damage: number): void => {
    this.resolveEnemyShot(targetId, damage);
  };

  private readonly handleFootstep = (distanceToPlayer: number): void => {
    const audio = this.weaponAudio;
    if (!audio) return;
    const distNorm = Math.min(1, distanceToPlayer / 20);
    audio.playEnemyFootstep(distNorm);
  };

  setAudio(audio: WeaponAudio): void {
    this.weaponAudio = audio;
  }

  setKillCallback(cb: (name: string, isHeadshot: boolean) => void): void {
    this.onEnemyKilled = cb;
  }

  setNewWaveCallback(cb: (wave: number) => void): void {
    this.onNewWave = cb;
  }

  setTacticalContext(blockout: RuntimeBlockoutSpec, anchors: RuntimeAnchorsSpec | null): void {
    this.tacticalMapId = blockout.mapId;
    this.tacticalGraph = buildTacticalGraph(blockout, anchors);
    this.initializeSearchState();
  }

  getWaveNumber(): number {
    return this.waveNumber;
  }

  getWaveElapsedS(): number {
    return this.waveElapsedS;
  }

  getDebugSnapshot(): EnemyManagerDebugSnapshot {
    const roleCounts: Record<EnemyRole, number> = {
      anchor: 0,
      rifler: 0,
      flanker: 0,
      roamer: 0,
    };
    const topSearchZones = Array.from(this.zoneSearchStateByZoneId.values())
      .sort((a, b) => b.belief - a.belief || a.zoneId.localeCompare(b.zoneId))
      .slice(0, 5)
      .map((zone) => ({
        zoneId: zone.zoneId,
        score: Number(zone.belief.toFixed(3)),
        reason: zone.reason,
        lastClearedAgeS: zone.lastClearedAtS === null ? null : Number((this.waveElapsedS - zone.lastClearedAtS).toFixed(2)),
      }));
    const squadTasks = Array.from(this.squadTaskByEnemyId.values())
      .sort((a, b) => a.enemyId.localeCompare(b.enemyId))
      .map((task) => ({ ...task }));
    const enemies = this.controllers
      .filter((controller) => !controller.isDead())
      .map((controller) => ({
        ...controller.getDebugSnapshot(),
        spawnValidation: this.spawnDebugByEnemyId.get(controller.id) ?? null,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const enemy of enemies) {
      roleCounts[enemy.role] += 1;
    }

    return {
      waveNumber: this.waveNumber,
      waveElapsedS: this.waveElapsedS,
      tier: this.blackboard.currentTier,
      aliveCount: enemies.length,
      graphNodeCount: this.tacticalGraph?.nodes.length ?? 0,
      searchPhase: this.searchPhase,
      topSearchZones,
      squadTasks,
      roleCounts,
      lastSeenPlayer: safeCopyContact(this.blackboard.lastSeenPlayer),
      lastHeardPlayer: safeCopyContact(this.blackboard.lastHeardPlayer),
      occupiedNodeIds: Array.from(this.blackboard.occupiedNodeIds.keys()).sort((a, b) => a.localeCompare(b)),
      preventedFriendlyFireCount: this.preventedFriendlyFireCount,
      lastSpawn: safeCopySpawnTelemetry(this.lastSpawnTelemetry),
      enemies,
    };
  }

  allDead(): boolean {
    return this.controllers.length > 0 && this.controllers.every((controller) => controller.isDead());
  }

  getWaveCountdownS(): number | null {
    return this.waveRespawnTimer;
  }

  spawn(worldColliders: WorldColliders, request: SpawnRequest = { mode: "initial" }): void {
    this.worldCollidersRef = worldColliders;
    this.waveNumber += 1;
    this.waveRespawnTimer = null;
    this.waveElapsedS = 0;
    this.playerHealthDelta = 0;
    this.preventedFriendlyFireCount = 0;
    this.deathFadeStarted.clear();
    this.blackboard.lastSeenPlayer = null;
    this.blackboard.lastHeardPlayer = null;
    this.blackboard.occupiedNodeIds.clear();
    this.blackboard.currentTier = 0;
    this.lastDirectiveByEnemyId.clear();
    this.directiveMemoryByEnemyId.clear();
    this.localKnowledgeByEnemyId.clear();
    this.sharedKnowledgeByEnemyId.clear();
    this.pendingSharedReports.length = 0;
    this.squadTaskByEnemyId.clear();
    this.spawnDebugByEnemyId.clear();
    this.assumedPlayerSpawnZoneId = request.mode === "initial" && request.playerPos
      ? this.resolveRequestedPlayerSpawnZoneId(request.playerPos, request.playerSpawnId)
      : null;
    this.searchPhase = "caution";
    this.debugPlayerIntelSuppressedUntilS = 0;
    this.initializeSearchState();

    if (
      this.controllers.length > 0 &&
      (this.controllers.length !== ENEMIES_PER_WAVE || this.visuals.length !== ENEMIES_PER_WAVE)
    ) {
      this.dispose(this.scene);
    }

    const mapSeed = resolveRuntimeSeed(this.tacticalMapId, null);
    const waveSeed = deriveSubSeed(mapSeed, `wave_${this.waveNumber}`);
    const spawnBatch =
      request.mode === "respawn" && this.waveNumber > 1 && request.playerPos
        ? this.resolveAdaptiveRespawnPlacements(worldColliders, request.playerPos, waveSeed) ?? this.resolveFixedSpawnPlacements(worldColliders, request.playerPos)
        : request.mode === "initial" && request.playerPos
          ? this.resolveInitialSpawnPlacements(worldColliders, request.playerPos, request.playerSpawnId, waveSeed) ?? this.resolveFixedSpawnPlacements(worldColliders, request.playerPos)
          : this.resolveFixedSpawnPlacements(worldColliders, null);
    const finalizedSpawnBatch = this.finalizeSpawnPlacements(
      spawnBatch,
      worldColliders,
      request.playerPos ?? null,
    );
    this.lastSpawnTelemetry = finalizedSpawnBatch.telemetry;

    if (this.controllers.length === 0) {
      for (let i = 0; i < ENEMIES_PER_WAVE; i += 1) {
        const config = ENEMY_SPAWN_CONFIG[i]!;
        const placement = finalizedSpawnBatch.placements[i]!;
        const id: EnemyId = `enemy_${config.name.toLowerCase()}`;
        const seed = deriveSubSeed(waveSeed, id);
        const controller = new EnemyController(id, config.name, placement.spawnX, placement.spawnZ, seed);
        const visual = new EnemyVisual(config.name, this.scene, this.sharedLoader);
        this.controllers.push(controller);
        this.visuals.push(visual);
        this.spawnDebugByEnemyId.set(id, placement.spawnDebug);
      }
    } else {
      for (let i = 0; i < ENEMIES_PER_WAVE; i += 1) {
        const placement = finalizedSpawnBatch.placements[i]!;
        const controller = this.controllers[i]!;
        const visual = this.visuals[i]!;
        const seed = deriveSubSeed(waveSeed, controller.id);
        controller.reset(placement.spawnX, placement.spawnZ, seed);
        visual.reset();
        this.spawnDebugByEnemyId.set(controller.id, placement.spawnDebug);
      }
    }

    this.assignRoles(waveSeed);
  }

  reportPlayerGunshot(position: { x: number; y: number; z: number }): void {
    if (this.isPlayerIntelSuppressed()) return;
    this.reportHeardContact(position, "gunshot", GUNSHOT_HEAR_RANGE_M, 5.2, 0.72);
  }

  reportPlayerFootstep(position: { x: number; y: number; z: number }, speedMps: number): void {
    if (this.isPlayerIntelSuppressed()) return;
    if (speedMps <= 0.4) return;
    const speedFactor = clamp01((speedMps - 0.4) / 4);
    this.reportHeardContact(position, "footstep", FOOTSTEP_HEAR_RANGE_M + speedFactor * 8, 4.2 + speedFactor * 2.4, 0.58 + speedFactor * 0.14);
  }

  private assignRoles(waveSeed: number): void {
    this.blackboard.assignedRoleByEnemyId.clear();
    this.blackboard.roleRankByEnemyId.clear();

    const rng = new DeterministicRng(deriveSubSeed(waveSeed, "roles"));
    const indices = this.controllers.map((_, index) => index);
    for (let i = indices.length - 1; i > 0; i -= 1) {
      const swapIndex = rng.int(0, i + 1);
      const current = indices[i]!;
      indices[i] = indices[swapIndex]!;
      indices[swapIndex] = current;
    }

    const roleRanks: Record<EnemyRole, number> = {
      anchor: 0,
      rifler: 0,
      flanker: 0,
      roamer: 0,
    };

    for (let i = 0; i < indices.length; i += 1) {
      const controller = this.controllers[indices[i]!]!;
      const role = ROLE_TEMPLATE[i] ?? "rifler";
      this.blackboard.assignedRoleByEnemyId.set(controller.id, role);
      this.blackboard.roleRankByEnemyId.set(controller.id, roleRanks[role]);
      roleRanks[role] += 1;
    }
  }

  private resolveFixedSpawnPlacements(
    worldColliders: WorldColliders,
    playerPos: { x: number; y: number; z: number } | null,
  ): { placements: SpawnPlacement[]; telemetry: EnemySpawnTelemetry } {
    const placements: SpawnPlacement[] = [];

    for (const config of ENEMY_SPAWN_CONFIG) {
      const resolution = this.resolveSafeSpawnPoint(
        config.x,
        config.z,
        FIXED_SPAWN_JITTER_M,
        worldColliders,
        {
          requireWalkableZone: true,
          occupiedPlacements: placements,
        },
      );
      const spawnX = resolution?.spawnX ?? config.x;
      const spawnZ = resolution?.spawnZ ?? config.z;
      const zoneId = resolution?.zoneId ?? this.findWalkableZoneIdForPoint(spawnX, spawnZ);
      const distanceToPlayerM = playerPos ? distanceM(spawnX, spawnZ, playerPos.x, playerPos.z) : null;
      placements.push({
        spawnX,
        spawnZ,
        nodeId: null,
        zoneId,
        lane: zoneId ? laneFromPosition(spawnX) : null,
        nodeType: "authored" as const,
        distanceToPlayerM,
        visibleToPlayer: false,
      });
    }

    return {
      placements,
      telemetry: {
        mode: "authored-fixed",
        distanceFloorM: null,
        minDistanceToPlayerM: null,
        visibleCount: 0,
        selectedNodeIds: [],
        playerZoneId: null,
        usedAdjacentZoneFallback: false,
        usedVisibilityFallback: false,
        usedPlayerZoneEmergencyFallback: false,
        usedDistanceEmergencyFallback: false,
        correctedPlacements: 0,
      },
    };
  }

  private resolveInitialSpawnPlacements(
    worldColliders: WorldColliders,
    playerPos: { x: number; y: number; z: number },
    playerSpawnId: RuntimeSpawnId | undefined,
    waveSeed: number,
  ): { placements: SpawnPlacement[]; telemetry: EnemySpawnTelemetry } | null {
    const candidates = this.buildSpawnCandidates(worldColliders, playerPos);
    if (!candidates || candidates.length < ENEMIES_PER_WAVE) {
      return null;
    }

    const playerZoneId = this.resolveRequestedPlayerSpawnZoneId(playerPos, playerSpawnId);
    const mapMidZ = (worldColliders.playableBounds.minZ + worldColliders.playableBounds.maxZ) * 0.5;
    const playerStartsSouth = playerSpawnId ? playerSpawnId === "A" : playerPos.z <= mapMidZ;
    const oppositeSideCandidates = candidates.filter((candidate) => {
      if (!this.isStrictlyHiddenInitialCandidate(candidate, playerPos, worldColliders)) return false;
      if (playerZoneId && candidate.zoneId === playerZoneId) return false;
      return playerStartsSouth ? candidate.spawnZ > mapMidZ : candidate.spawnZ < mapMidZ;
    });

    if (oppositeSideCandidates.length < ENEMIES_PER_WAVE) {
      return null;
    }

    const laneTargets = this.buildInitialLaneTargets(oppositeSideCandidates);
    if (!laneTargets) {
      return null;
    }

    const placements = this.pickInitialSpawnSet(oppositeSideCandidates, laneTargets, waveSeed);
    if (!placements) {
      return null;
    }

    const minDistanceToPlayerM = placements.reduce((best, placement) => Math.min(best, placement.distanceToPlayerM), Number.POSITIVE_INFINITY);
    const visibleCount = placements.reduce((count, placement) => count + (placement.visibleToPlayer ? 1 : 0), 0);

    return {
      placements,
      telemetry: {
        mode: "adaptive",
        distanceFloorM: null,
        minDistanceToPlayerM: Number.isFinite(minDistanceToPlayerM) ? minDistanceToPlayerM : null,
        visibleCount,
        selectedNodeIds: placements.map((placement) => placement.nodeId),
        playerZoneId,
        usedAdjacentZoneFallback: false,
        usedVisibilityFallback: false,
        usedPlayerZoneEmergencyFallback: false,
        usedDistanceEmergencyFallback: false,
        correctedPlacements: 0,
      },
    };
  }

  private resolveAdaptiveRespawnPlacements(
    worldColliders: WorldColliders,
    playerPos: { x: number; y: number; z: number },
    waveSeed: number,
  ): { placements: SpawnPlacement[]; telemetry: EnemySpawnTelemetry } | null {
    const candidates = this.buildSpawnCandidates(worldColliders, playerPos);
    if (!candidates || candidates.length < ENEMIES_PER_WAVE) {
      return null;
    }

    for (const phase of this.buildAdaptiveRespawnPhases()) {
      const playerZone = findZoneForPoint(this.tacticalGraph, playerPos.x, playerPos.z);
      const adjacentZones = new Set<string>(playerZone ? this.tacticalGraph?.zoneAdjacency.get(playerZone.id) ?? [] : []);
      const placements = this.pickAdaptiveRespawnSet(candidates, phase, playerZone?.id ?? null, adjacentZones, waveSeed);
      if (!placements) continue;

      const minDistanceToPlayerM = placements.reduce((best, placement) => Math.min(best, placement.distanceToPlayerM), Number.POSITIVE_INFINITY);
      const visibleCount = placements.reduce((count, placement) => count + (placement.visibleToPlayer ? 1 : 0), 0);

      return {
        placements,
        telemetry: {
          mode: "adaptive",
          distanceFloorM: phase.distanceFloorM,
          minDistanceToPlayerM: Number.isFinite(minDistanceToPlayerM) ? minDistanceToPlayerM : null,
          visibleCount,
          selectedNodeIds: placements.map((placement) => placement.nodeId),
          playerZoneId: playerZone?.id ?? null,
          usedAdjacentZoneFallback: phase.allowAdjacentZones,
          usedVisibilityFallback: phase.maxVisibleBots > 0,
          usedPlayerZoneEmergencyFallback: phase.allowPlayerZone,
          usedDistanceEmergencyFallback: phase.distanceFloorM < ADAPTIVE_RESPAWN_DISTANCE_FLOORS_M[ADAPTIVE_RESPAWN_DISTANCE_FLOORS_M.length - 1]!,
          correctedPlacements: 0,
        },
      };
    }

    return null;
  }

  private buildSpawnCandidates(
    worldColliders: WorldColliders,
    playerPos: { x: number; y: number; z: number },
  ): AdaptiveSpawnCandidate[] | null {
    if (!this.tacticalGraph || this.tacticalGraph.nodes.length < ENEMIES_PER_WAVE) {
      return null;
    }

    return this.tacticalGraph.nodes
      .map((node) => {
        const resolution = this.resolveSafeSpawnPoint(
          node.x,
          node.z,
          ADAPTIVE_SPAWN_JITTER_M,
          worldColliders,
          {
            expectedZoneId: node.zoneId,
            requireWalkableZone: true,
          },
        );
        if (!resolution) {
          return null;
        }
        const { spawnX, spawnZ } = resolution;
        return {
          node,
          nodeId: node.id,
          zoneId: node.zoneId,
          lane: node.lane,
          nodeType: node.nodeType,
          spawnX,
          spawnZ,
          distanceToPlayerM: distanceM(spawnX, spawnZ, playerPos.x, playerPos.z),
          visibleToPlayer: hasLineOfSight(
            playerPos,
            this.currentPlayerEyeHeightM,
            { x: spawnX, y: 0, z: spawnZ },
            ENEMY_EYE_HEIGHT_M,
            worldColliders,
            NO_RESPAWN_BLOCKERS,
            this.respawnLosScratch,
          ),
        };
      })
      .filter((candidate): candidate is AdaptiveSpawnCandidate => candidate !== null)
      .sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  }

  private buildAdaptiveRespawnPhases(): RespawnPhase[] {
    const phases: RespawnPhase[] = [];

    for (const distanceFloorM of ADAPTIVE_RESPAWN_DISTANCE_FLOORS_M) {
      phases.push({
        distanceFloorM,
        allowAdjacentZones: false,
        allowPlayerZone: false,
        maxVisibleBots: 0,
      });
    }
    for (const distanceFloorM of ADAPTIVE_RESPAWN_DISTANCE_FLOORS_M) {
      phases.push({
        distanceFloorM,
        allowAdjacentZones: true,
        allowPlayerZone: false,
        maxVisibleBots: 0,
      });
    }
    for (const distanceFloorM of ADAPTIVE_RESPAWN_DISTANCE_FLOORS_M) {
      phases.push({
        distanceFloorM,
        allowAdjacentZones: true,
        allowPlayerZone: false,
        maxVisibleBots: ADAPTIVE_RESPAWN_MAX_VISIBLE_BOTS,
      });
    }
    for (const distanceFloorM of ADAPTIVE_RESPAWN_DISTANCE_FLOORS_M) {
      phases.push({
        distanceFloorM,
        allowAdjacentZones: true,
        allowPlayerZone: true,
        maxVisibleBots: ADAPTIVE_RESPAWN_MAX_VISIBLE_BOTS,
      });
    }
    phases.push({
      distanceFloorM: ADAPTIVE_RESPAWN_EMERGENCY_DISTANCE_M,
      allowAdjacentZones: true,
      allowPlayerZone: true,
      maxVisibleBots: ADAPTIVE_RESPAWN_MAX_VISIBLE_BOTS,
    });

    return phases;
  }

  private pickAdaptiveRespawnSet(
    candidates: readonly AdaptiveSpawnCandidate[],
    phase: RespawnPhase,
    playerZoneId: string | null,
    adjacentZones: ReadonlySet<string>,
    waveSeed: number,
  ): AdaptiveSpawnCandidate[] | null {
    const selected: AdaptiveSpawnCandidate[] = [];
    const selectedNodeIds = new Set<string>();
    const laneUsage = createLaneUsageMap();
    const zoneUsage = new Map<string, number>();
    let visibleCount = 0;

    for (let pickIndex = 0; pickIndex < ENEMIES_PER_WAVE; pickIndex += 1) {
      let bestCandidate: AdaptiveSpawnCandidate | null = null;
      let bestScore = Number.NEGATIVE_INFINITY;

      for (const candidate of candidates) {
        if (selectedNodeIds.has(candidate.nodeId)) continue;
        if (candidate.distanceToPlayerM < phase.distanceFloorM) continue;
        if (!phase.allowPlayerZone && playerZoneId && candidate.zoneId === playerZoneId) continue;
        if (!phase.allowAdjacentZones && adjacentZones.has(candidate.zoneId)) continue;
        if (candidate.visibleToPlayer && visibleCount >= phase.maxVisibleBots) continue;
        if (this.hasSpawnFootprintConflict(candidate.spawnX, candidate.spawnZ, selected)) continue;

        const score = this.scoreAdaptiveRespawnCandidate(candidate, selected, laneUsage, zoneUsage, waveSeed, pickIndex);
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = candidate;
        }
      }

      if (!bestCandidate) return null;

      selected.push(bestCandidate);
      selectedNodeIds.add(bestCandidate.nodeId);
      laneUsage.set(bestCandidate.lane, (laneUsage.get(bestCandidate.lane) ?? 0) + 1);
      zoneUsage.set(bestCandidate.zoneId, (zoneUsage.get(bestCandidate.zoneId) ?? 0) + 1);
      if (bestCandidate.visibleToPlayer) {
        visibleCount += 1;
      }
    }

    return selected;
  }

  private buildInitialLaneTargets(
    candidates: readonly AdaptiveSpawnCandidate[],
  ): ReadonlyMap<TacticalLane, number> | null {
    const availableByLane = createLaneUsageMap();
    for (const candidate of candidates) {
      availableByLane.set(candidate.lane, (availableByLane.get(candidate.lane) ?? 0) + 1);
    }

    const totalAvailable = Array.from(availableByLane.values()).reduce((sum, count) => sum + count, 0);
    if (totalAvailable < ENEMIES_PER_WAVE) {
      return null;
    }

    const targets = createLaneUsageMap();
    let remaining = ENEMIES_PER_WAVE;

    for (const lane of TACTICAL_LANES) {
      const baseTarget = Math.min(INITIAL_SPAWN_MIN_PER_LANE, availableByLane.get(lane) ?? 0);
      targets.set(lane, baseTarget);
      remaining -= baseTarget;
    }

    while (remaining > 0) {
      let assigned = false;
      for (const lane of TACTICAL_LANES) {
        const current = targets.get(lane) ?? 0;
        const available = availableByLane.get(lane) ?? 0;
        const laneCap = Math.min(available, INITIAL_SPAWN_TARGET_PER_LANE);
        if (current >= laneCap) continue;
        targets.set(lane, current + 1);
        remaining -= 1;
        assigned = true;
        if (remaining === 0) break;
      }
      if (!assigned) break;
    }

    while (remaining > 0) {
      let assigned = false;
      const lanesByHeadroom = [...TACTICAL_LANES].sort((a, b) => {
        const aHeadroom = (availableByLane.get(a) ?? 0) - (targets.get(a) ?? 0);
        const bHeadroom = (availableByLane.get(b) ?? 0) - (targets.get(b) ?? 0);
        return bHeadroom - aHeadroom;
      });
      for (const lane of lanesByHeadroom) {
        const current = targets.get(lane) ?? 0;
        const available = availableByLane.get(lane) ?? 0;
        const laneCap = Math.min(available, INITIAL_SPAWN_MAX_PER_LANE);
        if (current >= laneCap) continue;
        targets.set(lane, current + 1);
        remaining -= 1;
        assigned = true;
        if (remaining === 0) break;
      }
      if (!assigned) {
        return null;
      }
    }

    return targets;
  }

  private pickInitialSpawnSet(
    candidates: readonly AdaptiveSpawnCandidate[],
    laneTargets: ReadonlyMap<TacticalLane, number>,
    waveSeed: number,
  ): AdaptiveSpawnCandidate[] | null {
    const pickOrder: TacticalLane[] = [];
    const remainingByLane = new Map(laneTargets);
    while (pickOrder.length < ENEMIES_PER_WAVE) {
      let appended = false;
      for (const lane of TACTICAL_LANES) {
        const remaining = remainingByLane.get(lane) ?? 0;
        if (remaining <= 0) continue;
        pickOrder.push(lane);
        remainingByLane.set(lane, remaining - 1);
        appended = true;
        if (pickOrder.length === ENEMIES_PER_WAVE) break;
      }
      if (!appended) {
        return null;
      }
    }

    const selected: AdaptiveSpawnCandidate[] = [];
    const selectedNodeIds = new Set<string>();
    const laneUsage = createLaneUsageMap();
    const zoneUsage = new Map<string, number>();

    for (let pickIndex = 0; pickIndex < pickOrder.length; pickIndex += 1) {
      const desiredLane = pickOrder[pickIndex]!;
      let bestCandidate: AdaptiveSpawnCandidate | null = null;
      let bestScore = Number.NEGATIVE_INFINITY;

      for (const candidate of candidates) {
        if (candidate.lane !== desiredLane) continue;
        if (selectedNodeIds.has(candidate.nodeId)) continue;
        if (this.hasSpawnFootprintConflict(candidate.spawnX, candidate.spawnZ, selected)) continue;

        const score = this.scoreInitialSpawnCandidate(candidate, selected, laneUsage, zoneUsage, waveSeed, pickIndex, laneTargets);
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = candidate;
        }
      }

      if (!bestCandidate) {
        return null;
      }

      selected.push(bestCandidate);
      selectedNodeIds.add(bestCandidate.nodeId);
      laneUsage.set(bestCandidate.lane, (laneUsage.get(bestCandidate.lane) ?? 0) + 1);
      zoneUsage.set(bestCandidate.zoneId, (zoneUsage.get(bestCandidate.zoneId) ?? 0) + 1);
    }

    return selected;
  }

  private scoreAdaptiveRespawnCandidate(
    candidate: AdaptiveSpawnCandidate,
    selected: readonly AdaptiveSpawnCandidate[],
    laneUsage: ReadonlyMap<TacticalLane, number>,
    zoneUsage: ReadonlyMap<string, number>,
    waveSeed: number,
    pickIndex: number,
  ): number {
    let score = candidate.distanceToPlayerM * 0.18;
    score += candidate.node.coverScore * 2.4;
    score += candidate.node.flankScore * 0.45;

    switch (candidate.nodeType) {
      case "spawn_cover":
        score += 3.9;
        break;
      case "cover_cluster":
      case "hall_entry":
      case "connector_entry":
        score += 2.7;
        break;
      case "breach":
      case "pre_peek":
        score += 1.4;
        break;
      case "open_node":
        score -= 2.9;
        break;
      case "zone_center":
      default:
        score += 0.8;
        break;
    }

    score -= (laneUsage.get(candidate.lane) ?? 0) * 1.35;
    score -= (zoneUsage.get(candidate.zoneId) ?? 0) * 2.0;

    let nearestSelectedM = Number.POSITIVE_INFINITY;
    for (const other of selected) {
      nearestSelectedM = Math.min(nearestSelectedM, distanceM(candidate.spawnX, candidate.spawnZ, other.spawnX, other.spawnZ));
    }
    if (nearestSelectedM < ADAPTIVE_RESPAWN_TIGHT_CLUSTER_M) {
      score -= 4.5;
    } else if (nearestSelectedM < ADAPTIVE_RESPAWN_NEAR_CLUSTER_M) {
      score -= 1.8;
    }

    if (candidate.visibleToPlayer) {
      score -= 8.5;
    }

    const noiseRng = new DeterministicRng(deriveSubSeed(waveSeed, `adaptive-score:${pickIndex}:${candidate.nodeId}`));
    score += noiseRng.range(-0.45, 0.45);
    return score;
  }

  private scoreInitialSpawnCandidate(
    candidate: AdaptiveSpawnCandidate,
    selected: readonly AdaptiveSpawnCandidate[],
    laneUsage: ReadonlyMap<TacticalLane, number>,
    zoneUsage: ReadonlyMap<string, number>,
    waveSeed: number,
    pickIndex: number,
    laneTargets: ReadonlyMap<TacticalLane, number>,
  ): number {
    let score = candidate.distanceToPlayerM * 0.14;
    score += candidate.node.coverScore * 3.4;
    score += candidate.node.flankScore * 0.7;

    switch (candidate.nodeType) {
      case "spawn_cover":
        score += 4.8;
        break;
      case "cover_cluster":
      case "hall_entry":
      case "connector_entry":
        score += 3.6;
        break;
      case "breach":
      case "pre_peek":
        score += 1.1;
        break;
      case "open_node":
        score -= 6.5;
        break;
      case "zone_center":
      default:
        score += 0.2;
        break;
    }

    const laneTarget = laneTargets.get(candidate.lane) ?? 0;
    const laneCount = laneUsage.get(candidate.lane) ?? 0;
    if (laneCount < laneTarget) {
      score += (laneTarget - laneCount) * 0.35;
    }

    score -= (zoneUsage.get(candidate.zoneId) ?? 0) * 2.6;

    let nearestSelectedM = Number.POSITIVE_INFINITY;
    for (const other of selected) {
      nearestSelectedM = Math.min(nearestSelectedM, distanceM(candidate.spawnX, candidate.spawnZ, other.spawnX, other.spawnZ));
    }
    if (nearestSelectedM < ADAPTIVE_RESPAWN_TIGHT_CLUSTER_M) {
      score -= 8.5;
    } else if (nearestSelectedM < ADAPTIVE_RESPAWN_NEAR_CLUSTER_M) {
      score -= 3.9;
    } else if (nearestSelectedM < 10) {
      score -= 1.4;
    }

    if (candidate.distanceToPlayerM < 24) {
      score -= 3.5;
    }

    const noiseRng = new DeterministicRng(deriveSubSeed(waveSeed, `initial-score:${pickIndex}:${candidate.nodeId}`));
    score += noiseRng.range(-0.2, 0.2);
    return score;
  }

  private isStrictlyHiddenInitialCandidate(
    candidate: AdaptiveSpawnCandidate,
    playerPos: { x: number; y: number; z: number },
    worldColliders: WorldColliders,
  ): boolean {
    const samplePoints = [
      { x: candidate.spawnX, z: candidate.spawnZ },
      { x: candidate.node.x, z: candidate.node.z },
      { x: candidate.node.x - 0.75, z: candidate.node.z },
      { x: candidate.node.x + 0.75, z: candidate.node.z },
      { x: candidate.node.x, z: candidate.node.z - 0.75 },
      { x: candidate.node.x, z: candidate.node.z + 0.75 },
    ];

    return samplePoints.every((sample) => {
      const hiddenFromPlayerView = !hasLineOfSight(
        playerPos,
        this.currentPlayerEyeHeightM,
        { x: sample.x, y: 0, z: sample.z },
        ENEMY_EYE_HEIGHT_M,
        worldColliders,
        NO_RESPAWN_BLOCKERS,
        this.respawnLosScratch,
      );
      const hiddenFromEnemyAim = !hasLineOfSight(
        { x: sample.x, y: 0, z: sample.z },
        ENEMY_EYE_HEIGHT_M,
        playerPos,
        ENEMY_EYE_HEIGHT_M,
        worldColliders,
        NO_RESPAWN_BLOCKERS,
        this.respawnLosScratch,
      );
      return hiddenFromPlayerView && hiddenFromEnemyAim;
    });
  }

  private resolveRequestedPlayerSpawnZoneId(
    playerPos: { x: number; y: number; z: number },
    playerSpawnId: RuntimeSpawnId | undefined,
  ): string | null {
    const pointZoneId = findZoneForPoint(this.tacticalGraph, playerPos.x, playerPos.z)?.id ?? null;
    if (pointZoneId) {
      return pointZoneId;
    }
    if (!this.tacticalGraph || !playerSpawnId) {
      return null;
    }
    const spawnToken = playerSpawnId === "B" ? "SPAWN_B" : "SPAWN_A";
    for (const zone of this.tacticalGraph.zoneById.values()) {
      if (zone.type === "spawn_plaza" && zone.id.includes(spawnToken)) {
        return zone.id;
      }
    }
    return null;
  }

  private findWalkableZoneForPoint(x: number, z: number): RuntimeBlockoutZone | null {
    const zone = findZoneForPoint(this.tacticalGraph, x, z);
    if (!zone || !WALKABLE_ZONE_TYPES.has(zone.type)) {
      return null;
    }
    return zone;
  }

  private findWalkableZoneIdForPoint(x: number, z: number): string | null {
    return this.findWalkableZoneForPoint(x, z)?.id ?? null;
  }

  private hasSpawnFootprintConflict(
    spawnX: number,
    spawnZ: number,
    placements: readonly SpawnFootprint[],
    minimumDistanceM = SPAWN_MIN_SEPARATION_M,
  ): boolean {
    const minimumDistanceSq = minimumDistanceM * minimumDistanceM;
    return placements.some((placement) => distanceSq(spawnX, spawnZ, placement.spawnX, placement.spawnZ) < minimumDistanceSq);
  }

  private isInsideSpawnFootprint(
    zone: RuntimeBlockoutZone,
    x: number,
    z: number,
  ): boolean {
    return (
      x >= zone.rect.x + SPAWN_ZONE_MARGIN_M
      && x <= zone.rect.x + zone.rect.w - SPAWN_ZONE_MARGIN_M
      && z >= zone.rect.y + SPAWN_ZONE_MARGIN_M
      && z <= zone.rect.y + zone.rect.h - SPAWN_ZONE_MARGIN_M
    );
  }

  private validateSpawnPoint(
    baseX: number,
    baseZ: number,
    worldColliders: WorldColliders,
    expectedZoneId: string | null,
  ): SpawnValidation {
    const playableBounds = worldColliders.playableBounds;
    const withinPlayableBounds = (
      baseX >= playableBounds.minX + SPAWN_BOUNDS_MARGIN_M
      && baseX <= playableBounds.maxX - SPAWN_BOUNDS_MARGIN_M
      && baseZ >= playableBounds.minZ + SPAWN_BOUNDS_MARGIN_M
      && baseZ <= playableBounds.maxZ - SPAWN_BOUNDS_MARGIN_M
    );

    const actualZone = this.findWalkableZoneForPoint(baseX, baseZ);
    const expectedZone = expectedZoneId
      ? this.tacticalGraph?.zoneById.get(expectedZoneId) ?? null
      : actualZone;
    const insideExpectedZone = expectedZone ? this.isInsideSpawnFootprint(expectedZone, baseX, baseZ) : false;

    setAabbFromFootPosition(this.spawnValidationAabb, baseX, 0, baseZ, ENEMY_HALF_WIDTH_M, ENEMY_HEIGHT_M);
    worldColliders.queryCandidates(this.spawnValidationAabb, this.spawnCollisionScratch);
    const blockingColliderIds: string[] = [];
    for (const collider of this.spawnCollisionScratch) {
      if (collider.kind !== "wall" && collider.kind !== "prop") continue;
      if (!intersectsAabb(this.spawnValidationAabb, collider)) continue;
      blockingColliderIds.push(collider.id);
    }

    return {
      valid: withinPlayableBounds && insideExpectedZone && blockingColliderIds.length === 0,
      withinPlayableBounds,
      insideExpectedZone,
      actualZoneId: actualZone?.id ?? null,
      expectedZoneId,
      blockingColliderIds,
    };
  }

  private resolveSafeSpawnPoint(
    baseX: number,
    baseZ: number,
    searchRadiusM: number,
    worldColliders: WorldColliders,
    options: SpawnSearchOptions,
  ): SpawnResolution | null {
    let best: SpawnResolution | null = null;

    for (const ringFactor of SPAWN_SEARCH_RING_FACTORS) {
      const radius = searchRadiusM * ringFactor;
      const offsets = radius === 0
        ? [{ x: 0, z: 0 }]
        : SPAWN_SEARCH_DIRECTIONS.map((direction) => ({
            x: direction.x * radius,
            z: direction.z * radius,
          }));

      for (const offset of offsets) {
        const spawnX = baseX + offset.x;
        const spawnZ = baseZ + offset.z;
        if (this.hasSpawnFootprintConflict(spawnX, spawnZ, options.occupiedPlacements ?? [])) {
          continue;
        }
        const validation = this.validateSpawnPoint(
          spawnX,
          spawnZ,
          worldColliders,
          options.expectedZoneId ?? null,
        );
        if (options.requireWalkableZone && validation.actualZoneId === null) {
          continue;
        }
        if (!validation.valid) {
          continue;
        }

        const resolution: SpawnResolution = {
          spawnX,
          spawnZ,
          zoneId: validation.actualZoneId,
          searchDistanceM: Math.hypot(offset.x, offset.z),
          validation,
        };
        if (!best || resolution.searchDistanceM < best.searchDistanceM) {
          best = resolution;
        }
      }
    }

    return best;
  }

  private createSpawnDebugSnapshot(
    spawnX: number,
    spawnY: number,
    spawnZ: number,
    validation: SpawnValidation,
    correctionKind: SpawnCorrectionKind,
    fallbackNodeId: string | null,
  ): EnemySpawnDebugSnapshot {
    return {
      spawnX,
      spawnY,
      spawnZ,
      actualZoneId: validation.actualZoneId,
      expectedZoneId: validation.expectedZoneId,
      withinPlayableBounds: validation.withinPlayableBounds,
      insideExpectedZone: validation.insideExpectedZone,
      blockingColliderIds: [...validation.blockingColliderIds],
      elevated: Math.abs(spawnY) > SPAWN_ELEVATION_EPSILON_M,
      valid: validation.valid && Math.abs(spawnY) <= SPAWN_ELEVATION_EPSILON_M,
      correctionKind,
      fallbackNodeId,
    };
  }

  private createPlacementFromNode(
    node: TacticalNode,
    worldColliders: WorldColliders,
    playerPos: { x: number; y: number; z: number } | null,
    occupiedPlacements: readonly SpawnFootprint[] = [],
  ): SpawnPlacement | null {
    const resolution = this.resolveSafeSpawnPoint(
      node.x,
      node.z,
      ADAPTIVE_SPAWN_JITTER_M,
      worldColliders,
      {
        expectedZoneId: node.zoneId,
        requireWalkableZone: true,
        occupiedPlacements,
      },
    );
    if (!resolution) {
      return null;
    }

    return {
      spawnX: resolution.spawnX,
      spawnZ: resolution.spawnZ,
      nodeId: node.id,
      zoneId: node.zoneId,
      lane: node.lane,
      nodeType: node.nodeType,
      distanceToPlayerM: playerPos ? distanceM(resolution.spawnX, resolution.spawnZ, playerPos.x, playerPos.z) : null,
      visibleToPlayer: playerPos
        ? hasLineOfSight(
            playerPos,
            this.currentPlayerEyeHeightM,
            { x: resolution.spawnX, y: 0, z: resolution.spawnZ },
            ENEMY_EYE_HEIGHT_M,
            worldColliders,
            NO_RESPAWN_BLOCKERS,
            this.respawnLosScratch,
          )
        : false,
    };
  }

  private resolveFallbackPlacement(
    placement: SpawnPlacement,
    worldColliders: WorldColliders,
    playerPos: { x: number; y: number; z: number } | null,
    usedNodeIds: ReadonlySet<string>,
    occupiedPlacements: readonly SpawnFootprint[],
  ): { placement: SpawnPlacement; correctionKind: SpawnCorrectionKind; fallbackNodeId: string | null } | null {
    if (!this.tacticalGraph) {
      return null;
    }

    const findCandidate = (lane: TacticalLane | null): SpawnPlacement | null => {
      let best: SpawnPlacement | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const node of this.tacticalGraph?.nodes ?? []) {
        if (lane && node.lane !== lane) continue;
        if (usedNodeIds.has(node.id)) continue;
        const candidate = this.createPlacementFromNode(node, worldColliders, playerPos, occupiedPlacements);
        if (!candidate) continue;
        const candidateDistance = distanceM(candidate.spawnX, candidate.spawnZ, placement.spawnX, placement.spawnZ);
        if (candidateDistance < bestDistance) {
          best = candidate;
          bestDistance = candidateDistance;
        }
      }
      return best;
    };

    const sameLaneCandidate = placement.lane ? findCandidate(placement.lane) : null;
    if (sameLaneCandidate) {
      return {
        placement: sameLaneCandidate,
        correctionKind: "same-lane-fallback",
        fallbackNodeId: sameLaneCandidate.nodeId,
      };
    }

    const globalCandidate = findCandidate(null);
    if (!globalCandidate) {
      return null;
    }
    return {
      placement: globalCandidate,
      correctionKind: "global-fallback",
      fallbackNodeId: globalCandidate.nodeId,
    };
  }

  private finalizeSpawnPlacements(
    spawnBatch: { placements: SpawnPlacement[]; telemetry: EnemySpawnTelemetry },
    worldColliders: WorldColliders,
    playerPos: { x: number; y: number; z: number } | null,
  ): { placements: FinalizedSpawnPlacement[]; telemetry: EnemySpawnTelemetry } {
    const usedNodeIds = new Set<string>(
      spawnBatch.placements
        .map((placement) => placement.nodeId)
        .filter((nodeId): nodeId is string => typeof nodeId === "string"),
    );
    let correctedPlacements = 0;
    const placements: FinalizedSpawnPlacement[] = [];

    for (let index = 0; index < spawnBatch.placements.length; index += 1) {
      const placement = spawnBatch.placements[index]!;
      let resolvedPlacement = placement;
      let correctionKind: SpawnCorrectionKind = "none";
      let fallbackNodeId: string | null = null;
      let validation = this.validateSpawnPoint(
        placement.spawnX,
        placement.spawnZ,
        worldColliders,
        placement.zoneId,
      );
      let overlapsExistingPlacement = this.hasSpawnFootprintConflict(
        placement.spawnX,
        placement.spawnZ,
        placements,
      );

      if (!validation.valid || overlapsExistingPlacement) {
        const nextUsedNodeIds = new Set(usedNodeIds);
        if (placement.nodeId) {
          nextUsedNodeIds.delete(placement.nodeId);
        }
        const fallback = this.resolveFallbackPlacement(
          placement,
          worldColliders,
          playerPos,
          nextUsedNodeIds,
          placements,
        );
        if (!fallback) {
          throw new Error(`[enemy-spawn] unable to resolve safe placement for index ${index}`);
        }
        resolvedPlacement = fallback.placement;
        correctionKind = fallback.correctionKind;
        fallbackNodeId = fallback.fallbackNodeId;
        validation = this.validateSpawnPoint(
          resolvedPlacement.spawnX,
          resolvedPlacement.spawnZ,
          worldColliders,
          resolvedPlacement.zoneId,
        );
        overlapsExistingPlacement = this.hasSpawnFootprintConflict(
          resolvedPlacement.spawnX,
          resolvedPlacement.spawnZ,
          placements,
        );
        if (!validation.valid || overlapsExistingPlacement) {
          throw new Error(`[enemy-spawn] fallback placement remained invalid for index ${index}`);
        }
        correctedPlacements += 1;
      }

      if (resolvedPlacement.nodeId) {
        usedNodeIds.add(resolvedPlacement.nodeId);
      }

      placements.push({
        ...resolvedPlacement,
        spawnDebug: this.createSpawnDebugSnapshot(
          resolvedPlacement.spawnX,
          0,
          resolvedPlacement.spawnZ,
          validation,
          correctionKind,
          fallbackNodeId,
        ),
      });
    }

    return {
      placements,
      telemetry: {
        ...spawnBatch.telemetry,
        selectedNodeIds: placements
          .map((placement) => placement.nodeId)
          .filter((nodeId): nodeId is string => typeof nodeId === "string"),
        correctedPlacements,
      },
    };
  }

  private reportHeardContact(
    position: { x: number; y: number; z: number },
    source: "gunshot" | "footstep",
    hearRangeM: number,
    baseRadiusM: number,
    baseConfidence: number,
  ): void {
    const template = this.createContactEstimate(position, source, baseRadiusM, baseConfidence, undefined, false, false);
    this.blackboard.lastHeardPlayer = template;

    for (const controller of this.controllers) {
      if (controller.isDead()) continue;
      const controllerPos = controller.getPosition();
      const heardDistance = distanceM(controllerPos.x, controllerPos.z, position.x, position.z);
      if (heardDistance > hearRangeM) continue;

      const falloff = 1 - heardDistance / hearRangeM;
      const contact: BlackboardContact = {
        ...template,
        confidence: clamp01(baseConfidence * (0.55 + falloff * 0.45)),
        radiusM: baseRadiusM + (1 - falloff) * (source === "gunshot" ? 10 : 7),
      };
      this.storeKnowledge(this.localKnowledgeByEnemyId, controller.id, contact);
    }
  }

  update(
    deltaSeconds: number,
    playerPos: { x: number; y: number; z: number },
    playerHealth: number,
    worldColliders: WorldColliders,
    playerHeightM = PLAYER_HEIGHT_M,
    playerEyeHeightM = PLAYER_EYE_HEIGHT_M,
  ): void {
    this.currentPlayerHeightM = playerHeightM;
    this.currentPlayerEyeHeightM = playerEyeHeightM;
    this.playerHealthDelta = 0;
    if (!this.allDead()) {
      this.waveElapsedS += Math.max(0, deltaSeconds);
    }
    this.blackboard.currentTier = resolveEnemyTier(this.waveNumber, this.waveElapsedS);

    this.playerAabb.minX = playerPos.x - PLAYER_HALF_WIDTH_M;
    this.playerAabb.minY = playerPos.y;
    this.playerAabb.minZ = playerPos.z - PLAYER_HALF_WIDTH_M;
    this.playerAabb.maxX = playerPos.x + PLAYER_HALF_WIDTH_M;
    this.playerAabb.maxY = playerPos.y + this.currentPlayerHeightM;
    this.playerAabb.maxZ = playerPos.z + PLAYER_HALF_WIDTH_M;

    this.aabbScratch.length = 0;
    for (const controller of this.controllers) {
      if (!controller.isDead()) {
        this.aabbScratch.push(controller.getAabb());
      }
    }
    this.aabbScratch.push(this.playerAabb);

    let targetCount = 1;
    const playerTarget = this.targetPool[0]!;
    playerTarget.id = "player";
    playerTarget.team = "player";
    playerTarget.position = playerPos;
    playerTarget.health = playerHealth;
    this.targetsScratch[0] = playerTarget;

    for (const controller of this.controllers) {
      if (!controller.isDead()) {
        const target = this.targetPool[targetCount]!;
        target.id = controller.id;
        target.team = controller.getTeam();
        target.position = controller.getPosition();
        target.health = controller.getHealth();
        this.targetsScratch[targetCount] = target;
        targetCount += 1;
      }
    }
    this.targetsScratch.length = targetCount;

    const currentPlayerZone = findZoneForPoint(this.tacticalGraph, playerPos.x, playerPos.z);
    if (!this.assumedPlayerSpawnZoneId && currentPlayerZone?.type === "spawn_plaza") {
      this.assumedPlayerSpawnZoneId = currentPlayerZone.id;
    }
    const tierProfile = resolveEnemyTierProfile(this.blackboard.currentTier);
    const huntPressure = Math.min(1.0, Math.max(0, (this.waveElapsedS - HUNT_ACTIVATION_S) / (HUNT_FULL_S - HUNT_ACTIVATION_S)));
    const pressureProfile = this.resolvePressureProfile(huntPressure);
    this.searchPhase = this.resolveSearchPhase();
    this.flushSharedReports();
    this.refreshSearchBeliefs();
    this.squadTaskByEnemyId.clear();
    const laneAssignments = new Map<TacticalLane, number>([
      ["west", 0],
      ["main", 0],
      ["east", 0],
    ]);
    this.blackboard.occupiedNodeIds.clear();
    this.lastDirectiveByEnemyId.clear();

    const onFootstep = this.weaponAudio ? this.handleFootstep : undefined;
    for (const controller of this.controllers) {
      if (controller.isDead()) continue;
      const directive = this.buildDirective(
        controller,
        playerTarget,
        worldColliders,
        tierProfile,
        laneAssignments,
        pressureProfile,
      );
      this.lastDirectiveByEnemyId.set(controller.id, directive);
      if (directive.targetNodeId) {
        this.blackboard.occupiedNodeIds.set(directive.targetNodeId, controller.id);
      }
      if (directive.holdPoint) {
        const holdLane = laneFromPosition(directive.holdPoint.x);
        laneAssignments.set(holdLane, (laneAssignments.get(holdLane) ?? 0) + 1);
      }

      controller.step(
        deltaSeconds,
        directive,
        this.targetsScratch,
        worldColliders,
        this.aabbScratch,
        this.handleEnemyShot,
        onFootstep,
        (event) => {
          if (this.isPlayerIntelSuppressed()) return;
          if (event.kind === "seen-player") {
            const contact = this.createContactEstimate(event.position, "visual", 1.2, 1.0, event.enemyId, true, false);
            this.blackboard.lastSeenPlayer = contact;
            this.storeKnowledge(this.localKnowledgeByEnemyId, event.enemyId, contact);
            this.queueSharedContactReports(event.enemyId, contact, pressureProfile);
          }
        },
      );
    }

    this.resolveLiveBotOverlaps(worldColliders);

    if (this.allDead()) {
      if (this.waveRespawnTimer === null) {
        this.waveRespawnTimer = WAVE_RESPAWN_DELAY_S;
      } else {
        this.waveRespawnTimer -= deltaSeconds;
        if (this.waveRespawnTimer <= 0 && this.worldCollidersRef) {
          this.spawn(this.worldCollidersRef, { mode: "respawn", playerPos });
          this.onNewWave?.(this.waveNumber);
        }
      }
    }

    for (let i = 0; i < this.controllers.length; i += 1) {
      const controller = this.controllers[i]!;
      const visual = this.visuals[i]!;
      const pos = controller.getPosition();

      if (controller.isDead()) {
        if (!this.deathFadeStarted.has(i)) {
          this.deathFadeStarted.add(i);
          visual.startDeathFade();
          this.onEnemyKilled?.(controller.name, controller.wasLastHitHeadshot());
        }
        visual.updateDeathFade(deltaSeconds);
        continue;
      }

      visual.update(pos.x, pos.y, pos.z, controller.getYaw(), true);

      if (controller.isFiring()) {
        visual.triggerShotFx();
        const distanceToPlayerM = distanceM(pos.x, pos.z, playerTarget.position.x, playerTarget.position.z);
        const distanceNorm = clamp01(
          (distanceToPlayerM - AK47_AUDIO_TUNING.enemy.distanceMinM)
            / Math.max(0.001, AK47_AUDIO_TUNING.enemy.distanceMaxM - AK47_AUDIO_TUNING.enemy.distanceMinM),
        );
        this.weaponAudio?.playAk47ShotQuiet({
          layerGainScale: 1,
          distanceNorm,
        });
      }
      visual.updateFx(deltaSeconds);
    }
  }

  private resolveLiveBotOverlaps(worldColliders: WorldColliders): void {
    const liveControllers = this.controllers.filter((controller) => !controller.isDead());
    if (liveControllers.length < 2) return;

    for (let pass = 0; pass < LIVE_BOT_DEPENETRATION_PASSES; pass += 1) {
      for (let i = 0; i < liveControllers.length - 1; i += 1) {
        const first = liveControllers[i]!;
        for (let j = i + 1; j < liveControllers.length; j += 1) {
          const second = liveControllers[j]!;
          const firstPos = first.getPosition();
          const secondPos = second.getPosition();
          let dx = secondPos.x - firstPos.x;
          let dz = secondPos.z - firstPos.z;
          let distance = Math.hypot(dx, dz);
          if (distance >= LIVE_BOT_MIN_SEPARATION_M) continue;

          if (distance < 0.0001) {
            const stableSeed = (i + 1) * 97 + (j + 1) * 53;
            if (stableSeed % 2 === 0) {
              dx = stableSeed % 4 < 2 ? 1 : -1;
              dz = 0;
            } else {
              dx = 0;
              dz = stableSeed % 4 < 2 ? 1 : -1;
            }
            distance = 1;
          }

          const overlapM = LIVE_BOT_MIN_SEPARATION_M - distance;
          if (overlapM <= 0) continue;
          const inverseDistance = 1 / distance;
          const pushX = dx * inverseDistance * overlapM * 0.5;
          const pushZ = dz * inverseDistance * overlapM * 0.5;
          first.nudgeWithCollision(-pushX, -pushZ, worldColliders);
          second.nudgeWithCollision(pushX, pushZ, worldColliders);
        }
      }
    }
  }

  private buildDirective(
    controller: EnemyController,
    playerTarget: EnemyTarget,
    worldColliders: WorldColliders,
    tierProfile: ReturnType<typeof resolveEnemyTierProfile>,
    laneAssignments: Map<TacticalLane, number>,
    pressureProfile: PressureProfile,
  ): EnemyDirective {
    const role = this.blackboard.assignedRoleByEnemyId.get(controller.id) ?? "rifler";
    const roleRank = this.blackboard.roleRankByEnemyId.get(controller.id) ?? 0;
    const effectiveActiveFlankers = tierProfile.activeFlankers > 0
      ? Math.max(tierProfile.activeFlankers, pressureProfile.flankBudget)
      : 0;
    const activeRole: EnemyRole =
      role === "flanker" && roleRank >= effectiveActiveFlankers
        ? "rifler"
        : role;

    const controllerPos = controller.getPosition();
    const currentNode = findNearestTacticalNode(this.tacticalGraph, controllerPos.x, controllerPos.z);
    const currentLane = currentNode?.lane ?? laneFromPosition(controllerPos.x);
    const playerDistance = distanceM(controllerPos.x, controllerPos.z, playerTarget.position.x, playerTarget.position.z);
    const hasDirectSight =
      !this.isPlayerIntelSuppressed()
      &&
      playerDistance <= tierProfile.visionRangeM
      && controller.canSeeTarget(playerTarget, worldColliders, this.aabbScratch);

    const knowledge = hasDirectSight
      ? this.createContactEstimate(playerTarget.position, "visual", 1.2, 1.0, controller.id, true, false)
      : this.pickKnowledge(
        controller.id,
        activeRole,
        currentLane,
        controllerPos.x,
        controllerPos.z,
        tierProfile,
        pressureProfile,
      );
    const searchBelief = !knowledge && this.searchPhase !== "caution"
      ? this.pickSearchBelief(controller.id, activeRole, currentNode?.zoneId ?? null)
      : null;
    const knowledgeAgeS = knowledge ? this.waveElapsedS - knowledge.timeS : Number.POSITIVE_INFINITY;
    const scoringMode = knowledge
      ? this.resolveScoringMode(knowledge, hasDirectSight, pressureProfile, knowledgeAgeS)
      : searchBelief
        ? (searchBelief.phase === "probe" ? "search" : searchBelief.phase === "sweep" ? "contain" : "collapse")
        : "caution";
    const contactZoneDistances = knowledge?.zoneId
      ? this.buildZoneDistanceMap(knowledge.zoneId)
      : searchBelief?.zoneId
        ? this.buildZoneDistanceMap(searchBelief.zoneId)
        : null;

    let selection: NodeSelection;
    if (controller.isReloading() || (tierProfile.mandatoryReloadFallback && controller.getMag() <= 6 && controller.getReserve() > 0)) {
      selection = this.pickFallbackNode(controllerPos.x, controllerPos.z, knowledge);
    } else if (
      !pressureProfile.fullHunt
      && hasDirectSight
      && playerDistance > pressureProfile.overwatchRangeM
      && activeRole !== "flanker"
      && currentNode
    ) {
      selection = { node: currentNode, score: 999 };
    } else {
      selection = this.pickRoleNode(
        activeRole,
        currentLane,
        currentNode?.zoneId ?? null,
        controllerPos.x,
        controllerPos.z,
        knowledge,
        searchBelief,
        laneAssignments,
        tierProfile,
        pressureProfile,
        scoringMode,
        contactZoneDistances,
      );
    }

    let targetNode = selection.node;
    let targetScore = selection.score;
    let state: EnemyState = "HOLD";
    let allowFire = false;
    let debugReason = knowledge
      ? `${knowledge.source} ${scoringMode}`
      : searchBelief
        ? `${searchBelief.taskKind} ${searchBelief.reason}`
      : activeRole === "anchor"
        ? "default lane hold"
        : "default rotation";

    const atTargetNode = !targetNode || distanceM(controllerPos.x, controllerPos.z, targetNode.x, targetNode.z) <= 1.2;
    const laneBuddyCount = targetNode ? laneAssignments.get(targetNode.lane) ?? 0 : 0;
    const knowledgeSuggestsSearch = Boolean(knowledge && (
      knowledge.source === "footstep"
      || knowledge.source === "radio"
      || knowledge.source === "hunt"
      || knowledge.radiusM >= 5.5
      || knowledge.confidence <= 0.72
    ));
    const effectiveCollapse = tierProfile.collapse || pressureProfile.collapseWeight >= 0.58 || scoringMode === "collapse";
    const pairSwingReady = tierProfile.pairSwing || pressureProfile.normalized >= 0.7;

    if (controller.isReloading() || (tierProfile.mandatoryReloadFallback && controller.getMag() <= 6 && controller.getReserve() > 0)) {
      state = atTargetNode ? "RELOAD" : "FALLBACK";
      debugReason = "reload fallback";
    } else if (
      !pressureProfile.fullHunt
      && hasDirectSight
      && playerDistance > pressureProfile.overwatchRangeM
      && activeRole !== "flanker"
    ) {
      state = atTargetNode ? "OVERWATCH" : "ROTATE";
      allowFire = atTargetNode;
      debugReason = "direct long sight overwatch";
    } else if (!knowledge && searchBelief) {
      if (activeRole === "anchor") {
        state = atTargetNode
          ? (searchBelief.phase === "probe" ? "HOLD" : "INVESTIGATE")
          : "ROTATE";
      } else if (activeRole === "flanker") {
        state = atTargetNode
          ? (searchBelief.phase === "probe" ? "INVESTIGATE" : "PRESSURE")
          : "ROTATE";
      } else {
        state = atTargetNode
          ? (searchBelief.phase === "pinch" ? "PRESSURE" : "INVESTIGATE")
          : "ROTATE";
      }
      allowFire = atTargetNode && hasDirectSight;
    } else if (!knowledge) {
      state = atTargetNode ? "HOLD" : "ROTATE";
      debugReason = activeRole === "anchor" ? "default lane hold" : "default rotation";
    } else if (activeRole === "flanker") {
      state = atTargetNode
        ? (effectiveCollapse ? "PRESSURE" : knowledgeSuggestsSearch ? "INVESTIGATE" : "PRESSURE")
        : "ROTATE";
      allowFire = atTargetNode && hasDirectSight;
      debugReason = effectiveCollapse ? "flanker collapse" : "active flank pressure";
    } else if (activeRole === "anchor") {
      state = atTargetNode
        ? (
          hasDirectSight
            ? "OVERWATCH"
            : effectiveCollapse && targetNode?.zoneId === knowledge.zoneId
              ? "INVESTIGATE"
              : pairSwingReady && laneBuddyCount > 0
                ? "PEEK"
                : "HOLD"
        )
        : "ROTATE";
      allowFire = atTargetNode && hasDirectSight;
      debugReason = hasDirectSight ? "anchor long hold" : effectiveCollapse ? "anchor contain" : "anchor hold";
    } else if (activeRole === "roamer") {
      state = atTargetNode
        ? (
          hasDirectSight
            ? "OVERWATCH"
            : effectiveCollapse
              ? "PRESSURE"
              : knowledgeSuggestsSearch
                ? "INVESTIGATE"
                : pairSwingReady && laneBuddyCount > 0
                  ? "PEEK"
                  : "HOLD"
        )
        : knowledgeSuggestsSearch
          ? "INVESTIGATE"
          : "ROTATE";
      allowFire = atTargetNode && hasDirectSight;
      debugReason = hasDirectSight ? "roamer direct hold" : effectiveCollapse ? "roamer collapse" : "roamer search";
    } else {
      state = atTargetNode
        ? (
          hasDirectSight
            ? "OVERWATCH"
            : effectiveCollapse
              ? "PRESSURE"
              : knowledgeSuggestsSearch
                ? "INVESTIGATE"
                : pairSwingReady && laneBuddyCount > 0
                  ? "PEEK"
                  : "HOLD"
        )
        : knowledgeSuggestsSearch
          ? "INVESTIGATE"
          : "ROTATE";
      allowFire = atTargetNode && hasDirectSight;
      debugReason = hasDirectSight ? "rifler direct hold" : effectiveCollapse ? "rifler collapse" : "rifler lane pressure";
    }

    if (!hasDirectSight && state === "OVERWATCH" && knowledgeAgeS > 0.4) {
      state = atTargetNode ? (knowledgeSuggestsSearch ? "INVESTIGATE" : "HOLD") : "ROTATE";
      allowFire = false;
      debugReason = `${debugReason} | stale overwatch release`;
    }

    const previous = this.directiveMemoryByEnemyId.get(controller.id) ?? null;
    const forceHuntReplan = Boolean(
      previous
      && effectiveCollapse
      && (knowledge || searchBelief)
      && this.waveElapsedS - previous.startedAtS >= pressureProfile.overdueCollapseS,
    );
    if (previous && this.waveElapsedS < previous.commitUntilS && !forceHuntReplan) {
      const sameNode = previous.targetNodeId === targetNode?.id;
      const scoreImprovedEnough = targetScore >= previous.score + SCORE_IMPROVEMENT_THRESHOLD;
      const criticalOverride =
        (hasDirectSight && !previous.hadDirectSight)
        || state === "RELOAD"
        || state === "FALLBACK"
        || pressureProfile.fullHunt;

      if (!criticalOverride) {
        if (!sameNode && !scoreImprovedEnough) {
          targetNode = previous.targetNodeId
            ? this.tacticalGraph?.nodeById.get(previous.targetNodeId) ?? targetNode
            : targetNode;
          targetScore = previous.score;
          state = previous.state;
          debugReason = `${debugReason} | hysteresis hold`;
        } else if (sameNode && state !== previous.state) {
          state = previous.state;
          debugReason = `${debugReason} | state commit`;
        }
      }
    }

    if (pressureProfile.fullHunt && knowledge && state !== "RELOAD" && state !== "FALLBACK") {
      state = hasDirectSight ? "PRESSURE" : "INVESTIGATE";
      allowFire = true;
      debugReason = "full hunt mode";
    }

    const path = findTacticalPath(this.tacticalGraph, currentNode?.id ?? null, targetNode?.id ?? null);
    const moveNodeId = path.length > 1 ? path[1]! : targetNode?.id ?? null;
    const moveNode = moveNodeId ? this.tacticalGraph?.nodeById.get(moveNodeId) ?? null : targetNode;
    const holdPoint = targetNode ? { x: targetNode.x, z: targetNode.z } : null;
    const movePoint = moveNode ? { x: moveNode.x, z: moveNode.z } : holdPoint;
    const focusPoint = this.resolveFocusPoint(targetNode, knowledge);
    const changedDirective =
      previous?.targetNodeId !== targetNode?.id
      || previous?.state !== state;
    const startedAtS = changedDirective ? this.waveElapsedS : previous?.startedAtS ?? this.waveElapsedS;
    const commitWindowS = Math.max(0.22, STATE_COMMIT_S[state] * pressureProfile.commitScale);
    const commitUntilS = changedDirective
      ? this.waveElapsedS + commitWindowS
      : previous?.commitUntilS ?? (this.waveElapsedS + commitWindowS);

    this.directiveMemoryByEnemyId.set(controller.id, {
      state,
      targetNodeId: targetNode?.id ?? null,
      score: targetScore,
      startedAtS,
      commitUntilS,
      hadDirectSight: hasDirectSight,
    });
    this.registerSearchProgress(
      controller.id,
      searchBelief,
      targetNode?.zoneId ?? null,
      atTargetNode,
      hasDirectSight,
      state,
      startedAtS,
    );

    return {
      role: activeRole,
      state,
      tier: this.blackboard.currentTier,
      tierProfile,
      assignedNodeId: targetNode?.id ?? null,
      targetNodeId: targetNode?.id ?? null,
      movePoint,
      holdPoint,
      focusPoint,
      peekOffsetM: activeRole === "anchor" ? 0.7 : activeRole === "flanker" ? 1.1 : 0.9,
      allowFire,
      aggressive: state === "PRESSURE" || (pressureProfile.fullHunt && state === "INVESTIGATE"),
      hasDirectSight,
      directiveAgeS: this.waveElapsedS - startedAtS,
      debugReason,
    };
  }

  private resolveFocusPoint(
    targetNode: TacticalNode | null,
    knowledge: BlackboardContact | null,
  ): { x: number; y: number; z: number } | null {
    if (knowledge) {
      return {
        x: knowledge.x,
        y: knowledge.y,
        z: knowledge.z,
      };
    }
    if (!targetNode) return null;
    return {
      x: targetNode.x + Math.sin(targetNode.exposureYawRad) * 8,
      y: 1.5,
      z: targetNode.z + Math.cos(targetNode.exposureYawRad) * 8,
    };
  }

  private initializeSearchState(): void {
    this.zoneSearchStateByZoneId.clear();
    if (!this.tacticalGraph) return;

    for (const zoneId of this.tacticalGraph.zoneAdjacency.keys()) {
      this.zoneSearchStateByZoneId.set(zoneId, {
        zoneId,
        belief: 0,
        reason: zoneSearchSeedReason("caution", "idle"),
        lastClearedAtS: null,
        lastAssignedAtS: null,
        lastAssignedEnemyId: null,
      });
    }
  }

  private resolveSearchPhase(): SearchPhase {
    if (this.waveElapsedS < HUNT_ACTIVATION_S) return "caution";
    const normalizedPressure = Math.min(1.0, Math.max(0, (this.waveElapsedS - HUNT_ACTIVATION_S) / (HUNT_FULL_S - HUNT_ACTIVATION_S)));
    if (normalizedPressure < (1 / 3)) return "probe";
    if (normalizedPressure < (7 / 9)) return "sweep";
    if (normalizedPressure < 1) return "collapse";
    return "pinch";
  }

  private refreshSearchBeliefs(): void {
    if (!this.tacticalGraph) return;

    const spawnDistances = this.assumedPlayerSpawnZoneId
      ? this.buildZoneDistanceMap(this.assumedPlayerSpawnZoneId)
      : null;
    const recentContact = [this.blackboard.lastSeenPlayer, this.blackboard.lastHeardPlayer]
      .filter((contact): contact is BlackboardContact => Boolean(contact))
      .sort((a, b) => b.timeS - a.timeS)[0] ?? null;
    const contactDistances = recentContact?.zoneId ? this.buildZoneDistanceMap(recentContact.zoneId) : null;

    for (const state of this.zoneSearchStateByZoneId.values()) {
      const zone = this.tacticalGraph.zoneById.get(state.zoneId);
      if (!zone) continue;

      let belief = 0.04;
      let reason = zoneSearchSeedReason(this.searchPhase, "ambient");

      if (spawnDistances) {
        const steps = spawnDistances.get(state.zoneId) ?? Number.POSITIVE_INFINITY;
        const expectedStep =
          this.searchPhase === "probe"
            ? 1
            : this.searchPhase === "sweep"
              ? 2
              : this.searchPhase === "collapse"
                ? 2.5
                : this.searchPhase === "pinch"
                  ? 3
                  : 0;
        const stepScore = this.searchPhase === "caution"
          ? (steps === 0 ? 0.95 : steps === 1 ? 0.32 : 0)
          : Math.max(0, 0.95 - Math.abs(steps - expectedStep) * 0.28);
        belief += stepScore;
        if (stepScore > 0.1) {
          reason = zoneSearchSeedReason(this.searchPhase, `spawn-${steps}`);
        }
      }

      if (zone.type === "connector") belief += this.searchPhase === "probe" ? 0.14 : 0.06;
      if (zone.type === "side_hall") belief += this.searchPhase === "probe" ? 0.12 : this.searchPhase === "sweep" || this.searchPhase === "collapse" ? 0.34 : 0.26;
      if (zone.type === "cut") belief += this.searchPhase === "collapse" || this.searchPhase === "pinch" ? 0.12 : 0.02;

      if (recentContact && contactDistances) {
        const age = this.waveElapsedS - recentContact.timeS;
        const freshness = clamp01(1 - age / (recentContact.source === "visual" ? 12 : 18));
        const stepsToContact = contactDistances.get(state.zoneId) ?? Number.POSITIVE_INFINITY;
        const contactScore = Math.max(0, 1.15 - stepsToContact * 0.34) * freshness * (recentContact.confidence + (recentContact.source === "visual" ? 0.2 : 0));
        belief += contactScore;
        if (contactScore > 0.12) {
          reason = zoneSearchSeedReason(this.searchPhase, recentContact.source);
        }
      }

      if (state.lastAssignedAtS !== null && this.waveElapsedS - state.lastAssignedAtS < 6) {
        belief += 0.14;
      }

      if (state.lastClearedAtS !== null) {
        const clearAgeS = this.waveElapsedS - state.lastClearedAtS;
        if (clearAgeS < 18) {
          belief *= 0.12;
          reason = zoneSearchSeedReason(this.searchPhase, "recent-clear");
        } else if (clearAgeS < 40) {
          belief *= 0.45;
        } else if (clearAgeS < 80) {
          belief *= 0.75;
        }
      }

      state.belief = clamp01(belief);
      state.reason = reason;
    }
  }

  private pickSearchBelief(
    enemyId: string,
    role: EnemyRole,
    currentZoneId: string | null,
  ): SearchBelief | null {
    if (!this.tacticalGraph || this.searchPhase === "caution") return null;

    const ranked = Array.from(this.zoneSearchStateByZoneId.values())
      .filter((zone) => zone.belief >= 0.16)
      .sort((a, b) => b.belief - a.belief || a.zoneId.localeCompare(b.zoneId));
    if (ranked.length === 0) return null;

    const primary = ranked[0]!;
    const primaryZone = this.tacticalGraph.zoneById.get(primary.zoneId);
    const primaryLane = primaryZone ? laneFromPosition(zoneCenter(primaryZone).x) : laneFromPosition(25);
    const existingTasks = Array.from(this.squadTaskByEnemyId.values());
    const primaryDistances = this.buildZoneDistanceMap(primary.zoneId);

    let chosen = primary;
    let taskKind: SquadTask["kind"] = role === "anchor" ? "contain" : role === "flanker" ? "flank" : "clear";

    let bestScore = Number.NEGATIVE_INFINITY;
    for (const candidate of ranked.slice(0, 6)) {
      const zone = this.tacticalGraph.zoneById.get(candidate.zoneId);
      if (!zone) continue;
      const lane = laneFromPosition(zoneCenter(zone).x);
      const zoneTaskCount = existingTasks.filter((task) => task.zoneId === candidate.zoneId).length;
      const laneTaskCount = existingTasks.filter((task) => task.lane === lane).length;
      const stepFromPrimary = primaryDistances.get(candidate.zoneId) ?? Number.POSITIVE_INFINITY;
      const candidateTaskKind: SquadTask["kind"] = role === "anchor" ? "contain" : role === "flanker" ? "flank" : "clear";

      let score = candidate.belief;
      score -= zoneTaskCount * 0.42;
      score -= laneTaskCount * 0.18;

      if (role === "anchor") {
        if (stepFromPrimary === 1) score += 0.32;
        if (candidate.zoneId === primary.zoneId) score -= 0.18;
      } else if (role === "flanker") {
        if (lane !== primaryLane) score += 0.28;
        if (candidate.zoneId === currentZoneId) score -= 0.22;
      } else {
        if (candidate.zoneId === primary.zoneId) score += 0.18;
        if (stepFromPrimary === 1) score += 0.08;
      }

      if (candidate.zoneId === currentZoneId) score -= 0.08;
      if (score > bestScore) {
        bestScore = score;
        chosen = candidate;
        taskKind = candidateTaskKind;
      }
    }

    const zone = this.tacticalGraph.zoneById.get(chosen.zoneId);
    if (!zone) return null;
    const center = zoneCenter(zone);
    const lane = laneFromPosition(center.x);
    this.squadTaskByEnemyId.set(enemyId, {
      enemyId,
      kind: taskKind,
      zoneId: chosen.zoneId,
      lane,
      reason: chosen.reason,
    });
    chosen.lastAssignedAtS = this.waveElapsedS;
    chosen.lastAssignedEnemyId = enemyId;

    return {
      zoneId: chosen.zoneId,
      lane,
      x: center.x,
      z: center.z,
      score: chosen.belief,
      reason: chosen.reason,
      phase: this.searchPhase,
      taskKind,
    };
  }

  private registerSearchProgress(
    enemyId: string,
    searchBelief: SearchBelief | null,
    targetZoneId: string | null,
    atTargetNode: boolean,
    hasDirectSight: boolean,
    state: EnemyState,
    startedAtS: number,
  ): void {
    if (!searchBelief || !targetZoneId) return;
    const zoneState = this.zoneSearchStateByZoneId.get(targetZoneId);
    if (!zoneState) return;

    zoneState.lastAssignedEnemyId = enemyId;
    zoneState.lastAssignedAtS = this.waveElapsedS;

    if (hasDirectSight || !atTargetNode) return;
    if (state !== "INVESTIGATE" && state !== "ROTATE" && state !== "HOLD") return;
    if (this.waveElapsedS - startedAtS < 1.35) return;
    if (zoneState.lastClearedAtS !== null && this.waveElapsedS - zoneState.lastClearedAtS < 4) return;

    zoneState.lastClearedAtS = this.waveElapsedS;
    zoneState.reason = zoneSearchSeedReason(this.searchPhase, "cleared");
  }

  private resolvePressureProfile(huntPressure: number): PressureProfile {
    return {
      normalized: huntPressure,
      overwatchRangeM: LONG_SIGHT_OVERWATCH_RANGE_M + (HUNT_MIN_OVERWATCH_RANGE_M - LONG_SIGHT_OVERWATCH_RANGE_M) * huntPressure,
      flankBudget: Math.floor(huntPressure * 2.35 + 0.15),
      sharedTrust: 0.24 + huntPressure * 0.68,
      collapseWeight: huntPressure,
      commitScale: 1 - huntPressure * 0.58,
      certaintyFloor: 0.64 - huntPressure * 0.44,
      radioDelayScale: 1 - huntPressure * 0.45,
      overdueCollapseS: 3.25 - huntPressure * 1.85,
      searchRadiusBonusM: 2 + huntPressure * 12,
      fullHunt: huntPressure >= 1.0,
    };
  }

  private createContactEstimate(
    position: { x: number; y: number; z: number },
    source: ContactSource,
    radiusM: number,
    confidence: number,
    sourceEnemyId?: string,
    precise = false,
    shared = false,
  ): BlackboardContact {
    const zone = findZoneForPoint(this.tacticalGraph, position.x, position.z);
    const proxyNode = !precise
      ? findNearestTacticalNode(
        this.tacticalGraph,
        position.x,
        position.z,
        zone && this.tacticalGraph?.zoneAdjacency.has(zone.id)
          ? (node) => node.zoneId === zone.id
          : undefined,
      )
      : null;
    const supportedZoneId = zone && this.tacticalGraph?.zoneAdjacency.has(zone.id)
      ? zone.id
      : proxyNode?.zoneId ?? zone?.id ?? null;
    const supportedZone = supportedZoneId ? this.tacticalGraph?.zoneById.get(supportedZoneId) ?? zone : zone;
    const fallbackCenter = supportedZone ? zoneCenter(supportedZone) : { x: position.x, z: position.z };

    return {
      x: precise ? position.x : proxyNode?.x ?? fallbackCenter.x,
      y: position.y,
      z: precise ? position.z : proxyNode?.z ?? fallbackCenter.z,
      timeS: this.waveElapsedS,
      zoneId: supportedZoneId,
      lane: laneFromPosition(proxyNode?.x ?? fallbackCenter.x),
      radiusM,
      confidence: clamp01(confidence),
      source,
      kind: source,
      precise,
      shared,
      ...(sourceEnemyId ? { sourceEnemyId } : {}),
    };
  }

  private storeKnowledge(
    map: Map<string, BlackboardContact>,
    enemyId: string,
    contact: BlackboardContact,
  ): void {
    const existing = map.get(enemyId);
    if (
      !existing
      || contact.timeS > existing.timeS
      || contact.confidence >= existing.confidence + 0.08
      || (contact.source === "visual" && existing.source !== "visual")
    ) {
      map.set(enemyId, contact);
    }
  }

  private flushSharedReports(): void {
    const pending: SharedContactReport[] = [];
    for (const report of this.pendingSharedReports) {
      if (report.deliverAtS > this.waveElapsedS) {
        pending.push(report);
        continue;
      }

      const controller = this.controllers.find((candidate) => candidate.id === report.targetEnemyId);
      if (!controller || controller.isDead()) {
        continue;
      }
      this.storeKnowledge(this.sharedKnowledgeByEnemyId, report.targetEnemyId, report.contact);
    }
    this.pendingSharedReports.length = 0;
    this.pendingSharedReports.push(...pending);
  }

  private queueSharedContactReports(
    sourceEnemyId: string,
    contact: BlackboardContact,
    pressureProfile: PressureProfile,
  ): void {
    for (const controller of this.controllers) {
      if (controller.isDead() || controller.id === sourceEnemyId) continue;
      const controllerPos = controller.getPosition();
      const role = this.blackboard.assignedRoleByEnemyId.get(controller.id) ?? "rifler";
      const relayDistance = distanceM(controllerPos.x, controllerPos.z, contact.x, contact.z);
      const roleDelayS =
        role === "anchor"
          ? 0.42
          : role === "roamer"
            ? 0.22
            : role === "flanker"
              ? 0.16
              : 0.28;
      const delayS = (roleDelayS + Math.min(0.85, relayDistance * 0.015)) * pressureProfile.radioDelayScale;
      const relayedContact: BlackboardContact = {
        ...contact,
        timeS: contact.timeS,
        radiusM: Math.max(contact.radiusM + 2.8 + relayDistance * 0.025, 4.5),
        confidence: clamp01(contact.confidence * (0.58 + pressureProfile.sharedTrust * 0.28) - (role === "anchor" ? 0.06 : 0)),
        source: "radio",
        kind: "radio",
        precise: false,
        shared: true,
      };
      this.pendingSharedReports.push({
        targetEnemyId: controller.id,
        deliverAtS: this.waveElapsedS + delayS,
        contact: relayedContact,
      });
    }
  }

  private pickFreshKnowledge(
    contact: BlackboardContact | null | undefined,
    maxAgeS: number,
    minConfidence: number,
  ): BlackboardContact | null {
    if (!contact) return null;
    const age = this.waveElapsedS - contact.timeS;
    if (age < 0 || age > maxAgeS) return null;

    const freshness = clamp01(1 - age / Math.max(0.001, maxAgeS));
    const confidence = clamp01(contact.confidence * (0.2 + freshness * 0.8));
    if (confidence < minConfidence) return null;

    return {
      ...contact,
      confidence,
      radiusM: contact.radiusM + age * (contact.shared ? 1.8 : contact.precise ? 0.8 : 1.35),
    };
  }

  private pickKnowledge(
    enemyId: string,
    role: EnemyRole,
    currentLane: TacticalLane,
    currentX: number,
    currentZ: number,
    tierProfile: ReturnType<typeof resolveEnemyTierProfile>,
    pressureProfile: PressureProfile,
  ): BlackboardContact | null {
    const local = this.pickFreshKnowledge(
      this.localKnowledgeByEnemyId.get(enemyId),
      tierProfile.memoryS * (1.05 + pressureProfile.normalized * 0.75),
      Math.max(0.14, pressureProfile.certaintyFloor * 0.86),
    );
    if (local) return local;

    const shared = this.pickFreshKnowledge(
      this.sharedKnowledgeByEnemyId.get(enemyId),
      tierProfile.memoryS * (1.15 + pressureProfile.normalized * 1.2),
      Math.max(0.12, pressureProfile.certaintyFloor - pressureProfile.sharedTrust * 0.22),
    );
    if (shared) {
      const distanceToKnowledge = distanceM(currentX, currentZ, shared.x, shared.z);
      if (this.shouldUseSharedKnowledge(role, currentLane, shared.lane, distanceToKnowledge, tierProfile, pressureProfile, shared.confidence)) {
        return shared;
      }
    }

    return this.pickHuntFallbackKnowledge(enemyId, pressureProfile);
  }

  private pickHuntFallbackKnowledge(
    enemyId: string,
    pressureProfile: PressureProfile,
  ): BlackboardContact | null {
    if (pressureProfile.normalized <= 0) return null;

    const candidates = [
      this.localKnowledgeByEnemyId.get(enemyId) ?? null,
      this.sharedKnowledgeByEnemyId.get(enemyId) ?? null,
      this.blackboard.lastSeenPlayer,
      this.blackboard.lastHeardPlayer,
    ]
      .filter((candidate): candidate is BlackboardContact => Boolean(candidate))
      .sort((a, b) => (b.timeS + b.confidence * 4) - (a.timeS + a.confidence * 4));
    const candidate = candidates[0] ?? null;
    if (!candidate) return null;

    const age = this.waveElapsedS - candidate.timeS;
    const maxStaleAgeS = 10 + pressureProfile.normalized * 48;
    if (age > maxStaleAgeS) return null;

    const confidence = clamp01(
      candidate.confidence * (0.46 + pressureProfile.sharedTrust * 0.34)
      - (age / Math.max(0.001, maxStaleAgeS)) * 0.18,
    );
    if (confidence < Math.max(0.1, pressureProfile.certaintyFloor - pressureProfile.sharedTrust * 0.5)) {
      return null;
    }

    return {
      ...candidate,
      confidence,
      radiusM: candidate.radiusM + age * (1.05 + pressureProfile.normalized * 0.95) + pressureProfile.searchRadiusBonusM,
      source: "hunt",
      kind: "hunt",
      precise: false,
      shared: true,
    };
  }

  private shouldUseSharedKnowledge(
    role: EnemyRole,
    currentLane: TacticalLane,
    knowledgeLane: TacticalLane,
    distanceToKnowledgeM: number,
    tierProfile: ReturnType<typeof resolveEnemyTierProfile>,
    pressureProfile: PressureProfile,
    confidence: number,
  ): boolean {
    if (!Number.isFinite(distanceToKnowledgeM)) return false;
    if (confidence < Math.max(0.12, pressureProfile.certaintyFloor - pressureProfile.sharedTrust * 0.18)) return false;

    const sharedRangeM = tierProfile.sharedAlertRadiusM * (0.75 + pressureProfile.sharedTrust * 0.95);
    if (tierProfile.collapse || pressureProfile.fullHunt) return true;
    if (distanceToKnowledgeM <= sharedRangeM) return true;
    if (role === "anchor") {
      return currentLane === knowledgeLane && distanceToKnowledgeM <= sharedRangeM * 1.18;
    }
    if (role === "roamer") {
      return currentLane === "main" && distanceToKnowledgeM <= sharedRangeM * 1.08;
    }
    if (role === "flanker") {
      return currentLane !== knowledgeLane && distanceToKnowledgeM <= sharedRangeM * 1.35;
    }
    return currentLane === knowledgeLane && distanceToKnowledgeM <= sharedRangeM * 1.05;
  }

  private resolveScoringMode(
    knowledge: BlackboardContact | null,
    hasDirectSight: boolean,
    pressureProfile: PressureProfile,
    knowledgeAgeS: number,
  ): ScoringMode {
    if (!knowledge) return "caution";
    if (pressureProfile.fullHunt || pressureProfile.collapseWeight >= 0.72) return "collapse";
    if (hasDirectSight) return "contain";
    if (knowledge.source === "footstep" || knowledge.source === "radio" || knowledge.radiusM > 6 || knowledgeAgeS > 1.6) {
      return pressureProfile.collapseWeight >= 0.4 ? "collapse" : "search";
    }
    if (knowledge.confidence >= 0.78 && knowledge.radiusM <= 4.5) return "contain";
    return "search";
  }

  private buildZoneDistanceMap(contactZoneId: string): Map<string, number> {
    const distances = new Map<string, number>([[contactZoneId, 0]]);
    const queue = [contactZoneId];

    while (queue.length > 0) {
      const zoneId = queue.shift()!;
      const currentDistance = distances.get(zoneId) ?? 0;
      const neighbors = this.tacticalGraph?.zoneAdjacency.get(zoneId) ?? [];
      for (const neighborId of neighbors) {
        if (distances.has(neighborId)) continue;
        distances.set(neighborId, currentDistance + 1);
        queue.push(neighborId);
      }
    }

    return distances;
  }

  private pickFallbackNode(
    currentX: number,
    currentZ: number,
    knowledge: BlackboardContact | null,
  ): NodeSelection {
    if (!this.tacticalGraph) return { node: null, score: Number.NEGATIVE_INFINITY };
    let best: TacticalNode | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const node of this.tacticalGraph.nodes) {
      let score = node.coverScore * 5.2;
      score -= Math.sqrt(distanceSq(currentX, currentZ, node.x, node.z)) * 0.08;
      if (knowledge) {
        score += Math.sqrt(distanceSq(knowledge.x, knowledge.z, node.x, node.z)) * 0.03;
        if (knowledge.zoneId && node.zoneId === knowledge.zoneId) score -= 0.85;
      }
      if (this.blackboard.occupiedNodeIds.has(node.id)) {
        score -= 2.5;
      }
      if (node.nodeType === "spawn_cover") score += 1.65;
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    }

    return { node: best, score: bestScore };
  }

  private pickRoleNode(
    role: EnemyRole,
    currentLane: TacticalLane,
    currentZoneId: string | null,
    currentX: number,
    currentZ: number,
    knowledge: BlackboardContact | null,
    searchBelief: SearchBelief | null,
    laneAssignments: Map<TacticalLane, number>,
    tierProfile: ReturnType<typeof resolveEnemyTierProfile>,
    pressureProfile: PressureProfile,
    scoringMode: ScoringMode,
    contactZoneDistances: Map<string, number> | null,
  ): NodeSelection {
    if (!this.tacticalGraph) return { node: null, score: Number.NEGATIVE_INFINITY };

    const playerLane = knowledge?.lane ?? searchBelief?.lane ?? currentLane;
    const dynamicLaneStack = tierProfile.maxLaneStack + (pressureProfile.collapseWeight >= 0.82 ? 1 : 0);
    const contactZoneId = knowledge?.zoneId ?? searchBelief?.zoneId ?? null;
    const currentZoneDistance = currentZoneId && contactZoneDistances
      ? contactZoneDistances.get(currentZoneId) ?? Number.POSITIVE_INFINITY
      : Number.POSITIVE_INFINITY;
    let best: TacticalNode | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const node of this.tacticalGraph.nodes) {
      const travelDistance = Math.sqrt(distanceSq(currentX, currentZ, node.x, node.z));
      const knowledgeDistance = knowledge ? distanceM(knowledge.x, knowledge.z, node.x, node.z) : travelDistance;
      const laneCount = laneAssignments.get(node.lane) ?? 0;
      const occupied = this.blackboard.occupiedNodeIds.has(node.id);
      const zoneDistance = contactZoneDistances?.get(node.zoneId) ?? Number.POSITIVE_INFINITY;
      const progressTowardContact = Number.isFinite(currentZoneDistance) && Number.isFinite(zoneDistance)
        ? currentZoneDistance - zoneDistance
        : 0;
      const sameZone = Boolean(contactZoneId && node.zoneId === contactZoneId);
      const adjacentZone = Boolean(contactZoneId && this.tacticalGraph.zoneAdjacency.get(contactZoneId)?.includes(node.zoneId));
      const entryNode = node.tags.includes("entry-node")
        || node.nodeType === "connector_entry"
        || node.nodeType === "hall_entry"
        || node.nodeType === "breach"
        || node.nodeType === "pre_peek";
      const entryControl = sameZone
        ? (entryNode ? 1.25 : 0.9)
        : adjacentZone
          ? (entryNode ? 1.05 : 0.55)
          : 0;
      const cutoffValue = adjacentZone
        && node.lane !== playerLane
        && (entryNode || node.tags.includes("connector") || node.tags.includes("cut"))
        ? 0.9
        : 0;

      let score = 0;
      score += node.coverScore * (scoringMode === "caution" ? 3.0 : scoringMode === "search" ? 2.35 : scoringMode === "contain" ? 2.45 : 1.95);
      score += node.flankScore * (role === "flanker" ? 1.55 : role === "roamer" ? 1.3 : 1.05);
      score -= travelDistance * (scoringMode === "collapse" ? 0.055 : 0.082);
      if (node.lane === currentLane) score += scoringMode === "caution" ? 0.85 : 0.22;

      if (knowledge) {
        const preferredDistance = role === "anchor" ? 16 : role === "flanker" ? 12.5 : role === "roamer" ? 13.5 : 14;
        const rangeWeight = scoringMode === "caution" ? 0.05 : scoringMode === "search" ? 0.03 : 0.018;
        score -= Math.abs(knowledgeDistance - preferredDistance) * rangeWeight;
        score += clamp01(knowledge.confidence - 0.4) * 0.9;

        if (Number.isFinite(zoneDistance)) {
          score += progressTowardContact * (scoringMode === "collapse" ? 1.7 : scoringMode === "contain" ? 1.3 : 1.05);
          if (sameZone) score += scoringMode === "collapse" ? 2.4 : scoringMode === "contain" ? 1.35 : 0.85;
          if (adjacentZone) score += scoringMode === "collapse" ? 1.05 : 0.8;
          if (entryNode && (sameZone || adjacentZone)) score += scoringMode === "collapse" ? 1.35 : 1.0;
        }
        score += entryControl * (scoringMode === "collapse" ? 1.22 : 1.0);
        score += cutoffValue * (role === "anchor" || role === "roamer" ? 1.1 : 0.75);
        score -= Math.max(0, knowledgeDistance - (knowledge.radiusM + pressureProfile.searchRadiusBonusM)) * (scoringMode === "collapse" ? 0.015 : 0.008);

        if (role === "anchor") {
          if (scoringMode === "caution" && node.nodeType === "spawn_cover") score += 2.3;
          if (entryControl > 0) score += scoringMode === "contain" ? 1.15 : 0.35;
          if (sameZone && scoringMode === "collapse") score -= 0.35;
          if (node.nodeType === "open_node") score -= 1.2;
        } else if (role === "rifler") {
          if (node.lane === playerLane || node.lane === "main") score += 0.8 + pressureProfile.collapseWeight * 0.45;
          if (entryControl > 0) score += 0.4;
        } else if (role === "flanker") {
          if (node.lane !== playerLane && node.lane !== "main") score += 1.8;
          if (entryNode || node.tags.includes("cut") || node.tags.includes("side_hall")) score += 1.55;
          if (sameZone && scoringMode === "collapse") score += 1.0;
        } else {
          if (entryNode || node.tags.includes("connector") || node.tags.includes("cut")) score += 1.2;
          if (adjacentZone) score += 0.9;
        }
      } else if (searchBelief) {
        if (Number.isFinite(zoneDistance)) {
          score += progressTowardContact * (searchBelief.phase === "probe" ? 1.0 : searchBelief.phase === "sweep" ? 1.35 : 1.8);
          if (sameZone) score += searchBelief.phase === "probe" ? 0.85 : searchBelief.phase === "sweep" ? 1.45 : 2.05;
          if (adjacentZone) score += searchBelief.phase === "probe" ? 0.6 : 0.95;
          if (entryNode && (sameZone || adjacentZone)) score += searchBelief.taskKind === "clear" ? 1.15 : 0.8;
        }
        score += searchBelief.score * 0.9;
        score += entryControl * (searchBelief.taskKind === "contain" ? 1.25 : 0.95);
        score += cutoffValue * (searchBelief.taskKind === "contain" ? 1.25 : 0.65);

        if (role === "anchor") {
          if (searchBelief.taskKind === "contain" && adjacentZone) score += 1.15;
          if (sameZone && searchBelief.phase !== "pinch") score -= 0.35;
          if (node.nodeType === "spawn_cover" && searchBelief.phase === "probe") score += 0.85;
        } else if (role === "rifler") {
          if (node.lane === playerLane || node.lane === "main") score += 0.9;
          if (entryNode) score += 0.45;
        } else if (role === "flanker") {
          if (node.lane !== playerLane && node.lane !== "main") score += 1.55;
          if (entryNode || node.tags.includes("cut") || node.tags.includes("side_hall")) score += 1.45;
        } else {
          if (entryNode || node.tags.includes("connector") || node.tags.includes("cut")) score += 1.15;
          if (adjacentZone) score += 0.85;
        }
      } else {
        if (role === "anchor" && node.nodeType === "spawn_cover") score += 2.4;
        if (role === "roamer" && (node.tags.includes("connector") || node.tags.includes("cut") || node.tags.includes("entry-node"))) score += 1.5;
        if (role === "flanker" && (node.tags.includes("side_hall") || node.tags.includes("cut") || node.tags.includes("entry-node"))) score += 1.25;
      }

      if ((tierProfile.collapse || scoringMode === "collapse") && knowledge && (node.lane === playerLane || node.lane === "main")) {
        score += 0.78 + pressureProfile.collapseWeight * 0.4;
        if (knowledgeDistance < 14 + pressureProfile.searchRadiusBonusM * 0.25) score += 0.45;
      }

      if (occupied) score -= 4.5;
      if (laneCount >= dynamicLaneStack) score -= 2.5;
      if (node.nodeType === "open_node" && role === "anchor") score -= 1.3;

      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    }

    return { node: best, score: bestScore };
  }

  applyDamageToEnemy(enemyId: string, damage: number, isHeadshot = false): void {
    for (const controller of this.controllers) {
      if (controller.id === enemyId) {
        controller.applyDamage(damage, isHeadshot);
        return;
      }
    }
  }

  eliminateAllForDebug(): number {
    let eliminated = 0;
    for (const controller of this.controllers) {
      if (controller.isDead()) continue;
      controller.applyDamage(controller.getHealth() + 999, true);
      eliminated += 1;
    }
    return eliminated;
  }

  resetKnowledgeForDebug(): void {
    this.blackboard.lastSeenPlayer = null;
    this.blackboard.lastHeardPlayer = null;
    this.localKnowledgeByEnemyId.clear();
    this.sharedKnowledgeByEnemyId.clear();
    this.pendingSharedReports.length = 0;
    this.squadTaskByEnemyId.clear();
    this.initializeSearchState();
    this.refreshSearchBeliefs();
  }

  suppressPlayerIntelForDebug(durationMs: number): void {
    this.debugPlayerIntelSuppressedUntilS = Math.max(
      this.debugPlayerIntelSuppressedUntilS,
      this.waveElapsedS + Math.max(0, durationMs) / 1000,
    );
    this.resetKnowledgeForDebug();
  }

  getPlayerHealthDelta(): number {
    return this.playerHealthDelta;
  }

  checkRaycastHit(origin: Vector3, dir: Vector3, maxDist: number): EnemyHitResult {
    let bestDist = maxDist;
    let bestId: string | null = null;

    const ox = origin.x;
    const oy = origin.y;
    const oz = origin.z;
    const dx = dir.x;
    const dy = dir.y;
    const dz = dir.z;

    for (const aabb of this.aabbScratch) {
      if (aabb.id === "player") continue;
      const t = rayVsAabb(ox, oy, oz, dx, dy, dz, maxDist, aabb);
      if (t < bestDist) {
        bestDist = t;
        bestId = aabb.id;
      }
    }

    if (bestId === null) return { hit: false };

    return {
      hit: true,
      enemyId: bestId,
      distance: bestDist,
      hitX: ox + dx * bestDist,
      hitY: oy + dy * bestDist,
      hitZ: oz + dz * bestDist,
    };
  }

  dispose(scene: Scene): void {
    for (const visual of this.visuals) {
      visual.dispose(scene);
    }
    this.visuals = [];
    this.controllers = [];
    this.aabbScratch.length = 0;
    this.targetsScratch.length = 0;
    this.deathFadeStarted.clear();
    this.waveRespawnTimer = null;
    this.waveElapsedS = 0;
    this.lastDirectiveByEnemyId.clear();
    this.directiveMemoryByEnemyId.clear();
    this.blackboard.lastSeenPlayer = null;
    this.blackboard.lastHeardPlayer = null;
    this.blackboard.occupiedNodeIds.clear();
    this.localKnowledgeByEnemyId.clear();
    this.sharedKnowledgeByEnemyId.clear();
    this.pendingSharedReports.length = 0;
    this.lastSpawnTelemetry = null;
    this.spawnDebugByEnemyId.clear();
    this.debugPlayerIntelSuppressedUntilS = 0;
  }

  fullDispose(scene: Scene): void {
    this.dispose(scene);
    this.waveNumber = 0;
    this.worldCollidersRef = null;
    this.tacticalGraph = null;
  }

  private resolveEnemyShot(targetId: string, damage: number): void {
    if (targetId === "player") {
      this.playerHealthDelta += damage;
      return;
    }
    this.preventedFriendlyFireCount += 1;
  }

  private isPlayerIntelSuppressed(): boolean {
    return this.waveElapsedS < this.debugPlayerIntelSuppressedUntilS;
  }
}
