# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- Runtime map is still generated from `docs/map-design/specs/map_spec.json` into `apps/client/public/maps/bazaar-map/` via `gen:maps`.
- Runtime now tracks focus/visibility explicitly (`window` focus/blur + `document` visibilitychange) and normalizes visibility to `visible|hidden`.
- Agent Mode no longer intentionally pauses/resets input on blur/hidden; Human mode keeps existing pointer-lock/pause behavior.
- `requestAnimationFrame` hidden->visible resume now resets frame baseline time to avoid large `deltaMs` spikes.
- `window.render_game_to_text()` now includes `gameplay.focused`, `gameplay.visibility`, and `gameplay.backgroundThrottled`.
- Agent Mode shows a non-blocking background-throttling banner when unfocused/hidden.
- Loading-screen mode selection now writes `mode` and `name` into URL params before runtime handoff.
- `/skills.md` now documents unfocused-vs-hidden Agent Mode behavior and recommends keeping the window visible for uninterrupted watchability.

## Canonical Playtest URL
- `http://127.0.0.1:5174/?map=bazaar-map&autostart=human`

## Map Approval Status
- `NOT APPROVED`

## How to Run (real commands only)
```bash
pnpm dev
pnpm typecheck
pnpm build
VERCEL_TOKEN=<token> vercel deploy --prod --yes
```

## Last Completed Prompt
- Implemented Agent Mode background/focus behavior in runtime:
  - added explicit focus/visibility tracking + normalized state output
  - added `gameplay.backgroundThrottled` to automation snapshot
  - added Agent Mode background-throttling banner overlay
  - avoided `deltaMs` jump on hidden->visible RAF resume
  - kept blur/visibility input resets and pause flow human-only
- Added mode plumbing so runtime honors `mode=agent` from URL/loading screen (`autostart=agent` now transitions directly).
- Updated deployed playbook docs in `apps/client/public/skills.md` with the new behavior contract.
- Captured deterministic compare-shot screenshots:
  - `artifacts/screenshots/2026-03-01-agent-mode-background-focus/before.png`
  - `artifacts/screenshots/2026-03-01-agent-mode-background-focus/after.png`
- Files touched: `apps/client/src/runtime/bootstrap.ts`, `apps/client/src/runtime/game/Game.ts`, `apps/client/src/runtime/utils/UrlParams.ts`, `apps/client/src/loading-screen/bootstrap.ts`, `apps/client/src/main.ts`, `apps/client/public/skills.md`, `progress.md`.
- Validation: `pnpm typecheck` and `pnpm build` pass.

## Next 3 Tasks
1. Do a true manual OS-level check (real alt-tab + minimize/restore) to confirm `focused/visibility/backgroundThrottled` transitions in a regular desktop session.
2. Extend smoke coverage to assert the Agent Mode banner visibility transitions from runtime DOM in headed runs.
3. Re-run deploy verification so `/skills.md` behavior notes are confirmed on production.

## Known Issues / Risks
- `gen:maps` still emits clear-zone anchor warnings for several landmarks/open-node anchors.
- Playwright could not reliably force `focused=false`/`visibility=hidden` transitions in this environment; OS-level manual validation is still required.
- Pointer-lock verification remains partially manual in automation contexts.
