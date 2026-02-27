# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- `docs/map-design` remains the source-of-truth input (spec + refs) and is only used by `gen:maps` to emit runtime copies under `apps/client/public/maps/bazaar-map/`.
- Working on `codex/loading-screen` in the loading UI loop.
- Added loading info overlay asset wiring (`info_screen.png`) and `#info-btn` toggle behavior.
- Validation rerun succeeded (`pnpm typecheck`, `pnpm build`).
- `gen:maps` still emits anchor clearance warnings during build.

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
- Prompt ID: `P126_loading_screen_info_toggle`
- What changed:
  - Moved `Info_Screen.png` from Desktop to `apps/client/public/loading-screen/assets/info_screen.png`.
  - Added loading screen info panel to `apps/client/index.html`.
  - Wired `#info-btn` in `apps/client/src/loading-screen/ui.ts` to toggle an info overlay; Escape now returns to base menu state.
  - Added preload + styling for the new info asset and overlay transitions in `assets.ts` and `styles.css`.
- Validation:
  - `pnpm typecheck`
  - `pnpm build`
- Quick test steps:
  - `pnpm dev` then open: `http://127.0.0.1:5174/?map=bazaar-map&shot=compare&autostart=human`
  - Captured before/after screenshot pair at `artifacts/screenshots/P126_loading_screen_info_toggle/before.png` and `after.png`.

## Next 3 Tasks
1. Run the manual loading-screen interaction smoke (open page, click info, press Escape) on a real browser window.
2. Validate overlay behavior on smaller/mobile viewport sizes and touch input.
3. Add acceptance for the info screen close path via Escape and repeated info button toggles in a follow-up branch test pack.

## Known Issues / Risks
- `gen:maps` still emits clear-zone anchor warnings for several landmarks/open-node anchors.
- Info-screen overlay state is entirely UI-scoped; additional touch/click-state logic for mobile overlays may need validation.
