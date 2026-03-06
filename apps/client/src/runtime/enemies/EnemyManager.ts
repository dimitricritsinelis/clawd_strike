import { Scene, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { WeaponAudio } from "../audio/WeaponAudio";
import type { RuntimeAnchorsSpec, RuntimeBlockoutSpec } from "../map/types";
import { PLAYER_HEIGHT_M, PLAYER_WIDTH_M } from "../sim/PlayerController";
import { rayVsAabb } from "../sim/collision/rayVsAabb";
import type { WorldColliders } from "../sim/collision/WorldColliders";
import { DeterministicRng, deriveSubSeed, resolveRuntimeSeed } from "../utils/Rng";
import {
  EnemyController,
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
  findNearestTacticalNode,
  findTacticalPath,
  type TacticalGraph,
  type TacticalLane,
  type TacticalNode,
} from "./TacticalGraph";

const PLAYER_HALF_WIDTH_M = PLAYER_WIDTH_M * 0.5;
const SPAWN_JITTER_M = 1.5;
const WAVE_RESPAWN_DELAY_S = 5.0;
const SCORE_IMPROVEMENT_THRESHOLD = 0.75;
const LONG_SIGHT_OVERWATCH_RANGE_M = 18;

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

const ENEMY_SPAWN_CONFIG = [
  { name: "Ghost", x: 4.75, z: 20 },
  { name: "Viper", x: 45.25, z: 20 },
  { name: "Wolf", x: 27, z: 41 },
  { name: "Raven", x: 4.75, z: 45 },
  { name: "Hawk", x: 45.25, z: 45 },
  { name: "Cobra", x: 25, z: 59 },
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
  "flanker",
  "flanker",
  "roamer",
  "roamer",
] as const;

type BlackboardContact = {
  x: number;
  y: number;
  z: number;
  timeS: number;
  sourceEnemyId?: string;
  kind?: "gunshot" | "footstep" | "visual";
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

export type EnemyHitResult =
  | { hit: true; enemyId: string; distance: number; hitX: number; hitY: number; hitZ: number }
  | { hit: false };

export type EnemyManagerDebugSnapshot = {
  waveNumber: number;
  waveElapsedS: number;
  tier: number;
  aliveCount: number;
  graphNodeCount: number;
  roleCounts: Record<EnemyRole, number>;
  lastSeenPlayer: BlackboardContact | null;
  lastHeardPlayer: BlackboardContact | null;
  occupiedNodeIds: string[];
  preventedFriendlyFireCount: number;
  enemies: EnemyDebugSnapshot[];
};

function distanceSq(aX: number, aZ: number, bX: number, bZ: number): number {
  const dx = aX - bX;
  const dz = aZ - bZ;
  return dx * dx + dz * dz;
}

function distanceM(aX: number, aZ: number, bX: number, bZ: number): number {
  return Math.hypot(aX - bX, aZ - bZ);
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

export function resolveEnemyTier(waveNumber: number, waveElapsedS: number): number {
  const baseTier = Math.min(Math.max(0, Math.floor((waveNumber - 1) / 2)), 3);
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

  private readonly aabbScratch: EnemyAabb[] = [];
  private readonly targetPool: EnemyTarget[];
  private readonly targetsScratch: EnemyTarget[] = [];
  private readonly playerAabb: EnemyAabb = {
    id: "player",
    minX: 0,
    minY: 0,
    minZ: 0,
    maxX: 0,
    maxY: 0,
    maxZ: 0,
  };
  private playerHealthDelta = 0;
  private preventedFriendlyFireCount = 0;

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

  constructor(scene: Scene) {
    this.scene = scene;
    this.sharedLoader = new GLTFLoader();
    this.targetPool = Array.from({ length: ENEMY_SPAWN_CONFIG.length + 1 }, () => ({
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
    const enemies = this.controllers
      .filter((controller) => !controller.isDead())
      .map((controller) => controller.getDebugSnapshot())
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
      roleCounts,
      lastSeenPlayer: safeCopyContact(this.blackboard.lastSeenPlayer),
      lastHeardPlayer: safeCopyContact(this.blackboard.lastHeardPlayer),
      occupiedNodeIds: Array.from(this.blackboard.occupiedNodeIds.keys()).sort((a, b) => a.localeCompare(b)),
      preventedFriendlyFireCount: this.preventedFriendlyFireCount,
      enemies,
    };
  }

  allDead(): boolean {
    return this.controllers.length > 0 && this.controllers.every((controller) => controller.isDead());
  }

  getWaveCountdownS(): number | null {
    return this.waveRespawnTimer;
  }

  spawn(worldColliders: WorldColliders): void {
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

    if (
      this.controllers.length > 0 &&
      (this.controllers.length !== ENEMY_SPAWN_CONFIG.length || this.visuals.length !== ENEMY_SPAWN_CONFIG.length)
    ) {
      this.dispose(this.scene);
    }

    const mapSeed = resolveRuntimeSeed(this.tacticalMapId, null);
    const waveSeed = deriveSubSeed(mapSeed, `wave_${this.waveNumber}`);
    const jitterRng = new DeterministicRng(waveSeed);
    const pb = worldColliders.playableBounds;

    if (this.controllers.length === 0) {
      for (const config of ENEMY_SPAWN_CONFIG) {
        const id: EnemyId = `enemy_${config.name.toLowerCase()}`;
        const seed = deriveSubSeed(waveSeed, id);
        const { spawnX, spawnZ } = this.getJitteredSpawn(config.x, config.z, jitterRng, pb);
        const controller = new EnemyController(id, config.name, spawnX, spawnZ, seed);
        const visual = new EnemyVisual(config.name, this.scene, this.sharedLoader);
        this.controllers.push(controller);
        this.visuals.push(visual);
      }
    } else {
      for (let i = 0; i < ENEMY_SPAWN_CONFIG.length; i += 1) {
        const config = ENEMY_SPAWN_CONFIG[i]!;
        const controller = this.controllers[i]!;
        const visual = this.visuals[i]!;
        const seed = deriveSubSeed(waveSeed, controller.id);
        const { spawnX, spawnZ } = this.getJitteredSpawn(config.x, config.z, jitterRng, pb);
        controller.reset(spawnX, spawnZ, seed);
        visual.reset();
      }
    }

    this.assignRoles(waveSeed);
  }

  reportPlayerGunshot(position: { x: number; y: number; z: number }): void {
    this.blackboard.lastHeardPlayer = {
      x: position.x,
      y: position.y,
      z: position.z,
      timeS: this.waveElapsedS,
      kind: "gunshot",
    };
  }

  reportPlayerFootstep(position: { x: number; y: number; z: number }, speedMps: number): void {
    if (speedMps <= 0.4) return;
    this.blackboard.lastHeardPlayer = {
      x: position.x,
      y: position.y,
      z: position.z,
      timeS: this.waveElapsedS,
      kind: "footstep",
    };
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

  private getJitteredSpawn(
    baseX: number,
    baseZ: number,
    jitterRng: DeterministicRng,
    playableBounds: { minX: number; minZ: number; maxX: number; maxZ: number },
  ): { spawnX: number; spawnZ: number } {
    const jX = jitterRng.range(-SPAWN_JITTER_M, SPAWN_JITTER_M);
    const jZ = jitterRng.range(-SPAWN_JITTER_M, SPAWN_JITTER_M);
    const margin = ENEMY_HALF_WIDTH_M + 0.5;
    return {
      spawnX: Math.max(playableBounds.minX + margin, Math.min(playableBounds.maxX - margin, baseX + jX)),
      spawnZ: Math.max(playableBounds.minZ + margin, Math.min(playableBounds.maxZ - margin, baseZ + jZ)),
    };
  }

  update(
    deltaSeconds: number,
    playerPos: { x: number; y: number; z: number },
    playerHealth: number,
    worldColliders: WorldColliders,
  ): void {
    this.playerHealthDelta = 0;
    if (!this.allDead()) {
      this.waveElapsedS += Math.max(0, deltaSeconds);
    }
    this.blackboard.currentTier = resolveEnemyTier(this.waveNumber, this.waveElapsedS);

    this.playerAabb.minX = playerPos.x - PLAYER_HALF_WIDTH_M;
    this.playerAabb.minY = playerPos.y;
    this.playerAabb.minZ = playerPos.z - PLAYER_HALF_WIDTH_M;
    this.playerAabb.maxX = playerPos.x + PLAYER_HALF_WIDTH_M;
    this.playerAabb.maxY = playerPos.y + PLAYER_HEIGHT_M;
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

    const tierProfile = resolveEnemyTierProfile(this.blackboard.currentTier);
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
      const directive = this.buildDirective(controller, playerTarget, worldColliders, tierProfile, laneAssignments);
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
          if (event.kind === "seen-player") {
            this.blackboard.lastSeenPlayer = {
              x: event.position.x,
              y: event.position.y,
              z: event.position.z,
              timeS: this.waveElapsedS,
              sourceEnemyId: event.enemyId,
              kind: "visual",
            };
          }
        },
      );
    }

    if (this.allDead()) {
      if (this.waveRespawnTimer === null) {
        this.waveRespawnTimer = WAVE_RESPAWN_DELAY_S;
      } else {
        this.waveRespawnTimer -= deltaSeconds;
        if (this.waveRespawnTimer <= 0 && this.worldCollidersRef) {
          this.spawn(this.worldCollidersRef);
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
        this.weaponAudio?.playAk47ShotQuiet(0.25);
      }
      visual.updateFx(deltaSeconds);
    }
  }

  private buildDirective(
    controller: EnemyController,
    playerTarget: EnemyTarget,
    worldColliders: WorldColliders,
    tierProfile: ReturnType<typeof resolveEnemyTierProfile>,
    laneAssignments: Map<TacticalLane, number>,
  ): EnemyDirective {
    const role = this.blackboard.assignedRoleByEnemyId.get(controller.id) ?? "rifler";
    const roleRank = this.blackboard.roleRankByEnemyId.get(controller.id) ?? 0;
    const activeRole: EnemyRole =
      role === "flanker" && roleRank >= tierProfile.activeFlankers
        ? "rifler"
        : role;

    const controllerPos = controller.getPosition();
    const currentNode = findNearestTacticalNode(this.tacticalGraph, controllerPos.x, controllerPos.z);
    const currentLane = currentNode?.lane ?? laneFromPosition(controllerPos.x);
    const playerDistance = distanceM(controllerPos.x, controllerPos.z, playerTarget.position.x, playerTarget.position.z);
    const hasDirectSight =
      playerDistance <= tierProfile.visionRangeM
      && controller.canSeeTarget(playerTarget, worldColliders, this.aabbScratch);

    const rawKnowledge = this.pickKnowledge(tierProfile);
    const playerLane = laneFromPosition((rawKnowledge ?? playerTarget.position).x);
    const distanceToKnowledge = rawKnowledge
      ? distanceM(controllerPos.x, controllerPos.z, rawKnowledge.x, rawKnowledge.z)
      : Number.POSITIVE_INFINITY;
    const sharedKnowledge = rawKnowledge && this.shouldUseSharedKnowledge(
      activeRole,
      currentLane,
      playerLane,
      distanceToKnowledge,
      tierProfile,
    )
      ? rawKnowledge
      : null;
    const knowledge = hasDirectSight
      ? {
          x: playerTarget.position.x,
          y: playerTarget.position.y,
          z: playerTarget.position.z,
          timeS: this.waveElapsedS,
          kind: "visual" as const,
        }
      : sharedKnowledge;

    let selection: NodeSelection;
    if (controller.isReloading() || (tierProfile.mandatoryReloadFallback && controller.getMag() <= 6 && controller.getReserve() > 0)) {
      selection = this.pickFallbackNode(controllerPos.x, controllerPos.z, knowledge);
    } else if (hasDirectSight && playerDistance > LONG_SIGHT_OVERWATCH_RANGE_M && activeRole !== "flanker" && currentNode) {
      selection = { node: currentNode, score: 999 };
    } else {
      selection = this.pickRoleNode(
        activeRole,
        currentLane,
        controllerPos.x,
        controllerPos.z,
        playerTarget.position,
        knowledge,
        laneAssignments,
        tierProfile,
      );
    }

    let targetNode = selection.node;
    let targetScore = selection.score;
    let state: EnemyState = "HOLD";
    let allowFire = false;
    let debugReason = knowledge
      ? `${knowledge.kind ?? "contact"} memory`
      : activeRole === "anchor"
        ? "default lane hold"
        : "default rotation";

    const atTargetNode = !targetNode || distanceM(controllerPos.x, controllerPos.z, targetNode.x, targetNode.z) <= 1.2;
    const laneBuddyCount = targetNode ? laneAssignments.get(targetNode.lane) ?? 0 : 0;

    if (controller.isReloading() || (tierProfile.mandatoryReloadFallback && controller.getMag() <= 6 && controller.getReserve() > 0)) {
      state = atTargetNode ? "RELOAD" : "FALLBACK";
      debugReason = "reload fallback";
    } else if (hasDirectSight && playerDistance > LONG_SIGHT_OVERWATCH_RANGE_M && activeRole !== "flanker") {
      state = atTargetNode ? "OVERWATCH" : "ROTATE";
      allowFire = atTargetNode;
      debugReason = "direct long sight overwatch";
    } else if (!knowledge) {
      state = atTargetNode ? "HOLD" : "ROTATE";
      debugReason = activeRole === "anchor" ? "default lane hold" : "default rotation";
    } else if (activeRole === "flanker") {
      state = atTargetNode ? "PRESSURE" : knowledge.kind === "footstep" ? "INVESTIGATE" : "ROTATE";
      allowFire = atTargetNode && hasDirectSight;
      debugReason = "active flank pressure";
    } else if (activeRole === "anchor") {
      state = atTargetNode
        ? (hasDirectSight ? "OVERWATCH" : tierProfile.pairSwing && laneBuddyCount > 0 ? "PEEK" : "HOLD")
        : "ROTATE";
      allowFire = atTargetNode && hasDirectSight;
      debugReason = hasDirectSight ? "anchor long hold" : "anchor hold";
    } else if (activeRole === "roamer") {
      state = atTargetNode
        ? (hasDirectSight ? "OVERWATCH" : tierProfile.collapse ? "PRESSURE" : tierProfile.pairSwing && laneBuddyCount > 0 ? "PEEK" : "HOLD")
        : knowledge.kind === "footstep"
          ? "INVESTIGATE"
          : "ROTATE";
      allowFire = atTargetNode && hasDirectSight;
      debugReason = hasDirectSight ? "roamer direct hold" : "roamer crossfire";
    } else {
      state = atTargetNode
        ? (hasDirectSight ? "OVERWATCH" : tierProfile.pairSwing && laneBuddyCount > 0 ? "PEEK" : tierProfile.collapse ? "PRESSURE" : "HOLD")
        : knowledge.kind === "footstep"
          ? "INVESTIGATE"
          : "ROTATE";
      allowFire = atTargetNode && hasDirectSight;
      debugReason = hasDirectSight ? "rifler direct hold" : "rifler lane pressure";
    }

    const previous = this.directiveMemoryByEnemyId.get(controller.id) ?? null;
    if (previous && this.waveElapsedS < previous.commitUntilS) {
      const sameNode = previous.targetNodeId === targetNode?.id;
      const scoreImprovedEnough = targetScore >= previous.score + SCORE_IMPROVEMENT_THRESHOLD;
      const criticalOverride =
        (hasDirectSight && !previous.hadDirectSight)
        || state === "RELOAD"
        || state === "FALLBACK";

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

    const path = findTacticalPath(this.tacticalGraph, currentNode?.id ?? null, targetNode?.id ?? null);
    const moveNodeId = path.length > 1 ? path[1]! : targetNode?.id ?? null;
    const moveNode = moveNodeId ? this.tacticalGraph?.nodeById.get(moveNodeId) ?? null : targetNode;
    const holdPoint = targetNode ? { x: targetNode.x, z: targetNode.z } : null;
    const movePoint = moveNode ? { x: moveNode.x, z: moveNode.z } : holdPoint;
    const focusPoint = this.resolveFocusPoint(targetNode, knowledge, playerTarget.position);
    const changedDirective =
      previous?.targetNodeId !== targetNode?.id
      || previous?.state !== state;
    const startedAtS = changedDirective ? this.waveElapsedS : previous?.startedAtS ?? this.waveElapsedS;
    const commitUntilS = changedDirective
      ? this.waveElapsedS + STATE_COMMIT_S[state]
      : previous?.commitUntilS ?? (this.waveElapsedS + STATE_COMMIT_S[state]);

    this.directiveMemoryByEnemyId.set(controller.id, {
      state,
      targetNodeId: targetNode?.id ?? null,
      score: targetScore,
      startedAtS,
      commitUntilS,
      hadDirectSight: hasDirectSight,
    });

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
      peekOffsetM: activeRole === "anchor" ? 0.7 : activeRole === "flanker" ? 1.05 : 0.85,
      allowFire,
      aggressive: state === "PRESSURE",
      hasDirectSight,
      directiveAgeS: this.waveElapsedS - startedAtS,
      debugReason,
    };
  }

  private resolveFocusPoint(
    targetNode: TacticalNode | null,
    knowledge: BlackboardContact | null,
    playerPos: { x: number; y: number; z: number },
  ): { x: number; y: number; z: number } | null {
    if (knowledge) {
      return {
        x: knowledge.x,
        y: knowledge.y,
        z: knowledge.z,
      };
    }
    if (!targetNode) {
      return {
        x: playerPos.x,
        y: playerPos.y,
        z: playerPos.z,
      };
    }
    return {
      x: targetNode.x + Math.sin(targetNode.exposureYawRad) * 8,
      y: 1.5,
      z: targetNode.z + Math.cos(targetNode.exposureYawRad) * 8,
    };
  }

  private pickKnowledge(
    tierProfile: ReturnType<typeof resolveEnemyTierProfile>,
  ): BlackboardContact | null {
    const seen = this.blackboard.lastSeenPlayer;
    if (seen && this.waveElapsedS - seen.timeS <= tierProfile.memoryS) {
      return seen;
    }
    const heard = this.blackboard.lastHeardPlayer;
    if (heard && this.waveElapsedS - heard.timeS <= Math.max(1.5, tierProfile.memoryS * 0.85)) {
      return heard;
    }
    return null;
  }

  private shouldUseSharedKnowledge(
    role: EnemyRole,
    currentLane: TacticalLane,
    playerLane: TacticalLane,
    distanceToKnowledgeM: number,
    tierProfile: ReturnType<typeof resolveEnemyTierProfile>,
  ): boolean {
    if (!Number.isFinite(distanceToKnowledgeM)) return false;
    if (tierProfile.collapse) return true;
    if (distanceToKnowledgeM <= tierProfile.sharedAlertRadiusM) return true;
    if (role === "anchor") {
      return currentLane === playerLane && distanceToKnowledgeM <= tierProfile.sharedAlertRadiusM * 1.25;
    }
    if (role === "roamer") {
      return currentLane === "main" && distanceToKnowledgeM <= tierProfile.sharedAlertRadiusM * 1.15;
    }
    if (role === "flanker") {
      return currentLane !== playerLane && distanceToKnowledgeM <= tierProfile.sharedAlertRadiusM * 1.5;
    }
    return currentLane === playerLane && distanceToKnowledgeM <= tierProfile.sharedAlertRadiusM * 1.1;
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
        score += Math.sqrt(distanceSq(knowledge.x, knowledge.z, node.x, node.z)) * 0.05;
      }
      if (this.blackboard.occupiedNodeIds.has(node.id)) {
        score -= 2.5;
      }
      if (node.nodeType === "spawn_cover") score += 1.5;
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
    currentX: number,
    currentZ: number,
    playerPos: { x: number; y: number; z: number },
    knowledge: BlackboardContact | null,
    laneAssignments: Map<TacticalLane, number>,
    tierProfile: ReturnType<typeof resolveEnemyTierProfile>,
  ): NodeSelection {
    if (!this.tacticalGraph) return { node: null, score: Number.NEGATIVE_INFINITY };

    const playerLane = laneFromPosition((knowledge ?? playerPos).x);
    let best: TacticalNode | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const node of this.tacticalGraph.nodes) {
      const travelDistance = Math.sqrt(distanceSq(currentX, currentZ, node.x, node.z));
      const knowledgeDistance = knowledge ? distanceM(knowledge.x, knowledge.z, node.x, node.z) : travelDistance;
      const laneCount = laneAssignments.get(node.lane) ?? 0;
      const occupied = this.blackboard.occupiedNodeIds.has(node.id);

      let score = 0;
      score += node.coverScore * 3.1;
      score += node.flankScore * 1.2;
      score -= travelDistance * 0.085;
      if (node.lane === currentLane) score += 0.9;

      if (knowledge) {
        if (role === "anchor") {
          score -= Math.abs(knowledgeDistance - 18) * 0.08;
          if (node.nodeType === "spawn_cover") score += 2.3;
          if (node.lane === currentLane) score += 1.2;
        } else if (role === "rifler") {
          score -= Math.abs(knowledgeDistance - 15) * 0.07;
          if (node.lane === playerLane || node.lane === "main") score += 0.7;
        } else if (role === "flanker") {
          score -= Math.abs(knowledgeDistance - 20) * 0.055;
          if (node.lane !== playerLane && node.lane !== "main") score += 2.5;
          if (node.nodeType === "open_node" || node.tags.includes("cut") || node.tags.includes("side_hall")) {
            score += 1.9;
          }
        } else {
          score -= Math.abs(knowledgeDistance - 16) * 0.06;
          if (node.tags.includes("connector") || node.tags.includes("cut")) score += 1.35;
        }
      } else {
        if (role === "anchor" && node.nodeType === "spawn_cover") score += 2.4;
        if (role === "roamer" && (node.tags.includes("connector") || node.tags.includes("cut"))) score += 1.5;
        if (role === "flanker" && (node.tags.includes("side_hall") || node.tags.includes("cut"))) score += 1.2;
      }

      if (tierProfile.collapse && knowledge && (node.lane === playerLane || node.lane === "main")) {
        score += 0.9;
        if (knowledgeDistance < 14) score += 0.5;
      }

      if (occupied) score -= 4.5;
      if (laneCount >= tierProfile.maxLaneStack) score -= 2.5;
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
  }

  fullDispose(scene: Scene): void {
    this.dispose(scene);
    this.waveNumber = 0;
    this.worldCollidersRef = null;
  }

  private resolveEnemyShot(targetId: string, damage: number): void {
    if (targetId === "player") {
      this.playerHealthDelta += damage;
      return;
    }
    this.preventedFriendlyFireCount += 1;
  }
}
