# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Runtime: loading screen -> click `Human` -> gameplay runtime (pointer lock + full-screen canvas)
- Map runtime contract: `/maps/bazaar-map/map_spec.json` + `/maps/bazaar-map/shots.json` (anchors embedded in map spec)
- Movement/collision: WASD + mouse-look + jump; AABB slide solver now broadphase-assisted and less order-dependent
- Input safety: key/jump state resets on blur, visibility change, and pointer unlock
- Loading UI: timeout race fixed; timeout warning only fires if timeout wins; styles moved to `src/styles.css`
- Build pipeline: `prebuild`/`prepreview` run `gen:maps`; CI now checks generated maps are up-to-date
- Bundling: runtime and AK47 viewmodel are lazy-loaded; Vite unresolved public-asset warnings removed
- Validation: ✅ `pnpm typecheck` | ✅ `pnpm build`

## Canonical Playtest URL
- `http://127.0.0.1:5174/?map=bazaar-map&shot=compare`

## Map Approval Status
- `NOT APPROVED`

## How to Run (real commands only)
```bash
pnpm dev
pnpm typecheck
pnpm build
```

## Last Completed Prompt
- Prompt ID: `P11_repo_stability_cleanup`
- Summary:
  - Fixed preloader timeout race and aligned critical loading assets/background format preference to WebP path
  - Moved inline loading-screen CSS from `index.html` to `apps/client/src/styles.css` to remove Vite unresolved asset warnings
  - Switched runtime map loading to `map_spec.json` (anchors embedded), updated generator + loader + CI + package scripts
  - Added lazy loading for gameplay/runtime bootstrap + AK47 viewmodel path to improve chunking
  - Added input reset hooks, centralized design->world transforms, improved collision solver stability, and added broadphase query path
  - Added shared object-disposal utility and repo ergonomics files (`.editorconfig`, `.nvmrc`)
  - Cleaned tracked tmp screenshot artifacts and removed unused `apps/client/public/models/weapons/.DS_Store`
  - Captured deterministic artifacts: `artifacts/screenshots/P11_repo_hardening/before.png` and `artifacts/screenshots/P11_repo_hardening/after.png`
- Files touched:
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/loading-screen/assets.ts`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/styles.css`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/bootstrap.ts`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/map/loadMap.ts`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/scripts/gen-map-runtime.mjs`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/.github/workflows/ci.yml`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/progress.md`
- How to test (60s):
  - Run `pnpm dev`
  - Open canonical URL (above)
  - Confirm loading screen appears without console spam, then click `Human`
  - Verify pointer lock + move/look + collision; reload once and verify no loading timeout warning on successful preload

## Next 3 Tasks
1. Validate pointer-lock + movement smoke in a fully interactive local browser session (Playwright pointer-lock had document-lock error).
2. Decide whether to keep legacy design snapshots (`docs/map-design/anchors.json`, `blockout_spec.json`) or move/delete them.
3. Evaluate further `three` vendor split/treeshake options if we want to reduce the 545k vendor chunk itself (warning is currently silenced via threshold).

## Known Issues / Risks
- Automated Playwright smoke cannot reliably assert pointer lock in this environment (`WrongDocumentError`); manual browser verification still required.
- `LMK_HERO_ARCH_01` and `LMK_MID_WELL_01` are reported inside clear zones by generator warnings (currently intentional for visual rhythm).
