# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- Runtime map is generated from `docs/map-design/specs/map_spec.json` into `apps/client/public/maps/bazaar-map/` via `pnpm --filter @clawd-strike/client gen:maps`.
- Wave respawn now reuses enemy controllers/visuals via reset methods instead of per-wave teardown/recreate.
- Enemy hot loops now avoid per-frame target object/closure churn; controller AABBs are reused in place.
- Weapon audio now reuses shared drive curve + cached pooled noise buffers for hit/reload/dryfire events.
- DamageNumbers now reuses a scratch `Vector3`, pools DOM nodes, and uses swap-remove cleanup.
- Renderer shadow map updates are frozen (`autoUpdate=false`) with explicit `requestShadowUpdate()` after map build.
- Perf renderer-info reads + scene traversal sampling now run only while perf HUD is visible.
- Compare-shot artifact pair for this pass: `artifacts/screenshots/targeted-perf-optimizations-20260301/` (`review:shot-pair` passed).
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
- Implemented targeted no-quality-reduction performance optimizations in `EnemyController`, `EnemyManager`, `EnemyVisual`, `WeaponAudio`, `DamageNumbers`, `Renderer`, and `bootstrap`.
- Touched files: `apps/client/src/runtime/enemies/EnemyController.ts`, `apps/client/src/runtime/enemies/EnemyManager.ts`, `apps/client/src/runtime/enemies/EnemyVisual.ts`, `apps/client/src/runtime/audio/WeaponAudio.ts`, `apps/client/src/runtime/ui/DamageNumbers.ts`, `apps/client/src/runtime/render/Renderer.ts`, `apps/client/src/runtime/bootstrap.ts`.
- Validation completed: `pnpm typecheck` and `pnpm build` passed.
- Smoke checks: canonical URL opened; `smoke:agent` passed (`moved=39.214m`) on rerun.

## Next 3 Tasks
1. Capture a Chrome performance trace during wave transition + full-auto to quantify allocation and frame-time improvements.
2. Manual desktop Human-mode pass: pointer lock, WASD/mouselook, and collision feel across full map traversal.
3. Add guardrails for any future moving shadow casters (`requestShadowUpdate()` on movement or mode-based autoUpdate fallback).

## Known Issues / Risks
- `gen:maps` still emits expected clear-zone anchor warnings for several landmarks/open-node anchors.
- Playwright pointer-lock interaction remains flaky in automation; OS-level manual verification is still required for pointer-lock UX.
- Freezing shadow updates assumes no moving `castShadow=true` actors; revisit if dynamic shadow casters are introduced.
