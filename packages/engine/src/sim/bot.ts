import type { EntityId, Team } from "@clawd-strike/shared";
import type { MapDef } from "@clawd-strike/shared";
import type { Vec3 } from "@clawd-strike/shared";
import { hashSeed, lcg, rand01 } from "@clawd-strike/shared";
import { NavGrid } from "./navgrid";

export type BotPerception = Readonly<{
  visibleEnemyId: EntityId | null;
  visibleEnemyPos: Vec3 | null;
  enemyInFront: boolean;
}>;

export type BotSelf = {
  id: EntityId;
  team: Team;
  hp: number;
  alive: boolean;
  pos: Vec3;
  yaw: number;
  pitch: number;
};

export type BotInput = Readonly<{
  moveX: number;
  moveY: number;
  yaw: number;
  pitch: number;
  shoot: boolean;
  walk: boolean;
  aimTick: number;
}>;

export type BtStatus = "success" | "failure" | "running";

export type BtNode<Ctx> = Readonly<{
  tick(ctx: Ctx): BtStatus;
}>;

export function btSelector<Ctx>(children: readonly BtNode<Ctx>[]): BtNode<Ctx> {
  return {
    tick(ctx) {
      for (const c of children) {
        const s = c.tick(ctx);
        if (s !== "failure") return s;
      }
      return "failure";
    }
  };
}

export function btSequence<Ctx>(children: readonly BtNode<Ctx>[]): BtNode<Ctx> {
  return {
    tick(ctx) {
      for (const c of children) {
        const s = c.tick(ctx);
        if (s !== "success") return s;
      }
      return "success";
    }
  };
}

export function btCondition<Ctx>(pred: (ctx: Ctx) => boolean): BtNode<Ctx> {
  return {
    tick(ctx) {
      return pred(ctx) ? "success" : "failure";
    }
  };
}

export function btAction<Ctx>(act: (ctx: Ctx) => BtStatus): BtNode<Ctx> {
  return { tick: act };
}

export type BotBrain = {
  readonly nav: NavGrid;
  readonly map: MapDef;
  readonly nextU32: () => number;
  targetPointId: string;
  path: Vec3[];
  pathIndex: number;
  repathAtTick: number;
};

export type BotCtx = {
  tick: number;
  self: BotSelf;
  perception: BotPerception;
  brain: BotBrain;
  out: {
    moveX: number;
    moveY: number;
    yaw: number;
    pitch: number;
    shoot: boolean;
    walk: boolean;
    aimTick: number;
  };
};

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

function angleTo(from: Vec3, to: Vec3): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

function chooseTargetPointId(brain: BotBrain, team: Team): string {
  // Utility scoring over interest points: prefer nearer "forward" objectives.
  // T tends to like (mid, B), CT tends to like (mid, A) in this simple slice.
  const points = brain.map.points;
  let best = points[0]?.id ?? "mid";
  let bestScore = -1e9;
  for (const p of points) {
    let bias = 0;
    if (team === "T") {
      if (p.id.includes("b")) bias += 3;
      if (p.id.includes("mid")) bias += 2;
    } else {
      if (p.id.includes("a")) bias += 3;
      if (p.id.includes("mid")) bias += 2;
    }
    // Deterministic tie-break via seeded jitter (utility scoring must still be deterministic).
    const jitter = (rand01(brain.nextU32) - 0.5) * 0.25;
    const score = bias + jitter;
    if (score > bestScore || (score === bestScore && p.id < best)) {
      bestScore = score;
      best = p.id;
    }
  }
  return best;
}

export function createBotBrain(map: MapDef, matchSeed: number, botId: number): BotBrain {
  const seed = hashSeed(`bot:${matchSeed}:${botId}`);
  return {
    nav: new NavGrid(map),
    map,
    nextU32: lcg(seed),
    targetPointId: "mid",
    path: [],
    pathIndex: 0,
    repathAtTick: 0
  };
}

