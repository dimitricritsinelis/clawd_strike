# Codex Prompt — Bazaar Blockout Runtime (Copy/Paste)

You are updating the Bazaar map runtime for this repository.

## Inputs
- Source spec: `docs/map-design/specs/map_spec.json`
- Visual refs: `docs/map-design/refs/bazaar_slice_v2_2_detailed_birdseye.png`
- Layout sanity: `docs/map-design/blockout/topdown_layout.svg`

## Task
1. Apply map/layout adjustments in the source spec only.
2. Regenerate runtime map files:
```bash
pnpm --filter @clawd-strike/client gen:maps
```
3. Keep runtime behavior deterministic (same map id + seed => same world/props/spawn).
4. Preserve client-only scope (no multiplayer/server authority work).

## Runtime Outputs
- `apps/client/public/maps/bazaar-map/map_spec.json`
- `apps/client/public/maps/bazaar-map/shots.json`

## Coordinate Reminder
- Design: `(x,y)` ground and `z` up.
- Runtime: `(x,z)` ground and `y` up.
- Use `apps/client/src/runtime/map/coordinateTransforms.ts`.

## Validation
```bash
pnpm typecheck
pnpm build
```

## Playtest URL
- `http://127.0.0.1:5174/?map=bazaar-map&shot=compare`
