# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- `docs/map-design` remains the source-of-truth input (spec + refs) and is only used by `gen:maps` to emit runtime copies under `apps/client/public/maps/bazaar-map/`.
- Facade windows use dedicated `window_glass` detail mesh with reflective blue glass shader.
- Roof caps (4m depth, down from 10m) no longer produce floating slabs above shorter adjacent zones.
- Stone balconies: architect-logic placement, vertical stacking, 2-bay width, 2-bay spacing.
- Side-hall wall heights split by face: inner wall (building-block side) = 9 m; outer wall (perimeter) = 3 m (1 story, visual balance). Uses sign(centerX−mapCenterX)===sign(inwardX) spatial test, same as door policy.
- Connector zones (CONN_SW/SE/NW/NE) raised from 6 m → 9 m; closes 3 m corner gap at every building corner where spawn plaza meets side-hall inner wall.
- `JOG_W_FILL` zone added to design spec (main_lane_segment, X=20.25-22.75, Z=32-50); closes the open outside wall where BZ_M2_JOG steps back 2.5 m east — creates a continuous 9 m exterior wall from Z=14-68.
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
- Jog west pocket exterior wall (`docs/map-design/specs/map_spec.json`):
  - Added `JOG_W_FILL` zone (main_lane_segment, X=20.25-22.75, Y=32-50)
  - Fills non-walkable pocket created by BZ_M2_JOG stepping back 2.5 m west of BZ_M1/M3
  - Generates missing exterior wall at X=20.25, Z=32-50 → continuous 9 m west face Z=14-68
  - Removes staircase step geometry (Z=32 and Z=50 stub walls + roof caps) — clean outside wall

## Next 3 Tasks
1. Play-test the building exterior (west and east faces) — no gap or staircase notch visible.
2. Review door placement policy (spawn walls, terminal main-lane zones) against design intent.
3. Mark map `APPROVED` once blockout geometry satisfies design brief acceptance criteria.

## Known Issues / Risks
- `gen:maps` still emits clear-zone anchor warnings for several landmarks/open-node anchors.
- Automated pointer-lock verification is flaky in Playwright and requires manual browser confirmation.
- Headless Playwright WebGL context unreliable; headed capture remains the dependable path.
