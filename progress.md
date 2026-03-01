# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- `docs/map-design` remains the source-of-truth input (spec + refs) and is only used by `gen:maps` to emit runtime copies under `apps/client/public/maps/bazaar-map/`.
- Facade windows use dedicated `window_glass` detail mesh with reflective blue glass shader.
- Roof caps (4m depth, down from 10m) no longer produce floating slabs above shorter adjacent zones.
- Stone balconies: architect-logic placement, vertical stacking, 2-bay width, 2-bay spacing.
- 3rd-story wall alignment FIXED: main-lane buildings now fixed at 9 m (3 × STORY_HEIGHT_M); spawn plazas fixed at 6 m; side-hall heights zone-scoped; height seed removed segment index so all walls of a zone share the same height → no more corner holes or floating slabs.
- Loading screen info overlay textbox positioned at `--info-textbox-y-lift: -90px`.
- `gen:maps` still emits anchor clearance warnings during build (expected, not a bug).
- Agent playbook is served at `/skills.md`; loading screen button opens it (same-origin).

## Canonical Playtest URL
- `http://127.0.0.1:5174/?map=bazaar-map&autostart=human`

## Map Approval Status
- `NOT APPROVED`

## How to Run (real commands only)
```bash
pnpm dev
pnpm typecheck
pnpm build
```

## Last Completed Prompt
- Fixed 3rd-story wall/floor alignment (`wallDetailPlacer.ts`):
  - `ROOF_DEPTH_M` 10 → 4 m (stops roof slabs floating above shorter adjacent zones)
  - `resolveSegmentWallHeight`: main_lane_segment fixed 9 m, spawn_plaza fixed 6 m, side_hall zone-scoped random (no jitter)
  - Height seed changed from `height:${index}:${zoneId}` → `height:${zoneId}` so every wall of a zone shares the same height — eliminates corner holes and mismatched facades

## Next 3 Tasks
1. Play-test merged `main` — walk full lane, verify no gaps/holes at zone junctions.
2. Review door placement policy (spawn walls, terminal main-lane zones) against design intent.
3. Evaluate if side-hall height variety (3 m / 6 m) looks good or should be unified.

## Known Issues / Risks
- `gen:maps` still emits clear-zone anchor warnings for several landmarks/open-node anchors.
- Automated pointer-lock verification is flaky in Playwright and requires manual browser confirmation.
- Headless Playwright WebGL context unreliable; headed capture remains the dependable path.
