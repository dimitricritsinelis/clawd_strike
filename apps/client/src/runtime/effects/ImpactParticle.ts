import {
  AdditiveBlending,
  CanvasTexture,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Scene,
} from "three";

const POOL_SIZE = 12;
const PARTICLE_LIFETIME_S = 0.45;
const DRIFT_SPEED_MPS = 1.2;
const START_SCALE = 0.08;
const END_SCALE = 0.35;
const START_OPACITY = 0.7;

const _driftDir = new Vector3();

type ParticleState = {
  active: boolean;
  age: number;
  driftX: number;
  driftY: number;
  driftZ: number;
};

function createDustTexture(size = 64): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const cx = size / 2;
  const cy = size / 2;

  ctx.clearRect(0, 0, size, size);

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
  grad.addColorStop(0, "rgba(210, 195, 168, 0.8)");
  grad.addColorStop(0.4, "rgba(200, 185, 155, 0.4)");
  grad.addColorStop(1, "rgba(190, 175, 145, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export class ImpactParticle {
  private readonly sprites: Sprite[];
  private readonly states: ParticleState[];
  private readonly material: SpriteMaterial;

  constructor(scene: Scene) {
    const texture = createDustTexture();
    this.material = new SpriteMaterial({
      map: texture,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      opacity: 0,
    });

    this.sprites = [];
    this.states = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const sprite = new Sprite(this.material.clone());
      sprite.visible = false;
      sprite.scale.setScalar(START_SCALE);
      scene.add(sprite);
      this.sprites.push(sprite);
      this.states.push({ active: false, age: 0, driftX: 0, driftY: 0, driftZ: 0 });
    }
  }

  emit(
    position: { x: number; y: number; z: number },
    normal: { x: number; y: number; z: number },
  ): void {
    _driftDir.set(normal.x, normal.y, normal.z);

    // Activate 3 particles per impact
    let spawned = 0;
    for (let i = 0; i < POOL_SIZE && spawned < 3; i++) {
      const state = this.states[i]!;
      if (!state.active) {
        const sprite = this.sprites[i]!;
        sprite.position.set(position.x, position.y, position.z);
        sprite.visible = true;
        (sprite.material as SpriteMaterial).opacity = START_OPACITY;
        sprite.scale.setScalar(START_SCALE);

        // Slight random offset to drift direction
        const jx = (Math.random() - 0.5) * 0.4;
        const jy = Math.random() * 0.3;
        const jz = (Math.random() - 0.5) * 0.4;
        state.driftX = (_driftDir.x + jx) * DRIFT_SPEED_MPS;
        state.driftY = (_driftDir.y + jy) * DRIFT_SPEED_MPS;
        state.driftZ = (_driftDir.z + jz) * DRIFT_SPEED_MPS;
        state.age = 0;
        state.active = true;
        spawned++;
      }
    }
  }

  update(dt: number): void {
    for (let i = 0; i < POOL_SIZE; i++) {
      const state = this.states[i]!;
      if (!state.active) continue;

      state.age += dt;
      if (state.age >= PARTICLE_LIFETIME_S) {
        state.active = false;
        this.sprites[i]!.visible = false;
        continue;
      }

      const t = state.age / PARTICLE_LIFETIME_S;
      const sprite = this.sprites[i]!;
      sprite.position.x += state.driftX * dt;
      sprite.position.y += state.driftY * dt;
      sprite.position.z += state.driftZ * dt;

      const scale = START_SCALE + (END_SCALE - START_SCALE) * t;
      sprite.scale.setScalar(scale);

      (sprite.material as SpriteMaterial).opacity = START_OPACITY * (1 - t);
    }
  }

  clear(): void {
    for (let i = 0; i < POOL_SIZE; i++) {
      this.states[i]!.active = false;
      this.sprites[i]!.visible = false;
    }
  }

  dispose(scene: Scene): void {
    for (const sprite of this.sprites) {
      scene.remove(sprite);
      (sprite.material as SpriteMaterial).map?.dispose();
      (sprite.material as SpriteMaterial).dispose();
    }
    this.material.map?.dispose();
    this.material.dispose();
  }
}
