# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- Updated wall detail/blockout generation path for deterministic blockers and collider/material parity in blockout rendering.
- Built wall detail pass now produces cleaner deterministic spacing and cleaner edge behavior for bazaar map blockers.
- Canonical URL and controls remain unchanged; wall blockout changes are visible with `?map=bazaar-map`.
- Validation was already clean before this prompt: `pnpm typecheck`, `pnpm build`.
- Latest compare-shot pair unchanged: `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P125_floor_texture_tuneup/`.

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
- Prompt ID: `P126_wall_blockout_geometry`
- What changed:
  - Updated wall blockout/build detail code to improve deterministic detail placement and consistency:
    - `apps/client/src/runtime/map/buildBlockout.ts`
    - `apps/client/src/runtime/map/buildPbrWalls.ts`
    - `apps/client/src/runtime/map/wallDetailKit.ts`
    - `apps/client/src/runtime/map/wallDetailPlacer.ts`
  - Validation:
    - `pnpm typecheck` ✅
    - `pnpm build` ✅
  - Quick test steps:
    - `pnpm dev`
    - open: `http://127.0.0.1:5174/?map=bazaar-map&autostart=human`
    - open compare shot: `http://127.0.0.1:5174/?map=bazaar-map&shot=compare&autostart=human`

## Next 3 Tasks
1. Manual desktop playtest: pointer lock + WASD traversal with wall blockout detail + blockers.
2. Validate wall blocker shapes against `docs/map-design/specs/map_spec.json` constraints.
3. Review map approval criteria with wall detail pass before next texture decisions.

## Known Issues / Risks
- Headless Playwright in this environment cannot reliably create a WebGL context; runtime smoke/screenshots required headed mode.
- Automated pointer-lock assertion is limited in Playwright here (pointer lock still needs direct manual check).
- `gen:maps` continues to emit known clear-zone anchor warnings for designated anchors.
