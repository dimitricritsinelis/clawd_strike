# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- Loading screen uses separate containers: `.actions-buttons` (buttons) and `.actions-nameplate` (nameplate).
- Button row anchor: `top: 525px`, `left: calc(50% - 16px)`.
- Nameplate anchor: `top: 435px`, `left: calc(50% - 11px)`.
- Agent flow: click `Agent` -> agent submenu (`skills.md` + `enter agent mode`) -> `Enter agent mode` shows nameplate.
- Global `Escape` always resets to primary Human/Agent buttons.
- Placeholder text is mode-specific (`HUMAN NAME` / `AGENT NAME`), alpha `0.80`.
- White text regression fixed: no auto-select on reveal; caret moved to end and selection text color forced dark.
- Temporary tweak mode active: skipping validation/build/screenshots while iterating loading-screen UI.

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
- Prompt ID: `P118_placeholder_white_regression_fix_tweak_only`
- What changed:
- `/Users/dimitri/Desktop/clawd-strike/apps/client/src/loading-screen/ui.ts`
- `/Users/dimitri/Desktop/clawd-strike/apps/client/src/styles.css`
- `/Users/dimitri/Desktop/clawd-strike/progress.md`
- Quick test steps:
- Tweak-only pass (no validation run).
- `pnpm dev` then open:
- `http://127.0.0.1:5174/?map=bazaar-map&shot=compare&autostart=human`

## Next 3 Tasks
1. Finalize horizontal/vertical placement of button row and nameplate.
2. Finalize placeholder darkness and text styling over the nameplate.
3. Once UI is approved, run full validation loop (`pnpm typecheck` + `pnpm build` + restart + screenshots).

## Known Issues / Risks
- Tweak mode currently skips typecheck/build/screenshot validation per user request.
- Runtime map generator still reports known anchor warnings unrelated to loading-screen UI.
