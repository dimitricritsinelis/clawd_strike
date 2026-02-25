# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- Applied masonry thickness split-difference tuning in the wall detail pass.
- Masonry recess depth now targets ~`1.5cm–3.5cm`.
- Masonry proud depth now targets ~`0.6cm–1.8cm`.
- Relief thickness change is isolated to `masonry_block` depth/offset logic (no layout/collider edits).
- Validation passed: ✅ `pnpm typecheck`, ✅ `pnpm build`.
- Compare-shot review passed with zero camera drift (`before.png` vs `after.png`).
- Dev server restart + canonical URL open completed; pointer-lock automation still throws known `WrongDocumentError`.

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
- Prompt ID: `P75_masonry_thickness_split`
- What changed:
- `/Users/dimitri/Desktop/clawd-strike/apps/client/src/runtime/map/wallDetailPlacer.ts`
- `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P75_masonry_thickness_split/before.png`
- `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P75_masonry_thickness_split/after.png`
- `/Users/dimitri/Desktop/clawd-strike/progress.md`
- Quick test steps:
- `pnpm typecheck`
- `pnpm build`
- `pnpm dev` then open `http://127.0.0.1:5174/?map=bazaar-map&shot=compare&autostart=human`
- optional framing gate:
- `node apps/client/scripts/review-shot-pair.mjs --before-image artifacts/screenshots/P75_masonry_thickness_split/before.png --after-image artifacts/screenshots/P75_masonry_thickness_split/after.png --before-state artifacts/screenshots/P75_masonry_thickness_split/before_state.json --after-state artifacts/screenshots/P75_masonry_thickness_split/after_state.json --review-note "Adjusted masonry relief thickness to split-difference targets: subtler proud blocks and moderate recessed blocks for texture-ready surface depth."`

## Next 3 Tasks
1. Start texture pass with conservative normal intensity so geometry relief + normal detail do not stack too aggressively.
2. Add a tiny per-zone masonry density scalar (main lane vs side halls) only if texture read still appears too uniform.
3. Perform manual in-browser pointer-lock/WASD traverse on non-compare URL to confirm no movement regressions.

## Known Issues / Risks
- Runtime map generation still warns that several anchors lie inside clear-travel zones.
- Headed Playwright pointer-lock automation can fail with `WrongDocumentError`; manual pointer-lock test is still required.
- Canonical URL uses `shot=compare`, which intentionally freezes gameplay input for deterministic framing.
