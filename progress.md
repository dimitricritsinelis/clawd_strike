# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- `docs/map-design` remains the source-of-truth input (spec + refs) and is only used by `gen:maps` to emit runtime copies under `apps/client/public/maps/bazaar-map/`.
- Facade windows use dedicated `window_glass` detail mesh with reflective blue glass shader.
- Roof caps (4m depth, down from 10m) no longer produce floating slabs above shorter adjacent zones.
- Stone balconies: architect-logic placement, vertical stacking, 2-bay width, 2-bay spacing.
- Side-hall wall heights split by face: inner wall (building-block side) = 9 m; outer wall (perimeter) = 3 m (1 story, visual balance). Uses sign(centerX−mapCenterX)===sign(inwardX) spatial test, same as door policy.
- Connector zones (CONN_SW/SE/NW/NE) raised from 6 m → 9 m; closes 3 m corner gap at every building corner where spawn plaza meets side-hall inner wall.
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
- Connector zone walls raised to 9 m (`wallDetailPlacer.ts`):
  - Added `connector` case to `resolveSegmentWallHeight` → `3 * STORY_HEIGHT_M`
  - Closes visible 3 m rectangular gap at all 4 building corners (CONN_SW/SE/NW/NE)
  - All building-enclosing zone types now flush at 9 m: main_lane_segment, spawn_plaza, cut, side_hall inner, connector

## Next 3 Tasks
1. Play-test all 4 building corners — no gap visible above connector zones.
2. Review door placement policy (spawn walls, terminal main-lane zones) against design intent.
3. Mark map `APPROVED` once blockout geometry satisfies design brief acceptance criteria.

## Known Issues / Risks
- `gen:maps` still emits clear-zone anchor warnings for several landmarks/open-node anchors.
- Automated pointer-lock verification is flaky in Playwright and requires manual browser confirmation.
- Headless Playwright WebGL context unreliable; headed capture remains the dependable path.
