# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- Completed wall-only masonry mass/openings pass with deterministic wall detail placement.
- Wall detail kit now includes structural masonry ids: `masonry_block`, `masonry_joint`, `masonry_pit`, `string_course_strip`, `corner_pier`.
- Wall thickness default is now `0.35m` in design spec and generated runtime map spec.
- Walls now read as heavier blockwork with plinth variation, irregular roofline ledges, corner piers, recess pits/cracks, and deep rectangular reveal openings.
- Hero anchor `LMK_HERO_ARCH_01` now builds a recessed semicircular portal structure with simple colliding jamb masses.
- Validation passed: ✅ `pnpm typecheck`, ✅ `pnpm build`.
- Compare-shot pair review passed with zero camera drift (`before.png` vs `after.png`).
- Smoke loop completed: dev server restarted and canonical URL opened; Playwright pointer-lock automation remains unreliable.

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
- Prompt ID: `P72_wall_masonry_mass_openings`
- What changed:
- `/Users/dimitri/Desktop/clawd-strike/docs/map-design/specs/map_spec.json`
- `/Users/dimitri/Desktop/clawd-strike/apps/client/public/maps/bazaar-map/map_spec.json`
- `/Users/dimitri/Desktop/clawd-strike/apps/client/src/runtime/map/wallDetailKit.ts`
- `/Users/dimitri/Desktop/clawd-strike/apps/client/src/runtime/map/wallDetailPlacer.ts`
- `/Users/dimitri/Desktop/clawd-strike/apps/client/src/runtime/map/buildProps.ts`
- `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P72_wall_masonry_mass_openings/before.png`
- `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P72_wall_masonry_mass_openings/after.png`
- `/Users/dimitri/Desktop/clawd-strike/progress.md`
- Quick test steps:
- `pnpm typecheck`
- `pnpm build`
- `pnpm dev` then open `http://127.0.0.1:5174/?map=bazaar-map&shot=compare&autostart=human`
- optional framing gate:
- `node apps/client/scripts/review-shot-pair.mjs --before-image artifacts/screenshots/P72_wall_masonry_mass_openings/before.png --after-image artifacts/screenshots/P72_wall_masonry_mass_openings/after.png --before-state artifacts/screenshots/P72_wall_masonry_mass_openings/before_state.json --after-state artifacts/screenshots/P72_wall_masonry_mass_openings/after_state.json --review-note "Wall pass now reads as heavier masonry with deeper openings while preserving compare-camera framing."`

## Next 3 Tasks
1. Tune wall detail density to reduce the hard cap hit (`instanceCount` currently reaches `9800`) while preserving masonry readability.
2. Manual in-browser WASD/pointer-lock collision pass (non-compare shot) to confirm no regressions in movement/corner sliding.
3. If required by design review, refine `LMK_HERO_ARCH_01` portal silhouette depth/profile while keeping the same simple collider strategy.

## Known Issues / Risks
- Runtime map generation still warns that several anchors lie inside clear-travel zones.
- Headed Playwright can capture valid frames, but pointer-lock automation can throw `WrongDocumentError`.
- Canonical URL uses `shot=compare`, so gameplay input is intentionally frozen for deterministic framing.
