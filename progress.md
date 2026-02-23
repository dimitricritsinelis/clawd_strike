# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- Wall generation now reads optional `defaults.wall_thickness` (current runtime default = `0.25m`) from `map_spec.json`.
- New deterministic wall detail system is active (plinth/cornice/edge trims/pilasters/recess panels/door frames/sign mounts/awning brackets/cable runs).
- Wall details are zone-aware: main-lane protrusions clamp to `<=0.10m`; global max protrusion default remains `0.15m`.
- Wall detail meshes are visual-only (instanced, shadow-casting), and wall collisions remain base AABBs only.
- URL toggles added: `wallDetails` (on/off) + `wallDetailDensity` (0..2 scalar).
- Canonical compare screenshots for this prompt captured at `artifacts/screenshots/P51_wall_detail_kit/`.
- Validation: ✅ `pnpm typecheck` and ✅ `pnpm build`; headed smoke confirms pointer lock + movement + collision still working.

## Canonical Playtest URL
- `http://127.0.0.1:5174/?map=bazaar-map&shot=compare&autostart=human`

## Map Approval Status
- `NOT APPROVED`

## How to Run (real commands only)
```bash
pnpm dev
pnpm typecheck
pnpm build
```

## Last Completed Prompt
- Prompt ID: `P51_wall_detail_kit`
- What changed:
- `/Users/dimitri/Desktop/clawd-strike/apps/client/src/runtime/map/wallDetailKit.ts`
- `/Users/dimitri/Desktop/clawd-strike/apps/client/src/runtime/map/wallDetailPlacer.ts`
- `/Users/dimitri/Desktop/clawd-strike/apps/client/src/runtime/map/buildBlockout.ts`
- `/Users/dimitri/Desktop/clawd-strike/apps/client/src/runtime/map/types.ts`
- `/Users/dimitri/Desktop/clawd-strike/apps/client/src/runtime/utils/UrlParams.ts`
- `/Users/dimitri/Desktop/clawd-strike/apps/client/src/runtime/game/Game.ts`
- `/Users/dimitri/Desktop/clawd-strike/apps/client/src/runtime/bootstrap.ts`
- `/Users/dimitri/Desktop/clawd-strike/apps/client/scripts/gen-map-runtime.mjs`
- `/Users/dimitri/Desktop/clawd-strike/docs/map-design/specs/map_spec.json`
- `/Users/dimitri/Desktop/clawd-strike/docs/map-design/specs/map_spec_schema.json`
- `/Users/dimitri/Desktop/clawd-strike/apps/client/public/maps/bazaar-map/map_spec.json`
- `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P51_wall_detail_kit/before.png`
- `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P51_wall_detail_kit/after.png`
- Quick test steps:
- `pnpm typecheck`
- `pnpm build`
- `pnpm dev`
- Open `http://127.0.0.1:5174/?map=bazaar-map&autostart=human`, click into the canvas, and verify pointer lock + WASD movement + wall collision.
- Open `http://127.0.0.1:5174/?map=bazaar-map&shot=compare&autostart=human` for deterministic wall-detail compare framing.

## Next 3 Tasks
1. Tune wall detail density/protrusion by zone after design review (especially right-wall cable/sign clutter in compare shot).
2. Add optional `colliders=1` visual overlay pass to verify all new wall details remain non-collidable.
3. Add one additional deterministic compare shot focused on side-hall service doors to review door-frame rhythm.

## Known Issues / Risks
- Runtime generator still warns that some landmark/open-node anchors lie inside clear-travel zones.
- Headless Playwright runs can fail WebGL context creation on this machine; headed mode is currently reliable for captures.
- Existing compare camera favors one lane; some new wall-detail variation is easier to assess from additional shots.
