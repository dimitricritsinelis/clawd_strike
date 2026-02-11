import type { AABB2, MapDef } from "@clawd-strike/shared";
import type { Vec3 } from "@clawd-strike/shared";

export type NavCell = Readonly<{ x: number; z: number }>;

export class NavGrid {
  readonly bounds: AABB2;
  readonly cellSize: number;
  readonly sampleY: number;
  readonly width: number;
  readonly height: number;
  readonly blocked: Uint8Array;

  constructor(map: MapDef) {
    this.bounds = map.bounds;
    this.cellSize = map.nav.cellSize;
    this.sampleY = map.nav.sampleY;

    this.width = Math.max(1, Math.floor((this.bounds.maxX - this.bounds.minX) / this.cellSize));
    this.height = Math.max(1, Math.floor((this.bounds.maxZ - this.bounds.minZ) / this.cellSize));
    this.blocked = new Uint8Array(this.width * this.height);

    const sampleP = { x: 0, y: this.sampleY, z: 0 };
    for (let z = 0; z < this.height; z++) {
      for (let x = 0; x < this.width; x++) {
        const p = this.cellCenterWorld(x, z);
        sampleP.x = p.x;
        sampleP.z = p.z;

        let isBlocked = false;
        for (const c of map.colliders) {
          // Floor collider has maxY=0; since sampleY>0, it won't block.
          if (
            sampleP.x > c.min.x &&
            sampleP.x < c.max.x &&
            sampleP.y > c.min.y &&
            sampleP.y < c.max.y &&
            sampleP.z > c.min.z &&
            sampleP.z < c.max.z
          ) {
            isBlocked = true;
            break;
          }
        }
        this.blocked[z * this.width + x] = isBlocked ? 1 : 0;
      }
    }
  }

  inBoundsCell(x: number, z: number): boolean {
    return x >= 0 && x < this.width && z >= 0 && z < this.height;
  }

  isBlockedCell(x: number, z: number): boolean {
    return !this.inBoundsCell(x, z) || this.blocked[z * this.width + x] !== 0;
  }

  worldToCell(p: Vec3): NavCell {
    const x = Math.floor((p.x - this.bounds.minX) / this.cellSize);
    const z = Math.floor((p.z - this.bounds.minZ) / this.cellSize);
    return { x, z };
  }

  cellCenterWorld(x: number, z: number): Vec3 {
    return {
      x: this.bounds.minX + (x + 0.5) * this.cellSize,
      y: 0,
      z: this.bounds.minZ + (z + 0.5) * this.cellSize
    };
  }

  findPath(startWorld: Vec3, goalWorld: Vec3): Vec3[] {
    const start = this.worldToCell(startWorld);
    const goal = this.worldToCell(goalWorld);
    if (!this.inBoundsCell(start.x, start.z) || !this.inBoundsCell(goal.x, goal.z)) return [];
    if (this.isBlockedCell(start.x, start.z) || this.isBlockedCell(goal.x, goal.z)) return [];

    const n = this.width * this.height;
    const cameFrom = new Int32Array(n);
    const gScore = new Float32Array(n);
    const fScore = new Float32Array(n);
    const open = new Int32Array(n);
    const openFlag = new Uint8Array(n);

    for (let i = 0; i < n; i++) {
      cameFrom[i] = -1;
      gScore[i] = Number.POSITIVE_INFINITY;
      fScore[i] = Number.POSITIVE_INFINITY;
    }

    const startIdx = start.z * this.width + start.x;
    const goalIdx = goal.z * this.width + goal.x;

    const width = this.width;
    const cellSize = this.cellSize;
    const h = (idx: number): number => {
      const x = idx % width;
      const z = Math.floor(idx / width);
      const dx = Math.abs(x - goal.x);
      const dz = Math.abs(z - goal.z);
      return (dx + dz) * cellSize;
    };

    let openCount = 0;
    open[openCount++] = startIdx;
    openFlag[startIdx] = 1;
    gScore[startIdx] = 0;
    fScore[startIdx] = h(startIdx);

    const dirs = [
      { dx: 1, dz: 0 },
      { dx: -1, dz: 0 },
      { dx: 0, dz: 1 },
      { dx: 0, dz: -1 }
    ] as const;

    while (openCount > 0) {
      // Pick lowest fScore (tie-break by lower idx for determinism).
      let bestI = 0;
      let bestIdx = open[0]!;
      let bestF = fScore[bestIdx]!;
      for (let i = 1; i < openCount; i++) {
        const idx = open[i]!;
        const f = fScore[idx]!;
        if (f < bestF || (f === bestF && idx < bestIdx)) {
          bestF = f;
          bestIdx = idx;
          bestI = i;
        }
      }

      // Pop best.
      openCount--;
      open[bestI] = open[openCount]!;
      openFlag[bestIdx] = 0;

      if (bestIdx === goalIdx) {
        // Reconstruct.
        const pathIdx: number[] = [];
        let cur = bestIdx;
        pathIdx.push(cur);
        while (cameFrom[cur] !== -1) {
          cur = cameFrom[cur]!;
          pathIdx.push(cur);
        }
        pathIdx.reverse();
        return pathIdx.map((idx) => {
          const x = idx % this.width;
          const z = Math.floor(idx / this.width);
          return this.cellCenterWorld(x, z);
        });
      }

      const cx = bestIdx % this.width;
      const cz = Math.floor(bestIdx / this.width);

      for (const d of dirs) {
        const nx = cx + d.dx;
        const nz = cz + d.dz;
        if (this.isBlockedCell(nx, nz)) continue;
        const nIdx = nz * this.width + nx;

        const tentativeG = gScore[bestIdx]! + this.cellSize;
        if (tentativeG >= gScore[nIdx]!) continue;

        cameFrom[nIdx] = bestIdx;
        gScore[nIdx] = tentativeG;
        fScore[nIdx] = tentativeG + h(nIdx);
        if (openFlag[nIdx] === 0) {
          open[openCount++] = nIdx;
          openFlag[nIdx] = 1;
        }
      }
    }

    return [];
  }
}
