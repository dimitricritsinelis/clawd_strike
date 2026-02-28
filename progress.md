# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- Added floor-only 4K PBR texture integration for Poly Haven `medieval_blocks_05` under client public assets.
- Added floor manifest at `apps/client/public/assets/textures/environment/bazaar/floors/bazaar_floor_textures_pack_v4/materials.json` mapping all walkable floor material IDs to the new 4K set + tuned params (less contrast, larger tiles, softer normals/AO).
- Runtime bootstrap now uses split gates: floors PBR enabled by default, walls PBR disabled.
- Canonical URL now renders textured floors by default; `&floors=blockout` still forces blockout floors.
- Validation passed: `pnpm typecheck`, `pnpm build`.
- Dev-server smoke was run in headed browser mode due headless WebGL limits in this environment.
- Latest compare-shot pair: `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P125_floor_texture_tuneup/`.

## Canonical Playtest URL
- `http://127.0.0.1:5174/?map=bazaar-map&autostart=human`

## Map Approval Status
- `NOT APPROVED`

## How to Run (real commands only)
```bash
pnpm dev
pnpm typecheck
pnpm build
```

## Last Completed Prompt
- Prompt ID: `P125_floor_texture_tuneup`
- What changed:
  - Tuned floor PBR manifest to reduce jarring contrast and repetition (tile scale + dust/gamma + normal/AO intensity):
    - `apps/client/public/assets/textures/environment/bazaar/floors/bazaar_floor_textures_pack_v4/materials.json`
  - Hardened pointer-lock request path to avoid uncaught `WrongDocumentError` when pointer lock is blocked:
    - `apps/client/src/runtime/input/PointerLock.ts`
- Validation:
  - `pnpm typecheck` ✅
  - `pnpm build` ✅
- Quick test steps:
  - `pnpm dev`
  - open: `http://127.0.0.1:5174/?map=bazaar-map&autostart=human`
  - open compare shot: `http://127.0.0.1:5174/?map=bazaar-map&shot=compare&autostart=human`
  - open blockout override: `http://127.0.0.1:5174/?map=bazaar-map&autostart=human&floors=blockout`

## Next 3 Tasks
1. Manual desktop playtest: pointer lock + WASD traversal with PBR floors enabled and blockout fallback.
2. Evaluate floor vs wall readability: decide whether walls need subtle detail or floor needs a small darkening pass.
3. Review map approval criteria (sightlines/rhythm) with tuned floors enabled.

## Known Issues / Risks
- Headless Playwright in this environment cannot reliably create a WebGL context; runtime smoke/screenshots required headed mode.
- Automated pointer-lock assertion is limited in Playwright here (pointer lock still needs direct manual check).
- `gen:maps` continues to emit known clear-zone anchor warnings for designated anchors.
