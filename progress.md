# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- `docs/map-design` remains the source-of-truth input (spec + refs) and is only used by `gen:maps` to emit runtime copies under `apps/client/public/maps/bazaar-map/`.
- Facade windows use dedicated `window_glass` detail mesh with reflective blue glass shader.
- Roof caps (10m depth) fully seal building tops across all building widths.
- Stone balconies: architect-logic placement, vertical stacking, 2-bay width, 2-bay spacing.
- Loading screen info overlay textbox positioned at `--info-textbox-y-lift: -90px`.
- `gen:maps` still emits anchor clearance warnings during build (expected, not a bug).

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
- Merged `codex/windows` into `main`:
  - Wall detail system: shop facades, structured door/window placement
  - Roof caps sealing building tops
  - Stone balconies with architect-logic placement
  - PBR wall material pipeline + window glass shader
  - Loading screen info textbox tuning preserved from `codex/loading-screen`

## Next 3 Tasks
1. Play-test merged `main` — verify loading screen, roof caps, balconies all present.
2. Tune balcony chance / roof depth if visual issues found in play-test.
3. Confirm `--info-textbox-y-lift: -90px` is final or nudge further.

## Known Issues / Risks
- `gen:maps` still emits clear-zone anchor warnings for several landmarks/open-node anchors.
- Automated pointer-lock verification is flaky in Playwright and requires manual browser confirmation.
- Headless Playwright WebGL context unreliable; headed capture remains the dependable path.
