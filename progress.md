# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- Facade windows now use dedicated `window_glass` detail mesh with always-on blue reflective shader detail (pane grid + grime).
- Window placement no longer uses coplanar recessed back panels, reducing shimmer/z-fight on facade windows.
- PBR wall-detail batching now supports per-mesh material policy so non-stone details (including glass) keep template materials.
- Canonical URL unchanged and remains the primary playtest route.
- Latest compare-shot pair: `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P127_window_glass_upgrade/`.

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
- Prompt ID: `P127_window_glass_upgrade`
- What changed:
  - Added `window_glass` to wall detail mesh IDs/templates and introduced per-mesh wall-material inheritance policy:
    - `apps/client/src/runtime/map/wallDetailKit.ts`
  - Replaced window recessed back panel placement with inset glass slab placement:
    - `apps/client/src/runtime/map/wallDetailPlacer.ts`
  - Added dedicated physical-material shader tweaks for opaque reflective blue glass (Fresnel + fake env gradient + pane grid + grime):
    - `apps/client/src/runtime/render/materials/applyWindowGlassShaderTweaks.ts`
  - Validation:
    - `pnpm typecheck` ✅
    - `pnpm build` ✅
  - Quick test steps:
    - `pnpm dev`
    - open: `http://127.0.0.1:5174/?map=bazaar-map&autostart=human`
    - open compare shot: `http://127.0.0.1:5174/?map=bazaar-map&shot=compare&autostart=human`

## Next 3 Tasks
1. Tune glass reflect/grid/grime constants against gameplay distance in both standard and `highVis` modes.
2. Verify facade window read across additional lanes/connectors to confirm no angle-specific shimmer remains.
3. Optionally darken door recess interiors slightly for stronger depth contrast against new glass highlights.

## Known Issues / Risks
- Headless Playwright in this environment can fail to provide reliable WebGL context; headed capture remains the dependable path.
- Automated pointer-lock assertion remains limited in this environment (smoke script may report blocked pointer lock).
- `gen:maps` continues to emit known clear-zone anchor warnings for designated anchors.
