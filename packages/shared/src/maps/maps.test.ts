import { describe, expect, it } from "vitest";

import { dust2Slice } from "./maps";

function intersectsAabb2(
  a: { minX: number; minZ: number; maxX: number; maxZ: number },
  b: { minX: number; minZ: number; maxX: number; maxZ: number }
): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

describe("dust2Slice map invariants", () => {
  it("has floor collider top at y=0", () => {
    const floor = dust2Slice.colliders.find((c) => c.id === "floor");
    expect(floor).toBeDefined();
    expect(floor?.max.y).toBe(0);
  });

  it("has expected expanded bounds", () => {
    expect(dust2Slice.bounds).toEqual({ minX: -72, minZ: -68, maxX: 72, maxZ: 68 });
  });

  it("has 10 spawn points and split teams 5v5", () => {
    expect(dust2Slice.spawns.length).toBe(10);
    const t = dust2Slice.spawns.filter((s) => s.team === "T");
    const ct = dust2Slice.spawns.filter((s) => s.team === "CT");
    expect(t.length).toBe(5);
    expect(ct.length).toBe(5);
  });

  it("defines both bombsites", () => {
    const ids = new Set(dust2Slice.bombsites.map((b) => b.id));
    expect(ids.has("A")).toBe(true);
    expect(ids.has("B")).toBe(true);
  });

  it("has interest points for key routes", () => {
    const ids = new Set(dust2Slice.points.map((p) => p.id));
    expect(ids.has("mid")).toBe(true);
    expect(ids.has("a_site")).toBe(true);
    expect(ids.has("b_site")).toBe(true);
    expect(ids.has("bazaar_mid")).toBe(true);
    expect(ids.has("west_alley_bend")).toBe(true);
    expect(ids.has("east_street_mid")).toBe(true);
  });

  it("has bombsites that do not intersect solid colliders in XZ", () => {
    for (const site of dust2Slice.bombsites) {
      const collisions = dust2Slice.colliders.filter((c) =>
        intersectsAabb2(site.aabb, { minX: c.min.x, minZ: c.min.z, maxX: c.max.x, maxZ: c.max.z }) && c.max.y > 0.1
      );
      expect(collisions, `${site.id} should not intersect solids`).toEqual([]);
    }
  });

  it("ensures all spawns are outside solid colliders", () => {
    for (const spawn of dust2Slice.spawns) {
      const inSolid = dust2Slice.colliders.some(
        (c) =>
          c.max.y > 0.1 &&
          spawn.pos.x > c.min.x &&
          spawn.pos.x < c.max.x &&
          spawn.pos.z > c.min.z &&
          spawn.pos.z < c.max.z
      );
      expect(inSolid, `spawn ${spawn.team} at ${spawn.pos.x},${spawn.pos.z} is inside solid`).toBe(false);
    }
  });
});
