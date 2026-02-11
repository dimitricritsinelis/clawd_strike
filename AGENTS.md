# AGENTS.md — Codex Operating Manual (Web FPS)

## Mission
- Build a **web-based FPS** with **three.js** (client) and a small **authoritative server** with **9 bots** (5v5 total). 
- Target: **60 FPS client**, **60Hz server sim**, playable locally on localhost. Single map: a Dust2-inspired Middle Eastern urban slice.

## Non-negotiables
- **Server-authoritative** simulation (movement, damage, scoring). Clients are predictive only.
- Determinism-first: fixed timestep, stable IDs, reproducible seeds.
- **AABB-only collision.** No diagonal or curved colliders. Express visual diagonals with props/trim.
- Floor collider top surface at **y = 0**. Must not block nav sampling (server nav samples at a small positive Y).
- "Pretty enough" comes from procedural textures + lighting + post-processing, not imported assets.

---

## Repo
Primary repo:
- `git@github.com:dimitricritsinelis/clawd_strike.git`

## Tech Stack
| Layer | Choice |
|-------|--------|
| Monorepo | `apps/` + `packages/` |
| Language | **TypeScript** (strict, no `any`) |
| Client bundler | **Vite** |
| Rendering | **three.js** |
| Physics | **Rapier** (WASM) |
| Netcode | **Colyseus** (WebSocket) |
| AI | behavior-tree + utility scoring; navmesh pathing |
| Testing | **Vitest** (unit) + optional **Playwright** smoke |
| Package manager | **pnpm** |

---

## Repo Layout
```
/
  apps/
    client/              # three.js FPS (renderer, input, prediction, world-build)
    server/              # authoritative sim, bots, matchmaking (room)
  packages/
    shared/              # MapDef, schemas, constants, math, IDs, net messages
      src/maps/maps.ts   # ← source of truth for collision, spawns, bombsites, nav
    engine/              # simulation primitives (ticks, components)
  docs/
    decisions.md         # record important decisions & tradeoffs
  ref-images/            # art-direction reference screenshots (read-only)
  AGENTS.md
  TASK.md
```

---

## Coordinate System & Units
- **X/Z** = ground plane. **Y** = up.
- **1 unit ≈ 1 meter.** Player height, door sizing, step-up arcs, and UV repeats all assume this.
- World collision = axis-aligned AABBs defined in `MapDef.colliders`.
- Player collision = AABB from radius + height. Movement solver slides against world AABBs with step-up/step-down.

---

## Art Direction (from reference images)

Target vibe: **sun-baked Middle Eastern / North African urban district** — think narrow market streets, weathered sandstone, Arabic signage, warm dusty atmosphere.

### Palette
- **Walls:** warm sand/ochre stucco (hue 30-45, sat 20-40%, value 65-80%). Vary via roughness and grime, not hue shifts.
- **Accents:** teal-green window shutters, faded turquoise/rust shop signs, dark metal awning frames.
- **Floor:** dusty tan tile or packed earth; higher-frequency pattern than walls so it reads at grazing angles.
- **Trim:** glazed mosaic strips (blues, greens, terracotta) on doorframes and wall bands for structural rhythm.
- **Lighting:** warm directional sun (color temp ~4500K), strong ambient occlusion in alleys, warm fill lights near sites/connectors.

### Geometry Language
- **Chunky proportions.** Thick walls (≥0.4m), heavy cornices, rounded-box bevels on edges.
- **Readable silhouettes.** Cover pieces, pillars, archways should read instantly at FPS speed.
- **Layered facades:** base wall → window/door cutouts → awnings/signs → small props (AC units, cables, crates).
- **Overhead dressing:** draped fabric/tarps between buildings (orange, tan), power lines, hanging lanterns.
- **Ground clutter:** crates, barrels, sandbags, scattered wood planks (non-colliding visual props).

### What to Avoid
- Pristine/clean surfaces. Everything should have wear, stains, bullet pocks.
- Uniform wall treatment. Vary stucco patches, exposed brick sections, paint peeling.
- Visual cover that lacks collision. If it looks solid at waist height, it must have a collider.
- Boxy/simple geometry - we want realism.

---

## Map Specification

