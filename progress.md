# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- Runtime map is generated from `docs/map-design/specs/map_spec.json` into `apps/client/public/maps/bazaar-map/` via `pnpm --filter @clawd-strike/client gen:maps`.
- Loading name-entry flow is Enter-only; loading-screen `Start` button is removed.
- Agent runtime APIs are active: `window.render_game_to_text`, `window.agent_apply_action`, `window.advanceTime`.
- Runtime now tracks `focused` + normalized `visibility` and exposes `gameplay.backgroundThrottled`.
- Agent Mode does not intentionally pause on blur/hidden; Human mode keeps pointer-lock/pause behavior.
- Hidden->visible RAF resume resets frame-time baseline to avoid large `deltaMs` spikes.
- Agent Mode shows a non-blocking background/throttling banner when unfocused or hidden.
- Map approval is still pending blockout traversal/readability signoff.

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
VERCEL_TOKEN=<token> vercel deploy --prod --yes
```

## Last Completed Prompt
- Persisted selected loading-screen mode + name into URL (`mode`, `name`) before runtime handoff in `apps/client/src/loading-screen/bootstrap.ts`.
- Prior prompt also shipped Agent Mode background behavior: focus/visibility tracking, `backgroundThrottled` state, overlay banner, and hidden->visible RAF delta protection.
- Branch is prepared for playtest on `codex/agent-dev` and merged into `main` locally.

## Next 3 Tasks
1. Manual desktop check: alt-tab and minimize/restore while Agent Mode is running.
2. Re-verify pointer-lock/pause flow for Human mode after merge.
3. Deploy and validate `/skills.md` behavior notes on production.

## Known Issues / Risks
- `gen:maps` still emits expected clear-zone anchor warnings for several landmarks/open-node anchors.
- Playwright pointer-lock/focus-visibility transitions can be flaky; OS-level manual verification remains required.
