import * as THREE from "three";

import type { MapDef } from "@clawd-strike/shared";
import type { ClientInput, EntitySnapshot, KillMsg, SnapshotMsg, SurfaceTag } from "@clawd-strike/shared";
import { clampPitch, simMove } from "@clawd-strike/engine";

import { WorldRenderer } from "./world/WorldRenderer";

type MutableVec3 = { x: number; y: number; z: number };

type GameArgs = {
  canvas: HTMLCanvasElement;
  map: MapDef;
  statusEl: HTMLDivElement;
  feedEl: HTMLDivElement;
};

type LocalControls = {
  w: boolean;
  a: boolean;
  s: boolean;
  d: boolean;
  walk: boolean;
  shoot: boolean;
};

type VisualEntity = {
  body: THREE.Mesh;
  head: THREE.Mesh;
  tx: number;
  ty: number;
  tz: number;
  yaw: number;
  pitch: number;
  hp: number;
  alive: boolean;
  team: "T" | "CT";
  lastFootstepSeq: number;
  lastShotSeq: number;
};

type SendInputFn = (input: ClientInput) => void;

type FeedRow = {
  text: string;
  expiresAtMs: number;
};

const MOUSE_SENS = 0.00175;
const INTERP_ALPHA = 0.22;
const MAX_FEED = 8;
const FEED_TTL_MS = 4600;

const FOOTSTEP_BASE_GAIN = 0.06;
const GUN_BASE_GAIN = 0.11;