### Lane Topology (6 regions, all required)
1. **T Spawn** (southwest) — multiple spawn points, no direct LOS to CT spawn.
2. **CT Spawn** (northeast) — same constraints as T spawn.
3. **A Site** (northwest) — interior-ish building. ≥2 entrances. Bombsite AABB inside.
4. **B Site** (southeast) — open courtyard. ≥2 entrances. Bombsite AABB inside.
5. **Mid Courtyard** (center) — open, with ≥1 cover element breaking cross-map sightlines. One recognizable landmark (fountain/statue/truck) with waist-high collision footprint.
6. **Bazaar Corridor** (north of mid) — narrow, covered feel. Columns/stalls/cloth dressing.

Plus two connecting lanes:
- **West Alley** — tight, must include an S-turn/chicane. No straight sightline end-to-end.
- **East Street** — wider, longer sightlines, partial cover for peek games.

**Connectivity rule:** ≥2 meaningful routes between spawns and each site. No single-chokepoint bottlenecks.

**Sightline rhythm:** alternate tight/covered beats with open/bright beats as players move between zones.

### Collision Rules
- All world collision = axis-aligned AABBs in `MapDef.colliders`.
- Door gaps and passages = literal voids between wall AABBs.
- Low cover ≈ waist height so peeks and counter-strafe fights read correctly.
- Wall thickness ≥ 0.3m. Avoid knife-edge corners (causes sticky sliding).
- Minimum corridor width > agent radius expansion (for bot nav).

### Spawns
- Multiple per side, within spawn zones.
- Not inside any collider. Immediate walkable clearance around each.
- No direct LOS to enemy spawn from any spawn point.

### Bombsites
- AABBs in open playable areas. Must not intersect solid colliders.
- Each site: ≥2 entrances, ≥1 plantable sub-area with nearby cover, reasonable retake path.

### Nav & Bots
- Server nav grid samples collisions at a small positive Y. **Floor AABB must not extend above sample height** or all cells register blocked.
- `MapDef.points`: place interest points at mid, each site, each lane midpoint, and major bends. Bots use these; some dressing systems anchor to them.

### Surface Tags (impact/footstep contract)
- Collision-derived meshes: set `object.userData.surface` (e.g., `"stone"`, `"concrete"`, `"sand"`, `"metal"`).
- Decorative meshes: set `object.userData.ignoreImpactRay = true` so they don't steal impact raycasts.
- New surface categories require updating the classifier in the client game module.

### Gunplay 

- Only 1 gun in the game - AK47 (Realistic looking)
- Recoil patterns wapon, not random spread. Spray should be learnable and controllable.
- First-shot accuracy must be near-perfect when standing still and unscoped. Reward crosshair placement.
- Headshot multiplier matters. Head hitbox must be distinct from body. One-tap kills with rifles on head, rewarding aim precision.
- Weapon switching and equip times are non-trivial. No instant swap — there must be a draw delay that punishes careless weapon management.

### Movement & Feel

- Acceleration-based movement model with distinct accel/decel curves. No instant velocity changes. Movement inaccuracy penalty on weapons (moving = less accurate).
- Counter-strafing rewards. Velocity must drop through zero cleanly so players can stop-shoot-move precisely.
- Consistent tick-aligned hit registration. Shots resolve against the server's rewound player positions at the shooter's ping (lag compensation).

### Audio as Gameplay

- Footstep audio is spatially accurate and mandatory information. Players must hear enemies through walls/floors with correct 3D positioning. Walking (shift) must be silent beyond a defined radius.
- Distinct audio signatures per surface type. Metal, sand, concrete, wood must sound different and convey position info.
- Gunfire audio carries map-wide with distance attenuation. Players should be able to identify fight locations by ear.


---

## Procedural Materials Pipeline

### Texture Categories
| Category | Use | Seed Key Pattern |
|----------|-----|-----------------|
| Exterior walls | Sand stucco | `"wall"` |
| Interior walls | Plaster | `"plaster"` |
| Cover | Concrete | `"concrete"` |
| Architectural accents | Stone brick | `"brick"` |
| Floor | Tile + grout | `"floor"` |
| Decorative trim | Glazed mosaic | `"trim"` |

### Seeding Policy
- Same `seedKey` → same look (debugging, identity). Different key → different coherent variant.
- Pick a small fixed set of identity keys and stick to them.

### UV Strategy
- **Walls:** scale UV repeat from physical dimensions. No visible stretch or seams.
- **Floor:** higher repeat density so tile pattern reads at FPS camera height and grazing angles.
- **Trim:** smaller, higher-contrast motifs than wall stucco.

### Palette Anchoring
- Keep wall + floor hues in the same warm-sand family.
- Introduce variation via roughness, grime intensity, and accent trim colors — not by swapping base hues.

