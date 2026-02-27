<!-- Save as: /Users/dimitri/Desktop/ClawdStrike_v2/artifacts/prompt-pack/P04_build_blockout_geometry_and_colliders.md -->

**Title:** Blockout geometry + wall colliders from blockout_spec.json

**Read first:**
- `/Users/dimitri/Desktop/ClawdStrike_v2/AGENTS.md`
- `/Users/dimitri/Desktop/ClawdStrike_v2/progress.md`
- Source-of-truth (for visual confirmation only; geometry must come from JSON):
  - `/Users/dimitri/Desktop/ClawdStrike_v2/docs/map-design/specs/map_spec.json`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/docs/map-design/refs/bazaar_slice_v2_2_detailed_birdseye.png`
- Runtime loader + types:
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/map/loadMap.ts`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/map/types.ts`

**Goal (1 sentence):** Generate a bright, readable full-map blockout (floors + walls) and a set of AABB colliders derived strictly from zone rectangles.

**Non-goals:**
- Do NOT implement player movement yet (next prompt).
- Do NOT add detailed props/dressing yet.
- Do NOT invent layout beyond what is defined by zone rects.

**Implementation plan (file-specific, numbered):**
1) Dependencies: requires P03 loader to provide `blockout_spec`.
2) Add blockout builder:
   - Add: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/map/buildBlockout.ts`

   Output:
   - Three.js objects (floors, walls)
   - World collider AABBs (walls + floor slab)
3) Floors (readability-first, no z-fighting):
   - Base floor: build from walkable zones:
     - `spawn_plaza`, `main_lane_segment`, `side_hall`, `cut`, `connector`
   - Overlay floors:
     - `stall_strip` as thin overlay at +0.02m (distinct bright accent)
     - `clear_travel_zone` as thin overlay at +0.03m (distinct bright accent; “no blocking props” reminder)

   Constraints:
   - Use `InstancedMesh` per material/category where reasonable
   - Units: 1 unit = 1 meter
4) Walls (AABB-only collision, thickness ≥ 0.3m):
   - Build walls along the boundary of the union of walkable zones (do not treat clear zones as walkable boundaries).
   - Robust method (no invented art):
     - Collect all unique x and y coordinates from zone rect boundaries
     - Build a cell grid from these coordinates
     - Mark cells “inside walkable union”
     - For each boundary edge between inside/outside cells, emit a wall segment with known outward normal
     - Merge adjacent wall segments to reduce instance count

   Placement rule:
   - Place wall thickness **outside** the walkable area (inner face flush with walkable boundary) to preserve lane widths.

   Wall height:
   - Use default from spec (expected 6.0m).
5) Colliders:
   - Emit AABB colliders for walls (aligned to wall meshes)
   - Emit one large floor slab AABB under y=0 for the playable boundary (so gravity works later):
     - inside boundary x/z extents, minY=-1, maxY=0
6) Wire blockout into runtime:
   - Modify: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/game/Game.ts`
   - After map load, call `buildBlockout(...)` and add results to scene
7) Bright placeholder materials (strictly high-vis):
   - Ensure floors/walls are high-albedo neutral/sand/light-gray with clear contrast.
   - Avoid dark/red-heavy blockout.

**Acceptance checks (observable):**
- ✅ map loads via canonical URL (runtime fetches JSONs and builds blockout)
- ✅ movement + collision still works (or is newly added) (not implemented yet; do not regress runtime)
- ✅ entire map remains traversable (visual-only now; geometry must match spec)
- ✅ blockout colors/readability improved (lanes/overlays clearly readable)
- ✅ determinism preserved (same JSON produces same geometry)
- ✅ Layout matches birdseye at a glance (3-lane + mid/north cuts + spawn connectors)
- ✅ No z-fighting on overlays (stall strips / clear zones)

**Validation (commands that exist):**
```bash
pnpm typecheck
pnpm build
```

Screenshots (exactly 2):
- `artifacts/screenshots/P04/before.png`
- `artifacts/screenshots/P04/after.png`

Reset & Open:
```bash
pnpm dev
```
Open:
- `http://127.0.0.1:5174/?map=bazaar-map&shot=compare`

Progress update (required):
- Update `progress.md`:
  - What geometry now renders
  - Confirm units + coordinate mapping
  - Known issues (e.g., any wall seams) as short bullets
