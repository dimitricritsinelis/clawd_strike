# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Runtime: loading screen -> click `Human` -> gameplay runtime (pointer lock + full-screen canvas)
- Map: `bazaar-map` blockout + deterministic props + AK47 viewmodel (FPS only)
- Movement: WASD + mouse-look; default run; Shift walk; Space jump; stable AABB sliding
- Rendering: high-vis palette (floors/walls/landmarks/blockers/clear overlays), no shadows
- Determinism: `shot=compare` snaps compare camera; `seed` stabilizes prop layout
- Debug: `debug=1` HUD; `anchors=1&labels=1`; `perf=1` perf HUD; `highvis=1` extra-bright palette
- Loading UI: critical assets decode-gated; logo/buttons/mute reveal atomically (no transient gray tiles in repeated reload captures)
- Build: ✅ `pnpm typecheck` | ✅ `pnpm build`

## Canonical Playtest URL
- `http://127.0.0.1:5174/?map=bazaar-map&shot=compare`

## Map Approval Status
- `NOT APPROVED`

## How to Run (real commands only)
```bash
pnpm dev
pnpm typecheck
pnpm build
```

## Last Completed Prompt
- Prompt ID: `P10_loading_sync_fix`
- Summary:
  - Added critical loading-screen asset preloader with 2500ms fail-open timeout (`webp` targets for active viewport)
  - Added `data-assets-ready` gating so logo/buttons/mute stay hidden until assets are ready, then reveal together in one frame
  - Reordered loading-screen `<picture>` sources to `webp` first, then `avif`, then existing PNG fallback `<img>`
  - Added preload hints for human/agent/mute desktop+mobile assets
  - Captured deterministic artifacts: `artifacts/screenshots/P10_loading_sync_fix/before.png` and `artifacts/screenshots/P10_loading_sync_fix/after.png`
- Files touched:
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/index.html`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/loading-screen/assets.ts`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/loading-screen/bootstrap.ts`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/loading-screen/ui.ts`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/progress.md`
- How to test (60s):
  - Run `pnpm dev`
  - Open canonical URL (above)
  - Perform 5 hard reloads + 5 normal reloads
  - Confirm no gray placeholder tiles appear and logo/buttons/mute reveal in sync
  - Click `Human`/`Agent` hit targets to verify interaction remains intact

## Next 3 Tasks
1. Convert loading background `image-set` ordering to `webp` first and verify no visual regression across Chrome/Safari.
2. Add optional branded low-contrast placeholder silhouettes for ultra-slow networks before `assets-ready=true`.
3. Investigate and eliminate Vite unresolved public-asset warnings from loading-screen CSS/image-set references.

## Known Issues / Risks
- Vite build emits unresolved public asset warnings for some loading-screen image references.
- Bundle chunk size warning (`>500kB`) after minification.
- `LMK_MID_WELL_01` lies inside `CLEAR_M2` and is intentionally visual-only (non-colliding).
