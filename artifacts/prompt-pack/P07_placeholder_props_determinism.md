<!-- Save as: /Users/dimitri/Desktop/ClawdStrike_v2/artifacts/prompt-pack/P07_placeholder_props_determinism.md -->

**Title:** Deterministic placeholder props (instanced) from anchors + stall-strip rhythm

**Read first:**
- `/Users/dimitri/Desktop/ClawdStrike_v2/AGENTS.md`
- `/Users/dimitri/Desktop/ClawdStrike_v2/progress.md`
- Source of truth:
  - `/Users/dimitri/Desktop/ClawdStrike_v2/docs/map-design/specs/map_spec.json`
- Runtime assets:
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/public/maps/bazaar-map/anchors.json`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/public/maps/bazaar-map/blockout_spec.json`

**Goal (1 sentence):** Add bright, deterministic placeholder props driven by anchors (and light stall-strip filler) using InstancedMesh, without blocking clear travel zones or breaking traversal.

**Non-goals:**
- Do NOT add textures/material pipelines or final art assets.
- Do NOT add complex destructibles/physics.
- Do NOT block any `clear_travel_zone` with blocking colliders.

**Implementation plan (file-specific, numbered):**
1) Dependencies: requires P04 blockout (zones) + P05 collision (to feel cover) + P03 anchors loaded.
2) Add deterministic RNG:
   - Add: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/utils/Rng.ts`

   Seed behavior:
   - default: derived from `mapId` (stable)
   - override via `?seed=<int>`
3) Implement prop builder:
   - Add: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/map/buildProps.ts`

   Requirements:
   - Use `InstancedMesh` for repeated primitives
   - Keep materials ≤ ~10 (high-vis palette; no textures)

   Anchor mapping (placeholders):
   - `shopfront_anchor` → shutter/door box module (colliding, sized to fit stall strip width)
   - `signage_anchor` → hanging sign/awning (non-colliding)
   - `cover_cluster` → low cover cluster (colliding, CS/VAL-like chest-high ~1.1–1.3m)
   - `spawn_cover` → low cover in spawns (colliding; do not block exits)
   - `service_door_anchor` → small wall detail (non-colliding)
   - `cloth_canopy_span` → overhead cloth strip between start/end (non-colliding)
   - `hero_landmark` (arch) → two pillars + top lintel; keep the clear center open (colliding pillars only)
   - `landmark` (mid well) → **visual marker only if it lies inside a clear zone** (no collider), and log a warning counter
4) Enforce clear-travel-zone rule for blocking props/colliders:
   - For any colliding prop AABB, reject placement if it intersects any `clear_travel_zone` rect (using zone data from blockout_spec).
   - Log counts to debug HUD (only when debug/perf enabled; avoid spam).
5) Add stall-strip rhythm filler (deterministic, non-blocking or small):
   - Place a small number of decorative primitives inside `stall_strip` rects:
     - derived from rect boundaries (no invented layout)
     - keep them near the **outer** edge of stall strips so the main corridor stays clean
6) Wire into runtime:
   - Modify: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/game/Game.ts`

   Integration:
   - After blockout build, build props and add to scene
   - Add prop colliders into the world collider set (only for colliding prop categories)

**Acceptance checks (observable):**
- ✅ map loads via canonical URL
- ✅ movement + collision still works (or is newly added) (no regress; cover feels solid)
- ✅ entire map remains traversable (no prop blocks corridors/cuts)
- ✅ blockout colors/readability improved (shops/signage rhythm + cover pockets visible)
- ✅ determinism preserved (same seed → same prop placement)
- ✅ No blocking colliders intrude into CLEAR_M1/2/3
- ✅ Hero arch reads as landmark and does not hard-block the 6m clear path

**Validation (commands that exist):**
```bash
pnpm typecheck
pnpm build
```

Screenshots (exactly 2):
- `artifacts/screenshots/P07/before.png`
- `artifacts/screenshots/P07/after.png`

Reset & Open:
```bash
pnpm dev
```
Open:
- `http://127.0.0.1:5174/?map=bazaar-map&shot=compare&seed=1`

Progress update (required):
- Update `progress.md` with:
  - Seed behavior + what’s deterministic
  - Clear-zone enforcement behavior (reject vs warn)
  - Known issues (e.g., mid well anchor inside clear zone) as short bullets
