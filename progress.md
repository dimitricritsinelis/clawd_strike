# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- Bazaar prop runtime pack remains `bazaar_prop_models_pack_v1` with `props=bazaar` opt-in.
- P34 fixes floating canopy placement with top-aligned dressing (`canopy`, `serviceDoor`, `signage`) instead of always bottom-aligning dressed meshes.
- Canopy models now rotate to horizontal slab orientation, use non-uniform fit-to-target scaling, and render double-sided from below.
- Shopfront dressed model selection is now structure-only (`pp_market_stand`) to remove oversized crate/bag storefronts.
- Stall-strip filler now skips `clear_travel_zone` rectangles to reduce visual clutter in main traversal lanes.
- Deterministic compare screenshots captured for P34 and review gate passed (`pos/yaw/pitch/fov drift = 0`).
- Validation: ✅ `pnpm typecheck` and ✅ `pnpm build`.
- Dev server restarted on `5174`; canonical compare URL opened for manual smoke.

## Canonical Playtest URL
- `http://127.0.0.1:5174/?map=bazaar-map&floors=pbr&walls=pbr&lighting=golden&shot=compare&autostart=human&props=bazaar`

## Map Approval Status
- `NOT APPROVED`

## How to Run (real commands only)
```bash
pnpm dev
pnpm typecheck
pnpm build
pnpm --filter @clawd-strike/client fetch:bazaar-walls-sky --force
pnpm --filter @clawd-strike/client fetch:bazaar-props --force
```

## Last Completed Prompt
- Prompt ID: `P34_map_visual_polish`
- What changed:
- `/Users/dimitri/Desktop/clawd-strike/apps/client/src/runtime/map/buildProps.ts`
- `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P34_map_visual_polish/before.png`
- `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P34_map_visual_polish/before_state.json`
- `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P34_map_visual_polish/after.png`
- `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P34_map_visual_polish/after_state.json`
- `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P34_map_visual_polish/review.json`
- Quick test steps:
- `pnpm dev`
- Open canonical URL above for deterministic compare framing.
- Optional traversal URL: `http://127.0.0.1:5174/?map=bazaar-map&floors=pbr&walls=pbr&lighting=golden&autostart=human&props=bazaar`

## Next 3 Tasks
1. Add 2-3 additional CC0 market stall/counter meshes to improve shopfront variety without reintroducing tiny repeated visuals.
2. Move per-model fit/offset values from code into manifest-driven metadata (`models.json` overrides).
3. Add `propsDebug=1` overlay (pivot, wall-normal, chosen model id) to speed visual tuning loops.

## Known Issues / Risks
- Automated movement smoke in Playwright still reports `WrongDocumentError` during pointer-lock request after loading→runtime transition.
- Canopy visuals are conservative (small spans skipped) until better dedicated drape models are integrated.
- Compare-shot mode freezes input by design; traversal checks require non-shot URLs.
