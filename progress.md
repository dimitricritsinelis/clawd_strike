# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- Map props are now globally disabled in runtime (no prop spawning, no prop colliders).
- Bazaar prop model loading is disabled in bootstrap, even if URL requests bazaar prop visuals.
- Runtime text-state now reports zero props: `density: 0`, `collidersPlaced: 0`, `candidatesTotal: 0`.
- Validation: ✅ `pnpm typecheck` and ✅ `pnpm build`.
- Smoke checks: dev server restarted; canonical URL opened; headed Playwright run reported no console errors.

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
- Prompt ID: `P71_disable_all_props`
- What changed:
- `/Users/dimitri/Desktop/clawd-strike/apps/client/src/runtime/bootstrap.ts`
- `/Users/dimitri/Desktop/clawd-strike/apps/client/src/runtime/game/Game.ts`
- `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P71_disable_all_props/before.png`
- `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P71_disable_all_props/after.png`
- `/Users/dimitri/Desktop/clawd-strike/progress.md`
- Quick test steps:
- `pnpm typecheck`
- `pnpm build`
- `pnpm dev` then open `http://127.0.0.1:5174/?map=bazaar-map&shot=compare&autostart=human`
- verify runtime state shows props density/colliders at zero

## Next 3 Tasks
1. Decide whether to keep props hard-disabled or gate with an explicit URL flag (`props=off`) for quick toggling.
2. Wire `#skills-md-btn` to a real in-game/help destination instead of banner placeholder.
3. Add an explicit way to return from Agent submenu back to Human/Agent choices.

## Known Issues / Risks
- Runtime map generation still warns that multiple anchors lie inside clear-travel zones.
- Canonical URL includes `shot=compare`, which freezes gameplay input for deterministic framing.
- Headless Playwright can fail WebGL context creation; use headed mode for reliable smoke checks.
