export type TickIntent = {
  moveX: number;
  moveZ: number;
  lookYawDelta: number;
  lookPitchDelta: number;
  jump: boolean;
  fire: boolean;
  reload: boolean;
  sprint: boolean;
};

export type AgentAction = Partial<TickIntent>;

const AXIS_MIN = -1;
const AXIS_MAX = 1;
const LOOK_DELTA_LIMIT_DEG = 180;

export function resetTickIntent(intent: TickIntent): void {
  intent.moveX = 0;
  intent.moveZ = 0;
  intent.lookYawDelta = 0;
  intent.lookPitchDelta = 0;
  intent.jump = false;
  intent.fire = false;
  intent.reload = false;
  intent.sprint = true;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(min, value));
}

function parseOptionalBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  return undefined;
}

function parseOptionalNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return clamp(value, min, max);
}

export function normalizeAgentAction(action: unknown): AgentAction | null {
  if (!action || typeof action !== "object") {
    return null;
  }

  const candidate = action as Record<string, unknown>;
  const normalized: AgentAction = {};

  const moveX = parseOptionalNumber(candidate.moveX, AXIS_MIN, AXIS_MAX);
  if (moveX !== undefined) normalized.moveX = moveX;

  const moveZ = parseOptionalNumber(candidate.moveZ, AXIS_MIN, AXIS_MAX);
  if (moveZ !== undefined) normalized.moveZ = moveZ;

  const lookYawDelta = parseOptionalNumber(candidate.lookYawDelta, -LOOK_DELTA_LIMIT_DEG, LOOK_DELTA_LIMIT_DEG);
  if (lookYawDelta !== undefined) normalized.lookYawDelta = lookYawDelta;

  const lookPitchDelta = parseOptionalNumber(candidate.lookPitchDelta, -LOOK_DELTA_LIMIT_DEG, LOOK_DELTA_LIMIT_DEG);
  if (lookPitchDelta !== undefined) normalized.lookPitchDelta = lookPitchDelta;

  const jump = parseOptionalBool(candidate.jump);
  if (jump !== undefined) normalized.jump = jump;

  const fire = parseOptionalBool(candidate.fire);
  if (fire !== undefined) normalized.fire = fire;

  const reload = parseOptionalBool(candidate.reload);
  if (reload !== undefined) normalized.reload = reload;

  const sprint = parseOptionalBool(candidate.sprint);
  if (sprint !== undefined) normalized.sprint = sprint;

  return normalized;
}
