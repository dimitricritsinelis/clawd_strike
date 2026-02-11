export type Team = "T" | "CT";

export type SurfaceTag = "stone" | "concrete" | "sand" | "metal" | "wood";

export type EntityKind = "player" | "bot";

export type EntityId = number;

export type InputSeq = number;

export type ClientInput = Readonly<{
  seq: InputSeq;
  // Move axes: -1..1
  moveX: number;
  moveY: number;
  // Look (radians)
  yaw: number;
  pitch: number;
  // Buttons
  shoot: boolean;
  walk: boolean;
  // Lag-comp hint: last server tick the client has seen.
  aimTick: number;
}>;

export type EntitySnapshot = Readonly<{
  id: EntityId;
  kind: EntityKind;
  team: Team;
  pos: { x: number; y: number; z: number };
  vel: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  hp: number;
  alive: boolean;
  ammo: number;
  // For client audio: increments when a step occurs.
  footstepSeq: number;
  // Increments each time this entity fires.
  shotSeq: number;
}>;

export type SnapshotMsg = Readonly<{
  type: "snapshot";
  serverTick: number;
  entities: EntitySnapshot[];
  // Per-client reconciliation
  you: Readonly<{
    id: EntityId;
    lastProcessedSeq: InputSeq;
  }>;
  score: Readonly<{
    T: number;
    CT: number;
  }>;
}>;

export type KillMsg = Readonly<{
  type: "kill";
  serverTick: number;
  killerId: EntityId;
  victimId: EntityId;
  killerTeam: Team;
  victimTeam: Team;
  headshot: boolean;
}>;