function teamColor(team: "T" | "CT"): number {
  return team === "T" ? 0xbe8342 : 0x4f9ec7;
}

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly map: MapDef;
  private readonly statusEl: HTMLDivElement;
  private readonly feedEl: HTMLDivElement;

  private readonly renderer: THREE.WebGLRenderer | null;
  private readonly fallback2d: CanvasRenderingContext2D | null;
  private readonly useFallback2d: boolean;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new THREE.Clock();
  private readonly world: WorldRenderer | null;

  private sendInput: SendInputFn | null = null;

  private pointerLocked = false;
  private readonly controls: LocalControls = { w: false, a: false, s: false, d: false, walk: false, shoot: false };

  private seq = 0;
  private serverTick = 0;
  private localEntityId: number | null = null;
  private lastProcessedSeq = 0;
  private pendingInputs: ClientInput[] = [];

  private localPos: MutableVec3 = { x: -40, y: 0, z: -16 };
  private localVel: MutableVec3 = { x: 0, y: 0, z: 0 };
  private localYaw = 0;
  private localPitch = 0;
  private localHp = 100;
  private localAmmo = 30;
  private localAlive = true;
  private localTeam: "T" | "CT" = "T";

  private scoreT = 0;
  private scoreCT = 0;

  private readonly entities = new Map<number, VisualEntity>();
  private readonly feedRows: FeedRow[] = [];

  private readonly listener = new THREE.AudioListener();
  private audioCtx: AudioContext | null = null;
  private footstepCooldownMs = 0;
  private shotCooldownMs = 0;

  private aliveT = 0;
  private aliveCT = 0;
  private disposed = false;

  private readonly onResize = () => {
    if (this.useFallback2d) {
      this.canvas.width = Math.max(1, window.innerWidth);
      this.canvas.height = Math.max(1, window.innerHeight);
    } else {
      this.renderer?.setSize(window.innerWidth, window.innerHeight);
      this.world?.resize(window.innerWidth, window.innerHeight);
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    }
  };

  private readonly onKeyDown = (ev: KeyboardEvent) => {
    if (ev.code === "KeyW") this.controls.w = true;
    if (ev.code === "KeyA") this.controls.a = true;
    if (ev.code === "KeyS") this.controls.s = true;
    if (ev.code === "KeyD") this.controls.d = true;
    if (ev.code === "ShiftLeft" || ev.code === "ShiftRight") this.controls.walk = true;
    if (ev.code === "KeyF") {
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        void this.canvas.requestFullscreen();
      }
    }
  };

  private readonly onKeyUp = (ev: KeyboardEvent) => {
    if (ev.code === "KeyW") this.controls.w = false;
    if (ev.code === "KeyA") this.controls.a = false;
    if (ev.code === "KeyS") this.controls.s = false;
    if (ev.code === "KeyD") this.controls.d = false;
    if (ev.code === "ShiftLeft" || ev.code === "ShiftRight") this.controls.walk = false;
  };

  private readonly onMouseDown = (ev: MouseEvent) => {
    if (ev.button === 0) this.controls.shoot = true;
  };

  private readonly onMouseUp = (ev: MouseEvent) => {
    if (ev.button === 0) this.controls.shoot = false;
  };

  private readonly onMouseMove = (ev: MouseEvent) => {
    if (!this.pointerLocked) return;
    this.localYaw -= ev.movementX * MOUSE_SENS;
    this.localPitch = clampPitch(this.localPitch - ev.movementY * MOUSE_SENS);
  };

  constructor(args: GameArgs) {
    this.canvas = args.canvas;
    this.map = args.map;
    this.statusEl = args.statusEl;
    this.feedEl = args.feedEl;

    let renderer: THREE.WebGLRenderer | null = null;
    let fallback2d: CanvasRenderingContext2D | null = null;
    let useFallback2d = false;

    try {
      renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
    } catch {
      useFallback2d = true;
      fallback2d = this.canvas.getContext("2d");
      if (!fallback2d) {
        throw new Error("Could not initialize WebGL or 2D canvas fallback.");
      }
      this.canvas.width = Math.max(1, window.innerWidth);
      this.canvas.height = Math.max(1, window.innerHeight);
    }

    this.renderer = renderer;
    this.fallback2d = fallback2d;
    this.useFallback2d = useFallback2d;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xd7bf94);
    this.scene.fog = new THREE.Fog(0xd6bd90, 56, 190);

    this.camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.05, 400);
    this.camera.position.set(this.localPos.x, 1.55, this.localPos.z);
    this.camera.add(this.listener);
    this.scene.add(this.camera);

    if (!this.useFallback2d && this.renderer) {
      this.world = new WorldRenderer({ renderer: this.renderer, scene: this.scene, camera: this.camera, map: this.map });
    } else {
      this.world = null;
    }

    this.bindInput();
    this.updateHud();
  }

  setSendInput(fn: SendInputFn) {
    this.sendInput = fn;
  }

  setPointerLocked(locked: boolean) {
    this.pointerLocked = locked;
    if (locked && !this.audioCtx) {
      this.audioCtx = new AudioContext();
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("mousemove", this.onMouseMove);

    if (!this.useFallback2d) {
      for (const vis of this.entities.values()) {
        this.disposeMesh(vis.body);
        this.disposeMesh(vis.head);
      }
    }
    this.entities.clear();

    this.world?.dispose();
    this.renderer?.dispose();
    this.camera.remove(this.listener);

    const ctx = this.audioCtx;
    this.audioCtx = null;
    if (ctx) {
      void ctx.close().catch(() => {
        // Ignore race during page unload.
      });
    }
  }

  step(dt: number) {
    this.simulateLocalPrediction(dt);
    this.updateRemoteVisuals();

    const speed = Math.hypot(this.localVel.x, this.localVel.z);
    this.world?.update(dt, speed, this.pointerLocked);

    const nowMs = performance.now();
    if (nowMs > this.footstepCooldownMs + 140) this.footstepCooldownMs = 0;
    if (nowMs > this.shotCooldownMs + 60) this.shotCooldownMs = 0;

    this.trimFeed(nowMs);
    this.updateHud();
  }

  render() {
    if (this.useFallback2d) {
      this.renderFallback2d();
      return;
    }

    this.camera.position.set(this.localPos.x, 1.55, this.localPos.z);
    const cp = Math.cos(this.localPitch);
    const lookDir = new THREE.Vector3(Math.sin(this.localYaw) * cp, Math.sin(this.localPitch), Math.cos(this.localYaw) * cp);
    this.camera.lookAt(this.camera.position.clone().add(lookDir));

    this.world?.render();
  }

  onSnapshot(msg: SnapshotMsg) {
    this.serverTick = msg.serverTick;
    this.lastProcessedSeq = msg.you.lastProcessedSeq;
    this.scoreT = msg.score.T;
    this.scoreCT = msg.score.CT;
    this.localEntityId = msg.you.id;

    this.aliveT = 0;
    this.aliveCT = 0;

    let localSnap: EntitySnapshot | null = null;
    const seen = new Set<number>();

    for (const s of msg.entities) {
      seen.add(s.id);
      if (s.team === "T" && s.alive) this.aliveT++;
      if (s.team === "CT" && s.alive) this.aliveCT++;

      if (s.id === this.localEntityId) {
        localSnap = s;
        this.localTeam = s.team;
      }

      let vis = this.entities.get(s.id);
      if (!vis) {
        vis = this.spawnVisualEntity(s);
        this.entities.set(s.id, vis);
      }

      vis.tx = s.pos.x;
      vis.ty = s.pos.y;
      vis.tz = s.pos.z;
      vis.yaw = s.yaw;
      vis.pitch = s.pitch;
      vis.hp = s.hp;
      vis.alive = s.alive;
      vis.team = s.team;
      vis.body.visible = s.alive;
      vis.head.visible = s.alive;

      const footstepDelta = s.footstepSeq - vis.lastFootstepSeq;
      if (footstepDelta > 0) {
        vis.lastFootstepSeq = s.footstepSeq;
        if (s.id !== this.localEntityId) this.playFootstepAt(s.pos.x, s.pos.z);
      }

      const shotDelta = s.shotSeq - vis.lastShotSeq;
      if (shotDelta > 0) {
        vis.lastShotSeq = s.shotSeq;
        if (s.id !== this.localEntityId) this.playGunAt(s.pos.x, s.pos.z);
      }
    }

    for (const [id, vis] of this.entities) {
      if (seen.has(id)) continue;
      if (!this.useFallback2d) {
        this.scene.remove(vis.body);
        this.scene.remove(vis.head);
      }
      this.entities.delete(id);
    }

    if (localSnap) {
      this.localPos.x = localSnap.pos.x;
      this.localPos.y = localSnap.pos.y;
      this.localPos.z = localSnap.pos.z;
      this.localVel.x = localSnap.vel.x;
      this.localVel.y = localSnap.vel.y;
      this.localVel.z = localSnap.vel.z;
      this.localYaw = localSnap.yaw;
      this.localPitch = localSnap.pitch;
      this.localHp = localSnap.hp;
      this.localAmmo = localSnap.ammo;
      this.localAlive = localSnap.alive;

      this.pendingInputs = this.pendingInputs.filter((i) => i.seq > this.lastProcessedSeq);
      for (const input of this.pendingInputs) {
        this.localYaw = input.yaw;
        this.localPitch = input.pitch;
        simMove(
          this.localPos,
          this.localVel,
          {
            moveX: input.moveX,
            moveY: input.moveY,
            yaw: input.yaw,
            pitch: input.pitch,
            walk: input.walk
          },
          this.map.colliders,
          1 / 60
        );
      }
    }
  }

  onKill(msg: KillMsg) {
    const head = msg.headshot ? " HS" : "";
    this.pushFeed(`${msg.killerId} > ${msg.victimId}${head}`);
    if (msg.killerId === this.localEntityId) this.playGunAt(this.localPos.x, this.localPos.z);
  }

  renderGameToText(): string {
    const visibleEntities = [...this.entities.entries()].map(([id, v]) => ({
      id,
      team: v.team,
      alive: v.alive,
      hp: v.hp,
      x: Number(v.tx.toFixed(2)),
      y: Number(v.ty.toFixed(2)),
      z: Number(v.tz.toFixed(2))
    }));

    const diagnostics = this.world?.diagnostics() ?? { drawCalls: 0, triangles: 0, materials: 0 };

    return JSON.stringify({
      coordinate_system: {
        origin: "map center at (0,0,0)",
        axes: "x right/left, y up, z forward/back"
      },
      mode: this.pointerLocked ? "play" : "menu",
      fallbackMode: this.useFallback2d,
      render: {
        drawCalls: diagnostics.drawCalls,
        triangles: diagnostics.triangles,
        materials: diagnostics.materials
      },
      serverTick: this.serverTick,
      player: {
        id: this.localEntityId,
        team: this.localTeam,
        alive: this.localAlive,
        hp: this.localHp,
        ammo: this.localAmmo,
        pos: { x: Number(this.localPos.x.toFixed(2)), y: Number(this.localPos.y.toFixed(2)), z: Number(this.localPos.z.toFixed(2)) },
        vel: { x: Number(this.localVel.x.toFixed(2)), y: Number(this.localVel.y.toFixed(2)), z: Number(this.localVel.z.toFixed(2)) },
        yaw: Number(this.localYaw.toFixed(3)),
        pitch: Number(this.localPitch.toFixed(3))
      },
      teams: {
        score: { T: this.scoreT, CT: this.scoreCT },
        alive: { T: this.aliveT, CT: this.aliveCT }
      },
      entities: visibleEntities
    });
  }

  private spawnVisualEntity(s: EntitySnapshot): VisualEntity {
    if (this.useFallback2d) {
      const dummy = new THREE.Mesh();
      return {
        body: dummy,
        head: dummy,
        tx: s.pos.x,
        ty: s.pos.y,
        tz: s.pos.z,
        yaw: s.yaw,
        pitch: s.pitch,
        hp: s.hp,
        alive: s.alive,
        team: s.team,
        lastFootstepSeq: s.footstepSeq,
        lastShotSeq: s.shotSeq
      };
    }

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.3, 1.1, 4, 6),
      new THREE.MeshStandardMaterial({ color: teamColor(s.team), roughness: 0.75, metalness: 0.05 })
    );
    body.castShadow = true;
    body.receiveShadow = false;
    body.position.set(s.pos.x, s.pos.y + 0.85, s.pos.z);
    this.scene.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xd2b08b, roughness: 0.65, metalness: 0.02 })
    );
    head.castShadow = true;
    head.position.set(s.pos.x, s.pos.y + 1.55, s.pos.z);
    this.scene.add(head);

    return {
      body,
      head,
      tx: s.pos.x,
      ty: s.pos.y,
      tz: s.pos.z,
      yaw: s.yaw,
      pitch: s.pitch,
      hp: s.hp,
      alive: s.alive,
      team: s.team,
      lastFootstepSeq: s.footstepSeq,
      lastShotSeq: s.shotSeq
    };
  }

  private updateRemoteVisuals() {
    if (this.useFallback2d) return;

    for (const [id, v] of this.entities) {
      if (id === this.localEntityId) {
        v.body.visible = false;
        v.head.visible = false;
        continue;
      }

      const pos = v.body.position;
      pos.x += (v.tx - pos.x) * INTERP_ALPHA;
      pos.y += (v.ty + 0.85 - pos.y) * INTERP_ALPHA;
      pos.z += (v.tz - pos.z) * INTERP_ALPHA;
      v.body.rotation.y = v.yaw;
      v.head.position.set(pos.x, pos.y + 0.7, pos.z);
    }
  }

  private simulateLocalPrediction(dt: number) {
    if (!this.pointerLocked || !this.localAlive) return;

    const moveX = (this.controls.d ? 1 : 0) - (this.controls.a ? 1 : 0);
    const moveY = (this.controls.w ? 1 : 0) - (this.controls.s ? 1 : 0);

    const input: ClientInput = {
      seq: ++this.seq,
      moveX,
      moveY,
      yaw: this.localYaw,
      pitch: this.localPitch,
      shoot: this.controls.shoot,
      walk: this.controls.walk,
      aimTick: this.serverTick
    };

    this.pendingInputs.push(input);
    if (this.pendingInputs.length > 120) this.pendingInputs.shift();
    this.sendInput?.(input);

    simMove(
      this.localPos,
      this.localVel,
      {
        moveX: input.moveX,
        moveY: input.moveY,
        yaw: input.yaw,
        pitch: input.pitch,
        walk: input.walk
      },
      this.map.colliders,
      dt
    );

    if (this.controls.shoot) this.playGunAt(this.localPos.x, this.localPos.z);
    if ((Math.abs(this.localVel.x) + Math.abs(this.localVel.z)) > 2.8) this.playFootstepAt(this.localPos.x, this.localPos.z);
  }

  private bindInput() {
    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("mousemove", this.onMouseMove);
  }

  private disposeMesh(mesh: THREE.Mesh) {
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) {
      for (const material of mesh.material) material.dispose();
    } else {
      mesh.material.dispose();
    }
  }

  private playFootstepAt(x: number, z: number) {
    if (!this.audioCtx) return;
    const now = performance.now();
    if (this.footstepCooldownMs !== 0 && now < this.footstepCooldownMs) return;
    this.footstepCooldownMs = now + 95;

    const dist = Math.hypot(this.localPos.x - x, this.localPos.z - z);
    if (this.controls.walk && dist > 10) return;

    const s = this.classifySurfaceAt(x, z);
    const f = s === "metal" ? 520 : s === "concrete" ? 400 : s === "sand" ? 240 : s === "wood" ? 300 : 340;

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.value = f;
    const g = FOOTSTEP_BASE_GAIN / (1 + dist * 0.18);
    gain.gain.value = g;
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    const t = this.audioCtx.currentTime;
    gain.gain.setValueAtTime(g, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    osc.start(t);
    osc.stop(t + 0.081);
  }

  private playGunAt(x: number, z: number) {
    if (!this.audioCtx) return;

    const now = performance.now();
    if (this.shotCooldownMs !== 0 && now < this.shotCooldownMs) return;
    this.shotCooldownMs = now + 40;

    this.world?.onLocalShot();

    const dist = Math.hypot(this.localPos.x - x, this.localPos.z - z);
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(180, this.audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, this.audioCtx.currentTime + 0.06);
    const g = GUN_BASE_GAIN / (1 + dist * 0.06);
    gain.gain.value = g;
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    const t = this.audioCtx.currentTime;
    gain.gain.setValueAtTime(g, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.start(t);
    osc.stop(t + 0.121);
  }

  private classifySurfaceAt(x: number, z: number): SurfaceTag {
    for (let i = this.map.colliders.length - 1; i >= 0; i--) {
      const c = this.map.colliders[i]!;
      if (c.max.y !== 0) continue;
      if (x > c.min.x && x < c.max.x && z > c.min.z && z < c.max.z) return c.surface;
    }
    return "stone";
  }

  private pushFeed(text: string) {
    this.feedRows.unshift({ text, expiresAtMs: performance.now() + FEED_TTL_MS });
    if (this.feedRows.length > MAX_FEED) this.feedRows.length = MAX_FEED;
    this.renderFeed();
  }

  private trimFeed(nowMs: number) {
    let changed = false;
    while (this.feedRows.length > 0 && this.feedRows[this.feedRows.length - 1]!.expiresAtMs < nowMs) {
      this.feedRows.pop();
      changed = true;
    }
    if (changed) this.renderFeed();
  }

  private renderFeed() {
    this.feedEl.innerHTML = "";
    for (const row of this.feedRows) {
      const el = document.createElement("div");
      el.className = "feed-row";
      el.textContent = row.text;
      this.feedEl.appendChild(el);
    }
  }

  private updateHud() {
    const fps = 1 / Math.max(1e-6, this.clock.getDelta());
    const d = this.world?.diagnostics() ?? { drawCalls: 0, triangles: 0, materials: 0 };
    this.statusEl.textContent =
      `HP ${this.localHp.toString().padStart(3, " ")} | ` +
      `Ammo ${this.localAmmo.toString().padStart(2, "0")} | ` +
      `T ${this.scoreT} (${this.aliveT}) : CT ${this.scoreCT} (${this.aliveCT}) | ` +
      `${fps.toFixed(0)} FPS | DC ${d.drawCalls}`;
  }

  private renderFallback2d() {
    const ctx = this.fallback2d;
    if (!ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#d9c28f");
    g.addColorStop(1, "#b08a57");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "#2f2418";
    ctx.fillRect(0, h * 0.62, w, h * 0.38);

    const scale = Math.min(w, h) * 0.0065;
    const cx = w * 0.5;
    const cz = h * 0.55;
    const to2d = (x: number, z: number) => ({ x: cx + x * scale, y: cz + z * scale });

    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "#4a3a29";
    ctx.lineWidth = 1;
    for (const c of this.map.colliders) {
      if (c.max.y <= 0.01) continue;
      const p0 = to2d(c.min.x, c.min.z);
      const p1 = to2d(c.max.x, c.max.z);
      ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
    }
    ctx.globalAlpha = 1;

    for (const [id, e] of this.entities) {
      if (!e.alive) continue;
      const p = to2d(e.tx, e.tz);
      const r = id === this.localEntityId ? 5 : 4;
      ctx.fillStyle = id === this.localEntityId ? "#ffffff" : e.team === "T" ? "#be8342" : "#4f9ec7";
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const lp = to2d(this.localPos.x, this.localPos.z);
    ctx.strokeStyle = "#111";
    ctx.beginPath();
    ctx.moveTo(lp.x, lp.y);
    ctx.lineTo(lp.x + Math.sin(this.localYaw) * 14, lp.y + Math.cos(this.localYaw) * 14);
    ctx.stroke();

    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(12, 10, 360, 54);
    ctx.fillStyle = "#f5e8d2";
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("Fallback 2D mode (WebGL unavailable)", 22, 30);
    ctx.fillText(`pos (${this.localPos.x.toFixed(1)}, ${this.localPos.z.toFixed(1)})`, 22, 48);
  }
}
