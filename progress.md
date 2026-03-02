# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- Runtime map is generated from `docs/map-design/specs/map_spec.json` into `apps/client/public/maps/bazaar-map/` via `pnpm --filter @clawd-strike/client gen:maps`.
- Loading-screen handoff starts visible-asset warmup immediately and runtime blocks on warmup completion (fail-open warnings on warmup errors).
- Timer HUD is hard-locked to top-center (`14px`) and no longer shifts for pointer-lock/fullscreen banner heuristics.
- Agent-mode automation is headless-safe and verified in bundled Chromium: runtime reaches `mode:"runtime"` with `map.loaded===true` even when `render.webgl===false`, and agent APIs continue to work.
- Death/reset transition is verified: `Play Again` no longer causes `gameOver.visible` flicker during respawn transition.
- `/skills.md` now provides copy/pasteable UI + autostart flows and a headless-safe Playwright harness (Chrome channel fallback to bundled Chromium).
- Map approval remains pending traversal/readability signoff.

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
- Title: Make Agent Mode headless-safe + update /skills.md playbook
- Implemented:
  - `Renderer` now runs with a no-WebGL fallback canvas; render calls no-op and perf counters return zeros when WebGL is unavailable; `hasWebGL` is exposed.
  - Runtime text state now includes `render.webgl`; death-screen re-show is suppressed during respawn transitions to prevent reset flicker.
  - Weapon audio extension probing now prefers `.mp3` before `.ogg`.
  - `apps/client/public/skills.md` includes UI selectors flow, autostart URL flow, headless-safe Playwright harness, readiness detection via `render_game_to_text()`, reset guidance, and `s.render.webgl` note.
- Touched files: `apps/client/src/runtime/render/Renderer.ts`, `apps/client/src/runtime/bootstrap.ts`, `apps/client/src/runtime/audio/WeaponAudio.ts`, `apps/client/public/skills.md`, `progress.md`.
- Validation completed: `pnpm typecheck` and `pnpm build` passed.
- Smoke checks completed:
  - `BASE_URL=http://127.0.0.1:5174 AGENT_NAME=SmokeRunner pnpm --filter @clawd-strike/client smoke:agent` passed.
  - Bundled Chromium headless probe passed in both default and forced no-WebGL (`--disable-gpu --disable-webgl`) runs; runtime remained operational and agent loop APIs worked.
  - Respawn probe passed (`sawDeath=true`, `clickedPlayAgain=true`, `transitionedAlive=true`, `flickerDetected=false`).
  - Audio probe in Chrome channel reported zero `.ogg` requests and zero `.ogg` 404s.
- Screenshots:
  - `artifacts/screenshots/2026-03-02-agent-mode-headless-safe/before.png`
  - `artifacts/screenshots/2026-03-02-agent-mode-headless-safe/after.png`

## Next 3 Tasks
1. Add a CI-friendly headless agent smoke script that launches bundled Chromium and asserts `render.webgl` + runtime readiness gates.
2. Run a manual desktop pointer-lock pass (non-headless) to verify movement/look/collision UX and no console noise during normal human play.
3. Add a small regression test for death->respawn transitions to guard against future `gameOver.visible` flicker reintroduction.

## Known Issues / Risks
- `gen:maps` still emits expected clear-zone anchor warnings for several landmarks/open-node anchors.
- Automated checks cannot fully validate OS/browser pointer-lock UX; manual verification remains required.
- Warmup is fail-open by design: if an asset preload fails, runtime continues with warning + fallback behavior.
- Headless automation may run with `s.render.webgl === false`; screenshot-based checks should prefer headed/system Chrome when visuals matter.
