import { Room, type Client } from "colyseus";

import { dust2Slice } from "@clawd-strike/shared";
import type { ClientInput, EntityId, EntitySnapshot, KillMsg, SnapshotMsg, Team } from "@clawd-strike/shared";
import { DT } from "@clawd-strike/engine";
import {
  AK_DAMAGE_BODY,
  AK_HEAD_MULT,
  AK_MAG_SIZE,
  AK_SHOT_INTERVAL_S,
  PLAYER_HEIGHT,
  RESPAWN_DELAY_S,
  TICK_RATE,
  WEAPON_DRAW_DELAY_S
} from "@clawd-strike/engine";
import { rayIntersectAabb } from "@clawd-strike/engine";
import { clampPitch, computeBulletDir, playerAabbAt, simMove } from "@clawd-strike/engine";
import { createBotBrain, tickBot, type BotBrain, type BotCtx, type BotPerception } from "@clawd-strike/engine";

type MutableVec3 = { x: number; y: number; z: number };

type Entity = {
  id: EntityId;
  kind: "player" | "bot";
  team: Team;
  sessionId: string | null;
  name: string;

  pos: MutableVec3;
  vel: MutableVec3;
  yaw: number;
  pitch: number;

  hp: number;
  alive: boolean;
  ammo: number;

  // Input handling
  lastProcessedSeq: number;
  lastInput: ClientInput;

  // Weapon state
  nextFireTick: number;
  sprayIndex: number;
  lastShotTick: number;
  weaponReadyTick: number;

  // Respawn
  respawnTick: number;

  // Audio sequencing
  footstepSeq: number;
  shotSeq: number;
  stepDistAcc: number;
  walking: boolean;

  // Lag compensation history (positions only)
  history: Float32Array;

  // Bot
  bot: BotBrain | null;
};

const HISTORY_TICKS = 120;
const EYE_Y = 1.55;
const MAX_SHOT_DIST = 200;

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

