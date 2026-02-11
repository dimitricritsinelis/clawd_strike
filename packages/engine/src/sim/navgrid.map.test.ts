import { describe, expect, it } from "vitest";

import { dust2Slice } from "@clawd-strike/shared";
import { NavGrid } from "./navgrid";

describe("dust2_slice nav connectivity", () => {
  it("does not fully block the nav grid", () => {
    const nav = new NavGrid(dust2Slice);
    const blocked = nav.blocked.reduce((acc, v) => acc + (v !== 0 ? 1 : 0), 0);
    const ratio = blocked / nav.blocked.length;
    expect(ratio).toBeLessThan(0.55);
  });

  it("has paths from each spawn side to mid and both bombsites", () => {
    const nav = new NavGrid(dust2Slice);
    const byId = new Map(dust2Slice.points.map((p) => [p.id, p] as const));

    const tSpawn = byId.get("t_spawn");
    const ctSpawn = byId.get("ct_spawn");
    const mid = byId.get("mid");
    const aSite = byId.get("a_site");
    const bSite = byId.get("b_site");
    const bazaar = byId.get("bazaar_mid");
    const west = byId.get("west_alley_bend");
    const east = byId.get("east_street_mid");

    expect(tSpawn).toBeDefined();
    expect(ctSpawn).toBeDefined();
    expect(mid).toBeDefined();
    expect(aSite).toBeDefined();
    expect(bSite).toBeDefined();
    expect(bazaar).toBeDefined();
    expect(west).toBeDefined();
    expect(east).toBeDefined();

    const checks: Array<[string, { x: number; y: number; z: number }, { x: number; y: number; z: number }]> = [
      ["T -> mid", tSpawn!.pos, mid!.pos],
      ["T -> A", tSpawn!.pos, aSite!.pos],
      ["T -> B", tSpawn!.pos, bSite!.pos],
      ["CT -> mid", ctSpawn!.pos, mid!.pos],
      ["CT -> A", ctSpawn!.pos, aSite!.pos],
      ["CT -> B", ctSpawn!.pos, bSite!.pos],
      ["mid -> bazaar", mid!.pos, bazaar!.pos],
      ["T -> west bend", tSpawn!.pos, west!.pos],
      ["CT -> east street", ctSpawn!.pos, east!.pos]
    ];

    for (const [label, from, to] of checks) {
      const path = nav.findPath(from, to);
      expect(path.length, label).toBeGreaterThan(3);
    }
  });
});
