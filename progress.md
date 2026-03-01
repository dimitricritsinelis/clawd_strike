# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- Runtime map is generated from `docs/map-design/specs/map_spec.json` via `pnpm --filter @clawd-strike/client gen:maps` into `apps/client/public/maps/bazaar-map/`.
- Loading name-entry flow is now Enter-only; the loading-screen `Start` button has been removed.
- Agent smoke runner now submits entry via Enter in the agent-name input.
- Agent Mode UI flow and runtime APIs are active (`window.render_game_to_text`, `window.agent_apply_action`, `window.advanceTime`).
- Canonical local playtest URL remains unchanged.
- Map approval still pending blockout traversal/readability signoff.

## Canonical Playtest URL
- `http://127.0.0.1:5174/?map=bazaar-map&autostart=human`

## Map Approval Status
- `NOT APPROVED`

## How to Run (real commands only)
```bash
pnpm dev
pnpm typecheck
pnpm build
BASE_URL=http://127.0.0.1:5174 AGENT_NAME=SmokeRunner pnpm --filter @clawd-strike/client smoke:agent
```

## Last Completed Prompt
- Removed the loading-screen `Start` button; loading mode selection now enters gameplay only via Enter key in the name field.
- Updated automation/docs to match Enter submission (agent smoke runner + `public/skills.md` example flow).
- Captured deterministic loading-nameplate screenshots:
  - `artifacts/screenshots/2026-03-01-enter-key-loading-flow/before.png`
  - `artifacts/screenshots/2026-03-01-enter-key-loading-flow/after.png`
- Files touched: `apps/client/index.html`, `apps/client/src/loading-screen/ui.ts`, `apps/client/src/styles.css`, `apps/client/scripts/agent-smoke-runner.mjs`, `apps/client/public/skills.md`, `progress.md`.
- Validation: `pnpm typecheck` + `pnpm build` pass; Enter-flow smoke and `smoke:agent` pass locally.

## Next 3 Tasks
1. Manually verify human pointer-lock + pause/resume behavior in a desktop browser session.
2. Add a visible Enter-key hint near the nameplate only if UX requests clearer affordance.
3. Decide whether smoke runner should optionally preserve run artifacts (`state.json` / screenshot) for CI triage.

## Known Issues / Risks
- `gen:maps` still reports expected clear-zone anchor warnings for several landmarks/open-node anchors.
- Playwright pointer-lock checks remain unreliable; pointer-lock validation is still manual.
- Browser background/minimized-tab throttling can reduce simulation cadence for automation loops.