---

## Determinism Contract

| Category | Requirement | Examples |
|----------|-------------|---------|
| **MUST be deterministic** | Gameplay correctness | `colliders`, `spawns`, `bombsites`, `nav.cellSize` |
| **SHOULD be deterministic** | Debuggability & identity | Texture seed keys, major prop placements |
| **CAN be non-deterministic** | Pure cosmetics | Minor decal jitter, cloud noise, subtle wear masks |

Use `packages/shared/src/sim/rng.ts` helpers (`hashSeed`, `lcg`, `rand01`) for per-match cosmetic variation seeded from `matchSeed`.

---

## Map Build Order (suggested)
1. Set `MapDef.bounds` — square-ish, room for playable area + outskirts buffer.
2. Author floor collider — shallow AABB, top at y=0, covering full bounds.
3. Author perimeter walls — tall, thick AABBs framing the play space. Continuous or clipped.
4. Block out the 6 regions as collision AABBs first, visuals second.
5. Add cover (waist-high) and micro-vertical (steps/platforms, sparingly).
6. Place spawn points per side.
7. Define bombsite AABBs (not intersecting walls).
8. Add `MapDef.points` for bot interest + dressing anchors.
9. Client visuals pass — materials, surface tags, mid landmark rendering.
10. Dressing — wall decals, overhead cables, ground litter, accent lights. All non-colliding.

---

## Standards

### Coding
- TypeScript strict. No `any`. No hidden globals. No magic numbers without named constants.
- Prefer pure functions in `packages/shared` and `packages/engine`.

### Simulation & Networking
- **Fixed timestep** on server (60Hz). Client renders variable FPS.
- Client: local prediction. Server: authoritative snapshots.
- **Input commands** from client (move, look, shoot) with timestamps/sequence IDs.
- Snapshot interpolation on client; smooth reconciliation (no harsh rubber-banding).

### Graphics Baseline (three.js)
- Correct color management (linear workflow + sRGB output).
- Shadow discipline: few casters, stable shadow map sizes.
- glTF (.glb) for any imported assets; compress textures (KTX2/BasisU) only when stable.
- Keep draw calls low. Instance dressing (cables, litter, repeated props).
- Reuse a small set of world materials. Don't explode shader/material variants.
- High resolution.
- High quality.
- Modern design.

### Performance Budgets
- **60 FPS** on a mid-range laptop.
- **≤ 200 draw calls** (initial target).
- No per-frame allocations. Reuse vectors. Object pools for bullets/FX.

---

## Commands
Root `package.json` must provide:
```
pnpm i              # install
pnpm dev            # client + server
pnpm dev:client
pnpm dev:server
pnpm test           # Vitest
pnpm lint
pnpm typecheck
```

---

## Definition of Done (per task)
- Feature works locally (`pnpm dev`).
- Unit tests updated/added where meaningful.
- No new TypeScript errors; lint clean.
- Manual test steps documented in PR description.
- Minimal scope: only files needed for the task.

---

## Workflow
1. Read `TASK.md` before doing work.
2. Propose a brief plan and file-touch list.
3. Implement in small commits.
4. Run: `pnpm test`, `pnpm lint`, `pnpm typecheck`.
5. Summarize what changed + how to test manually.

---

## Verification Checklist (map rebuild acceptance)

**Collision:** Spawns not inside solids. No snagging on thin walls or knife-edge corners. Door gaps wide/tall enough for smooth movement and bot nav.

**Nav:** Grid not fully blocked. Paths exist between spawns, mid, and both sites.

**Gameplay:** ≥2 routes to each site. Mid has cover breaking cross-map sightlines. West lane is tight/broken. East lane is longer/more open.

**Visual:** Textures not stretched. Floor tiles read at grazing angles. Decals don't z-fight. No "visual cover" without matching collision.

**Audio/FX:** Footsteps and impacts read correctly per surface. Decorative meshes don't override surface classification.

**Performance:** Dressing stays instanced. Material count stays small. Draw calls within budget.

---

## Current Priorities (build order)
1. **Core loop**: spawn → move → shoot → hit → respawn (single map).
2. **Authoritative server** with snapshot replication.
3. **Client FPS controller**: pointer lock, input, camera, prediction.
4. **Map**: Dust2 slice topology with collision, spawns, bombsites, nav, and visuals.
5. **Bots**: navmesh pathing + basic tactics (seek/peek/shoot/retreat).
6. **Polish**: lighting/post, audio, HUD, perf passes.
