# Codex Instructions — Bazaar Runtime Pipeline (This Repo)

## Goal
Keep the Bazaar blockout maintainable and deterministic in the current web client runtime.

## Source Of Truth
- Primary: `docs/map-design/specs/map_spec.json`
- Visual intent: `docs/map-design/refs/bazaar_slice_v2_2_detailed_birdseye.png`
- Geometry sanity check: `docs/map-design/blockout/topdown_layout.svg`

Do not invent layout data. If required fields are missing, update spec inputs rather than guessing.

## Runtime Map Pipeline
1. Edit design spec in `docs/map-design/specs/map_spec.json`.
2. Generate runtime copies:
```bash
pnpm --filter @clawd-strike/client gen:maps
```
3. Runtime consumes:
  - `apps/client/public/maps/<mapId>/map_spec.json`
  - `apps/client/public/maps/<mapId>/shots.json`

`apps/client/scripts/gen-map-runtime.mjs` is the converter from design packet -> runtime map files.

## Coordinate Systems
- Design packet coordinates:
  - ground plane: `(x, y)`
  - up axis: `z`
- Runtime coordinates:
  - ground plane: `(x, z)`
  - up axis: `y`

Use `apps/client/src/runtime/map/coordinateTransforms.ts` for mapping:
- `designToWorldVec3`
- `designYawDegToWorldYawRad`

## Scope Boundaries
- In scope: blockout geometry, AABB collisions, placeholder props, deterministic runtime map loading.
- Out of scope in this repo: navmesh systems, engine-export targets, multiplayer/server authority.

## Validation
Run:
```bash
pnpm typecheck
pnpm build
```

Canonical playtest URL:
- `http://127.0.0.1:5174/?map=bazaar-map&shot=compare`
