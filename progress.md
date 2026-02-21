# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- Milestone 1 floor coherence pass implemented behind `?floors=pbr`.
- `stall_strip` no longer contributes a separate PBR floor surface (overlap/z-fighting source removed).
- PBR floor material selection is now deterministic per-zone-type (no random per-cell patchwork).
- Added build-time overlap warning for included PBR floor zones.
- Deterministic compare-shot pair captured for this prompt (`before.png`/`after.png`).
- Validation: ✅ `pnpm typecheck` and ✅ `pnpm build`.

## Canonical Playtest URL
- `http://127.0.0.1:5174/?map=bazaar-map&floors=pbr&shot=compare`

## Map Approval Status
- `NOT APPROVED`

## How to Run (real commands only)
```bash
pnpm dev
pnpm typecheck
pnpm build
```

## Last Completed Prompt
- Prompt ID: `P22_floor_pbr_coherence`
- What changed:
  - Updated PBR floor zone inclusion/material assignment in `/Users/dimitri/Desktop/clawd-strike/apps/client/src/runtime/map/buildPbrFloors.ts`.
  - Added overlap detection warning for included floor zones in `/Users/dimitri/Desktop/clawd-strike/apps/client/src/runtime/map/buildPbrFloors.ts`.
  - Captured deterministic compare screenshots:
    - `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P22_floor_pbr_coherence/before.png`
    - `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P22_floor_pbr_coherence/after.png`
- Quick test steps:
  - `pnpm dev`
  - Open `http://127.0.0.1:5174/?map=bazaar-map&floors=pbr`
  - Open `http://127.0.0.1:5174/?map=bazaar-map&floors=pbr&shot=compare`

## Next 3 Tasks
1. Tune floor shading response in `/Users/dimitri/Desktop/clawd-strike/apps/client/src/runtime/render/materials/FloorMaterialLibrary.ts` toward warm/dusty CS:GO readability (roughness/normal/AO).
2. If needed, increase `tileSizeM` for noisy floor materials in `/Users/dimitri/Desktop/clawd-strike/apps/client/public/assets/textures/environment/bazaar/floors/bazaar_floor_textures_pack_v4/materials.json`.
3. Add deterministic macro variation (albedo/roughness breakup) in floor material shader path while keeping low noise.

## Known Issues / Risks
- Automated pointer-lock smoke via Playwright can still hit `WrongDocumentError`; interactive browser smoke remains required for definitive pointer-lock behavior.
- Existing workspace has unrelated in-progress changes; this prompt only modified the floor builder logic and screenshot artifacts listed above.
