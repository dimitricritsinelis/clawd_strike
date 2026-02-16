<!-- Save as: /Users/dimitri/Desktop/ClawdStrike_v2/artifacts/prompt-pack/P06_anchor_debug_markers_labels.md -->

**Title:** Anchor visualization (instanced markers + distance-gated labels + filters)

**Read first:**
- `/Users/dimitri/Desktop/ClawdStrike_v2/AGENTS.md`
- `/Users/dimitri/Desktop/ClawdStrike_v2/progress.md`
- Anchors loading:
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/map/loadMap.ts`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/map/types.ts`
- Anchors data:
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/public/maps/bazaar-map/anchors.json`

**Goal (1 sentence):** Add performant anchor debug rendering: instanced 3D markers by type, optional distance-gated labels, and category filtering, with clean default view.

**Non-goals:**
- Do NOT add heavy debug GUI frameworks.
- Do NOT render 3D text meshes per-anchor (too expensive); use a small DOM label pool.

**Implementation plan (file-specific, numbered):**
1) Dependencies: requires P03 (anchors fetched) and P05 (camera/player) for best usability.
2) Add anchor debug system:
   - Add: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/debug/AnchorsDebug.ts`

   Requirements:
   - Use `InstancedMesh` markers grouped by anchor type (distinct bright colors)
   - Marker size scales gently with distance (optional), but remains legible
3) Add label overlay:
   - DOM overlay attached to runtime container
   - Label pool capped (e.g., 32–48 labels)

   Each frame:
   - select nearest visible anchors within max distance
   - project to screen; place labels

   Constraints:
   - Avoid per-frame allocations; reuse arrays/DOM nodes
4) Filtering controls:
   - URL params:
     - `anchors=1` show markers
     - `labels=1` show labels
     - optional: `anchorTypes=shopfront_anchor,signage_anchor,...`
   - Key toggles (only if debug enabled): F2 anchors, F3 labels
5) Wire into game loop:
   - Modify: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/game/Game.ts`
   - Update debug system after camera update
6) Ensure default is clean:
   - No anchors/labels unless URL params or toggles enable them.

**Acceptance checks (observable):**
- ✅ map loads via canonical URL
- ✅ movement + collision still works (or is newly added) (no regress)
- ✅ entire map remains traversable (no regress)
- ✅ blockout colors/readability improved (anchors make validation easier)
- ✅ determinism preserved (anchor ordering stable)
- ✅ `&anchors=1` shows markers, `&labels=1` shows readable labels
- ✅ Filtering works; no heavy FPS drop with anchors enabled

**Validation (commands that exist):**
```bash
pnpm typecheck
pnpm build
```

Screenshots (exactly 2):
- `artifacts/screenshots/P06/before.png`
- `artifacts/screenshots/P06/after.png`

Reset & Open:
```bash
pnpm dev
```
Open:
- `http://127.0.0.1:5174/?map=bazaar-map&shot=compare&anchors=1&labels=1`

Progress update (required):
- Update `progress.md` with:
  - Anchor toggles and filters
  - Known overlap/label issues (short bullets)
