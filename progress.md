# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- Removed the loading-screen information panel UI entirely from DOM/CSS/preload flow.
- Deleted info-panel image assets from runtime public directory.
- Deleted source panel image from art-source (`information-screen.png`).
- Restored loading actions sizing rules to direct values (no panel-dependent CSS vars).
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
- Prompt ID: `P70_remove_info_screen`
- What changed:
- `/Users/dimitri/Desktop/clawd-strike/apps/client/index.html`
- `/Users/dimitri/Desktop/clawd-strike/apps/client/src/styles.css`
- `/Users/dimitri/Desktop/clawd-strike/apps/client/src/loading-screen/assets.ts`
- `/Users/dimitri/Desktop/clawd-strike/art-source/loading-screen/information-screen.png` (deleted)
- `/Users/dimitri/Desktop/clawd-strike/apps/client/public/loading-screen/assets/loading-info-panel-desktop.png` (deleted)
- `/Users/dimitri/Desktop/clawd-strike/apps/client/public/loading-screen/assets/loading-info-panel-mobile.png` (deleted)
- `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P70_remove_info_screen/before.png`
- `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P70_remove_info_screen/after.png`
- `/Users/dimitri/Desktop/clawd-strike/progress.md`
- Quick test steps:
- `pnpm typecheck`
- `pnpm build`
- `pnpm dev` then open `http://127.0.0.1:5174/?map=bazaar-map&shot=compare`

## Next 3 Tasks
1. Decide whether `#info-btn` should remain decorative or be wired to a real help/info surface.
2. Wire `#skills-md-btn` to a real in-game/help destination instead of banner placeholder.
3. Add an explicit way to return from Agent submenu back to Human/Agent choices.

## Known Issues / Risks
- Runtime map generation still warns that multiple anchors lie inside clear-travel zones.
- Canonical URL includes `shot=compare`, which freezes gameplay input for deterministic framing.
- Headless Playwright can fail WebGL context creation; use headed mode for reliable smoke checks.