const BT_ROOT: BtNode<BotCtx> = btSelector<BotCtx>([
  // Engage if we see an enemy.
  btSequence([
    btCondition((ctx) => ctx.self.alive && ctx.perception.visibleEnemyId !== null && ctx.perception.visibleEnemyPos !== null),
    btAction((ctx) => {
      const enemyPos = ctx.perception.visibleEnemyPos;
      if (!enemyPos) return "failure";
      const yaw = angleTo(ctx.self.pos, enemyPos);
      ctx.out.yaw = yaw;
      ctx.out.pitch = 0;
      ctx.out.shoot = ctx.perception.enemyInFront;
      ctx.out.walk = false;
      ctx.out.moveX = 0;
      ctx.out.moveY = 0;
      ctx.out.aimTick = ctx.tick;
      return "success";
    })
  ]),
  // Retreat if low HP.
  btSequence([
    btCondition((ctx) => ctx.self.alive && ctx.self.hp > 0 && ctx.self.hp < 30),
    btAction((ctx) => {
      // Head back towards own spawn interest point.
      const goalId = ctx.self.team === "T" ? "t_spawn" : "ct_spawn";
      ctx.brain.targetPointId = goalId;
      return "success";
    }),
    btAction((ctx) => botMoveTowardsTarget(ctx))
  ]),
  // Patrol / seek objective.
  btSequence([
    btAction((ctx) => {
      if (ctx.brain.path.length === 0 || ctx.tick >= ctx.brain.repathAtTick) {
        ctx.brain.targetPointId = chooseTargetPointId(ctx.brain, ctx.self.team);
      }
      return "success";
    }),
    btAction((ctx) => botMoveTowardsTarget(ctx))
  ])
]);

function botMoveTowardsTarget(ctx: BotCtx): BtStatus {
  const goal = ctx.brain.map.points.find((p) => p.id === ctx.brain.targetPointId)?.pos;
  if (!goal) return "failure";

  if (ctx.tick >= ctx.brain.repathAtTick) {
    ctx.brain.path = ctx.brain.nav.findPath(ctx.self.pos, goal);
    ctx.brain.pathIndex = 0;
    ctx.brain.repathAtTick = ctx.tick + 30; // 0.5s
  }

  const path = ctx.brain.path;
  if (path.length === 0) return "failure";
  const cur = path[Math.min(path.length - 1, ctx.brain.pathIndex)];
  if (!cur) return "failure";
  const dx = cur.x - ctx.self.pos.x;
  const dz = cur.z - ctx.self.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.7 && ctx.brain.pathIndex < path.length - 1) ctx.brain.pathIndex++;

  const desiredYaw = angleTo(ctx.self.pos, cur);
  ctx.out.yaw = desiredYaw;
  ctx.out.pitch = 0;
  ctx.out.walk = false;
  ctx.out.shoot = false;
  ctx.out.aimTick = ctx.tick;

  // Convert desire into move axes in local space.
  const rel = desiredYaw - ctx.self.yaw;
  const sin = Math.sin(rel);
  const cos = Math.cos(rel);
  // Forward is +Y input in our protocol.
  ctx.out.moveX = clamp(sin, -1, 1);
  ctx.out.moveY = clamp(cos, -1, 1);
  return "success";
}

export function tickBot(ctx: BotCtx): BotInput {
  // Default output: keep current aim, idle.
  ctx.out.moveX = 0;
  ctx.out.moveY = 0;
  ctx.out.yaw = ctx.self.yaw;
  ctx.out.pitch = ctx.self.pitch;
  ctx.out.shoot = false;
  ctx.out.walk = false;
  ctx.out.aimTick = ctx.tick;

  BT_ROOT.tick(ctx);

  return {
    moveX: ctx.out.moveX,
    moveY: ctx.out.moveY,
    yaw: ctx.out.yaw,
    pitch: ctx.out.pitch,
    shoot: ctx.out.shoot,
    walk: ctx.out.walk,
    aimTick: ctx.out.aimTick
  };
}
