# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- Runtime map is generated from `docs/map-design/specs/map_spec.json` into `apps/client/public/maps/bazaar-map/` via `pnpm --filter @clawd-strike/client gen:maps`.
- Loading-screen handoff now starts visible-asset warmup immediately (`onLoadingReady`) and reuses warmed assets on transition.
- Warmup covers first-frame-visible assets: PBR floor texture packs (when `floors=pbr`) and AK viewmodel (when `vm=1`/default).
- Runtime transition now blocks on warmup completion before gameplay appears, with fail-open warnings on warmup errors.
- Runtime boot reuses warmed assets, preloads floor maps for selected quality, and performs one pre-RAF render so first visible frame is fully populated.
- Browser tab title now uses `Clawdstrike` (no space) via client HTML `<title>` tag.
- Timer HUD is now hard-locked to top-center (`14px`) and no longer shifts for pointer-lock/fullscreen banner heuristics.
- Deterministic compare-shot pair captured for this prompt under `artifacts/screenshots/2026-03-01-timer-lock-top/`.
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
- Locked in-game timer position so it no longer moves up/down during runtime.
- Touched files: `apps/client/src/runtime/ui/TimerHud.ts`.
- Validation completed: `pnpm typecheck` and `pnpm build` passed.
- Smoke checks completed:
  - Restarted `pnpm dev` and opened canonical URL.
  - Headless canonical runtime probe passed (`timer top` remained `14px` over time, map loaded, no console errors).
- Screenshots:
  - `artifacts/screenshots/2026-03-01-timer-lock-top/before.png`
  - `artifacts/screenshots/2026-03-01-timer-lock-top/after.png`

## Next 3 Tasks
1. Manual desktop pointer-lock pass to confirm timer remains visually fixed during lock/unlock and full-screen transitions.
2. Add optional debug-only warmup timing telemetry (`warmup ms`, `enter->runtime ms`) for regression tracking without UI changes.
3. Extend warmup coverage to any additional first-frame props/materials that become visible in approved blockout views.

## Known Issues / Risks
- `gen:maps` still emits expected clear-zone anchor warnings for several landmarks/open-node anchors.
- Automated checks cannot fully validate OS/browser pointer-lock UX; manual verification remains required.
- Warmup is fail-open by design: if an asset preload fails, runtime continues with warning + fallback behavior.
