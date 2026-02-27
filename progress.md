# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- `docs/map-design` remains the source-of-truth input (spec + refs) and is only used by `gen:maps` to emit runtime copies under `apps/client/public/maps/bazaar-map/`.
- Working on `codex/loading-screen` in the loading UI loop.
- Added loading info overlay asset wiring (`info_screen.png`) and `#info-btn` toggle behavior; logo now shifts/scale transitions instead of fully hiding on info open.
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
- Prompt ID: `P127_loading_screen_info_layout`
- What changed:
  - Kept the clawstrike logo visible on info-screen toggle by scaling it down and moving it up (`apps/client/src/styles.css`).
  - Kept human/agent action buttons hidden while info overlay opens.
  - Nudged the `info_screen.png` render down via CSS transform so it no longer overlaps the logo (`apps/client/src/styles.css`).
- Validation:
  - `pnpm typecheck`
  - `pnpm build`
- Quick test steps:
  - `pnpm dev` then open: `http://127.0.0.1:5174/?map=bazaar-map&shot=compare&autostart=human`
  - Captured before/after screenshot pair at `artifacts/screenshots/P127_loading_screen_info_layout/before.png` and `after.png`.

## Next 3 Tasks
1. Validate on-device/manual pointer behavior for logo + info-screen transition with repeated toggles.
2. Confirm Escape closes the info overlay and returns to base state across desktop + mobile breakpoints.
3. Capture a second pass of screenshots if QA calls out additional spacing adjustments.

## Known Issues / Risks
- `gen:maps` still emits clear-zone anchor warnings for several landmarks/open-node anchors.
- Info-screen overlay state is entirely UI-scoped; additional touch/click-state logic for mobile overlays may need validation.