function vec3(x: number, y: number, z: number): MutableVec3 {
  return { x, y, z };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function parseClientInput(msg: unknown): ClientInput | null {
  if (!msg || typeof msg !== "object") return null;
  const m = msg as Record<string, unknown>;
  if (
    !isFiniteNumber(m.seq) ||
    !isFiniteNumber(m.moveX) ||
    !isFiniteNumber(m.moveY) ||
    !isFiniteNumber(m.yaw) ||
    !isFiniteNumber(m.pitch) ||
    typeof m.shoot !== "boolean" ||
    typeof m.walk !== "boolean" ||
    !isFiniteNumber(m.aimTick)
  ) {
    return null;
  }
  return {
    seq: m.seq,
    moveX: clamp(m.moveX, -1, 1),
    moveY: clamp(m.moveY, -1, 1),
    yaw: m.yaw,
    pitch: m.pitch,
    shoot: m.shoot,
    walk: m.walk,
    aimTick: Math.max(0, Math.floor(m.aimTick))
  };
}

function teamSpawns(team: Team) {
  return dust2Slice.spawns.filter((s) => s.team === team);
}

function pickSpawn(team: Team, salt: number): { pos: MutableVec3; yaw: number } {
  const sp = teamSpawns(team);
  const i = sp.length === 0 ? 0 : salt % sp.length;
  const s = sp[i]!;
  return { pos: vec3(s.pos.x, 0, s.pos.z), yaw: s.yaw };
}

export class FpsRoom extends Room {
  maxClients = 10;

  private serverTick = 0;
  private readonly entities: Entity[] = [];
  private readonly sessionToEntityId = new Map<string, EntityId>();
  private matchSeed = 1337;

  private scoreT = 0;
  private scoreCT = 0;

  onCreate() {
    this.setSimulationInterval(() => this.step(), 1000 / TICK_RATE);

    // Pre-spawn 10 entities as bots; joining clients "possess" a bot to keep a stable 10 slots.
    for (let i = 0; i < 10; i++) {
      const id = (i + 1) as EntityId;
      const team: Team = i < 5 ? "T" : "CT";
      const spawn = pickSpawn(team, id);
      const botBrain = createBotBrain(dust2Slice, this.matchSeed, id);
      this.entities.push({
        id,
        kind: "bot",
        team,
        sessionId: null,
        name: `bot_${id}`,
        pos: spawn.pos,
        vel: vec3(0, 0, 0),
        yaw: spawn.yaw,
        pitch: 0,
        hp: 100,
        alive: true,
        ammo: AK_MAG_SIZE,
        lastProcessedSeq: 0,
        lastInput: { seq: 0, moveX: 0, moveY: 0, yaw: spawn.yaw, pitch: 0, shoot: false, walk: false, aimTick: 0 },
        nextFireTick: 0,
        sprayIndex: 0,
        lastShotTick: -9999,
        weaponReadyTick: 0,
        respawnTick: 0,
        footstepSeq: 0,
        shotSeq: 0,
        stepDistAcc: 0,
        walking: false,
        history: new Float32Array(HISTORY_TICKS * 3),
        bot: botBrain
      });
    }

    this.onMessage("input", (client, message) => {
      const input = parseClientInput(message);
      if (!input) return;
      const id = this.sessionToEntityId.get(client.sessionId);
      if (!id) return;
      const e = this.entities.find((x) => x.id === id);
      if (!e) return;

      // Ignore out-of-order inputs.
      if (input.seq <= e.lastProcessedSeq) return;

      e.lastInput = input;
      e.lastProcessedSeq = input.seq;
      e.yaw = input.yaw;
      e.pitch = clampPitch(input.pitch);
      e.walking = input.walk;
    });
  }

  onJoin(client: Client) {
    const team = this.pickTeamForJoin();
    const e = this.pickUnpossessedBot(team) ?? this.pickUnpossessedBot(team === "T" ? "CT" : "T");
    if (!e) return;

    e.kind = "player";
    e.sessionId = client.sessionId;
    e.name = `p_${client.sessionId.slice(0, 4)}`;
    e.bot = null;
    this.sessionToEntityId.set(client.sessionId, e.id);

    // Spawn with a small draw delay.
    this.forceRespawn(e, this.serverTick);
    e.weaponReadyTick = this.serverTick + Math.round(WEAPON_DRAW_DELAY_S * TICK_RATE);
  }

  onLeave(client: Client) {
    const id = this.sessionToEntityId.get(client.sessionId);
    if (!id) return;
    this.sessionToEntityId.delete(client.sessionId);
    const e = this.entities.find((x) => x.id === id);
    if (!e) return;

    // Turn back into a bot so the server keeps running.
    e.kind = "bot";
    e.sessionId = null;
    e.name = `bot_${e.id}`;
    e.bot = createBotBrain(dust2Slice, this.matchSeed, e.id);
    e.lastInput = { seq: 0, moveX: 0, moveY: 0, yaw: e.yaw, pitch: e.pitch, shoot: false, walk: false, aimTick: this.serverTick };
    e.lastProcessedSeq = 0;
  }

  private pickTeamForJoin(): Team {
    let tHumans = 0;
    let ctHumans = 0;
    for (const e of this.entities) {
      if (e.kind !== "player" || !e.sessionId) continue;
      if (e.team === "T") tHumans++;
      else ctHumans++;
    }
    return tHumans <= ctHumans ? "T" : "CT";
  }

  private pickUnpossessedBot(team: Team): Entity | null {
    for (const e of this.entities) {
      if (e.team === team && e.kind === "bot" && e.sessionId === null) return e;
    }
    return null;
  }

  private step() {
    this.serverTick++;

    // Respawns
    for (const e of this.entities) {
      if (!e.alive && this.serverTick >= e.respawnTick) {
        this.forceRespawn(e, this.serverTick);
        e.weaponReadyTick = this.serverTick + Math.round(WEAPON_DRAW_DELAY_S * TICK_RATE);
      }
    }

    // Bot thinking -> fill inputs
    for (const e of this.entities) {
      if (e.kind !== "bot" || !e.bot) continue;
      if (!e.alive) continue;

      const perception = this.perceive(e);
      const ctx: BotCtx = {
        tick: this.serverTick,
        self: { id: e.id, team: e.team, hp: e.hp, alive: e.alive, pos: e.pos, yaw: e.yaw, pitch: e.pitch },
        perception,
        brain: e.bot,
        out: { moveX: 0, moveY: 0, yaw: e.yaw, pitch: e.pitch, shoot: false, walk: false, aimTick: this.serverTick }
      };
      const bi = tickBot(ctx);
      e.lastInput = { seq: e.lastProcessedSeq + 1, ...bi };
      e.lastProcessedSeq = e.lastInput.seq;
      e.yaw = bi.yaw;
      e.pitch = clampPitch(bi.pitch);
      e.walking = bi.walk;
    }

    // Movement
    for (const e of this.entities) {
      if (!e.alive) continue;
      const cmd = {
        moveX: e.lastInput.moveX,
        moveY: e.lastInput.moveY,
        yaw: e.yaw,
        pitch: e.pitch,
        walk: e.lastInput.walk
      };
      simMove(e.pos, e.vel, cmd, dust2Slice.colliders, DT);

      // Footstep sequencing (distance-based).
      const speed = Math.hypot(e.vel.x, e.vel.z);
      if (speed > 0.75) {
        e.stepDistAcc += speed * DT;
        const stride = e.lastInput.walk ? 2.2 : 1.8;
        if (e.stepDistAcc >= stride) {
          e.stepDistAcc -= stride;
          e.footstepSeq++;
        }
      } else {
        e.stepDistAcc = 0;
      }
    }

    // Shooting (authoritative)
    const ticksPerShot = Math.max(1, Math.round((AK_SHOT_INTERVAL_S * TICK_RATE) / 1));
    for (const e of this.entities) {
      if (!e.alive) continue;
      if (!e.lastInput.shoot) continue;
      if (this.serverTick < e.weaponReadyTick) continue;
      if (this.serverTick < e.nextFireTick) continue;
      if (e.ammo <= 0) continue;

      const resetTicks = 18;
      if (this.serverTick - e.lastShotTick > resetTicks) e.sprayIndex = 0;

      const sprayIndex = e.sprayIndex;
      e.sprayIndex = Math.min(29, e.sprayIndex + 1);
      e.lastShotTick = this.serverTick;
      e.nextFireTick = this.serverTick + ticksPerShot;
      e.ammo--;
      e.shotSeq++;

      const origin = { x: e.pos.x, y: EYE_Y, z: e.pos.z };
      const dir = computeBulletDir(e.yaw, e.pitch, sprayIndex, e.vel);
      const aimTick = clamp(e.lastInput.aimTick, this.serverTick - (HISTORY_TICKS - 1), this.serverTick);

      this.resolveShot(e, origin, dir, aimTick);
    }

    // Record history after simulation.
    for (const e of this.entities) {
      const base = (this.serverTick % HISTORY_TICKS) * 3;
      e.history[base + 0] = e.pos.x;
      e.history[base + 1] = e.pos.y;
      e.history[base + 2] = e.pos.z;
    }

    // Snapshots at 20Hz (every 3 ticks).
    if (this.serverTick % 3 === 0) {
      for (const client of this.clients) {
        const id = this.sessionToEntityId.get(client.sessionId);
        if (!id) continue;
        const you = this.entities.find((x) => x.id === id);
        if (!you) continue;
        const msg: SnapshotMsg = {
          type: "snapshot",
          serverTick: this.serverTick,
          entities: this.entities.map((e): EntitySnapshot => ({
            id: e.id,
            kind: e.kind,
            team: e.team,
            pos: { x: e.pos.x, y: e.pos.y, z: e.pos.z },
            vel: { x: e.vel.x, y: e.vel.y, z: e.vel.z },
            yaw: e.yaw,
            pitch: e.pitch,
            hp: e.hp,
            alive: e.alive,
            ammo: e.ammo,
            footstepSeq: e.footstepSeq,
            shotSeq: e.shotSeq
          })),
          you: { id: you.id, lastProcessedSeq: you.lastProcessedSeq },
          score: { T: this.scoreT, CT: this.scoreCT }
        };
        client.send("snapshot", msg);
      }
    }

    // Avoid unbounded tick growth in long sessions (keeps aimTick clamp stable).
    if (this.serverTick > 10_000_000) this.serverTick = HISTORY_TICKS + 10;
  }

  private forceRespawn(e: Entity, tick: number) {
    const spawn = pickSpawn(e.team, e.id + tick);
    e.pos.x = spawn.pos.x;
    e.pos.y = 0;
    e.pos.z = spawn.pos.z;
    e.vel.x = 0;
    e.vel.y = 0;
    e.vel.z = 0;
    e.yaw = spawn.yaw;
    e.pitch = 0;
    e.hp = 100;
    e.alive = true;
    e.ammo = AK_MAG_SIZE;
    e.nextFireTick = tick;
    e.sprayIndex = 0;
    e.lastShotTick = -9999;
    e.stepDistAcc = 0;
  }

  private perceive(self: Entity): BotPerception {
    // Simple LOS check: nearest visible enemy within a distance, without wall intersection.
    let bestId: EntityId | null = null;
    let bestPos: MutableVec3 | null = null;
    let bestDistSq = 999999;

    const origin = { x: self.pos.x, y: EYE_Y, z: self.pos.z };
    for (const e of this.entities) {
      if (!e.alive) continue;
      if (e.team === self.team) continue;
      const dx = e.pos.x - self.pos.x;
      const dz = e.pos.z - self.pos.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > 45 * 45) continue;

      // World occlusion: ray to target body center.
      const dir = { x: dx, y: (PLAYER_HEIGHT * 0.6 - EYE_Y), z: dz };
      const len = Math.hypot(dir.x, dir.y, dir.z);
      if (len < 1e-6) continue;
      dir.x /= len;
      dir.y /= len;
      dir.z /= len;

      const tWorld = this.rayWorldFirstHit(origin, dir, len);
      if (tWorld !== null && tWorld < len) continue;

      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestId = e.id;
        bestPos = e.pos;
      }
    }

    let enemyInFront = false;
    if (bestPos) {
      const desiredYaw = Math.atan2(bestPos.x - self.pos.x, bestPos.z - self.pos.z);
      const dy = Math.atan2(Math.sin(desiredYaw - self.yaw), Math.cos(desiredYaw - self.yaw));
      enemyInFront = Math.abs(dy) < 0.35;
    }

    return {
      visibleEnemyId: bestId,
      visibleEnemyPos: bestPos ? { x: bestPos.x, y: bestPos.y, z: bestPos.z } : null,
      enemyInFront
    };
  }

  private rayWorldFirstHit(origin: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, maxDist: number) {
    let bestT: number | null = null;
    for (const c of dust2Slice.colliders) {
      const t = rayIntersectAabb(origin, dir, c, 0.001, maxDist);
      if (t === null) continue;
      if (bestT === null || t < bestT) bestT = t;
    }
    return bestT;
  }

  private resolveShot(shooter: Entity, origin: Vec3Like, dir: Vec3Like, aimTick: number) {
    const worldT = this.rayWorldFirstHit(origin, dir, MAX_SHOT_DIST);

    let bestHitT: number | null = null;
    let bestVictim: Entity | null = null;
    let bestHead = false;

    for (const e of this.entities) {
      if (!e.alive) continue;
      if (e.team === shooter.team) continue;
      if (e.id === shooter.id) continue;

      const rewound = this.getRewoundPos(e, aimTick);
      const headAabb = {
        min: { x: rewound.x - 0.18, y: rewound.y + 1.45, z: rewound.z - 0.18 },
        max: { x: rewound.x + 0.18, y: rewound.y + 1.7, z: rewound.z + 0.18 }
      };
      const bodyAabb = playerAabbAt(rewound);

      const tHead = rayIntersectAabb(origin, dir, headAabb, 0.001, MAX_SHOT_DIST);
      const tBody = rayIntersectAabb(origin, dir, bodyAabb, 0.001, MAX_SHOT_DIST);

      let t: number | null = null;
      let head = false;
      if (tHead !== null && (tBody === null || tHead <= tBody)) {
        t = tHead;
        head = true;
      } else if (tBody !== null) {
        t = tBody;
        head = false;
      }
      if (t === null) continue;

      // Wall before victim.
      if (worldT !== null && worldT < t) continue;

      if (bestHitT === null || t < bestHitT) {
        bestHitT = t;
        bestVictim = e;
        bestHead = head;
      }
    }

    if (!bestVictim) return;

    const dmg = bestHead ? Math.round(AK_DAMAGE_BODY * AK_HEAD_MULT) : AK_DAMAGE_BODY;
    bestVictim.hp -= dmg;

    if (bestVictim.hp > 0) return;

    bestVictim.hp = 0;
    bestVictim.alive = false;
    bestVictim.respawnTick = this.serverTick + Math.round(RESPAWN_DELAY_S * TICK_RATE);

    if (shooter.team === "T") this.scoreT++;
    else this.scoreCT++;

    const kill: KillMsg = {
      type: "kill",
      serverTick: this.serverTick,
      killerId: shooter.id,
      victimId: bestVictim.id,
      killerTeam: shooter.team,
      victimTeam: bestVictim.team,
      headshot: bestHead
    };
    this.broadcast("kill", kill);
  }

  private getRewoundPos(e: Entity, tick: number): Vec3Like {
    const base = (tick % HISTORY_TICKS) * 3;
    return { x: e.history[base + 0] ?? e.pos.x, y: e.history[base + 1] ?? e.pos.y, z: e.history[base + 2] ?? e.pos.z };
  }
}

type Vec3Like = { x: number; y: number; z: number };
