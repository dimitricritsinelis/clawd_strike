# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Map v2.3: side halls widened to 6.5m (4.5m clear), connectors to 6.0m, cuts to 12.25m.
- Shopfront anchors rebuilt with organic irregular spacing + per-stall `width_m` (M1=spice, M2=fabric, M3=rug).
- 3 open_node anchors added as intentional market gap zones (M1 mid, M2 well courtyard, M3 arch clear).
- `buildProps.ts`: shopfronts now use `anchor.widthM` as authoritative width (±20% jitter vs. old ~4× range).
- `buildProps.ts`: side hall fillers are now 1.0–1.8m wall-aligned groups (was 0.24–0.62m scattered pebbles).
- `buildProps.ts`: stall filler skips open_node exclusion radius; open_node anchors place no geometry.
- Runtime layering polish: world raycast utility moved from `weapons/` into `sim/collision/`.
- Enemy ray-vs-AABB slab test is now shared in one utility (removed duplicate implementations).
- Docs now match repo reality: source spec -> `pnpm gen:maps` -> runtime public map files.
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
- Prompt ID: `P19_repo_polish_pass`
- Summary:
  - Deleted stray local junk directory `node_modules 2/` and added explicit ignore entry to `.gitignore`.
  - Updated `README.md` with repo layout, map generation pipeline, and automation hook docs.
  - Rewrote `docs/map-design/docs/codex_instructions.md` and `docs/map-design/docs/codex_prompt.md` to remove non-repo engine/navmesh requirements and reflect real runtime flow.
  - Moved `raycastAabb.ts` from `apps/client/src/runtime/weapons/` to `apps/client/src/runtime/sim/collision/` and updated imports.
  - Added shared `apps/client/src/runtime/sim/collision/rayVsAabb.ts` and switched both `EnemyController` + `EnemyManager` to use it.
  - De-duplicated player body constants in `EnemyManager` by importing from `PlayerController`.
- Files touched:
  - `/Users/dimitri/Desktop/ClawdStrike_v2/.gitignore`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/README.md`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/docs/map-design/docs/codex_instructions.md`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/docs/map-design/docs/codex_prompt.md`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/sim/collision/raycastAabb.ts`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/sim/collision/rayVsAabb.ts`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/weapons/Ak47FireController.ts`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/enemies/EnemyController.ts`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/enemies/EnemyManager.ts`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/progress.md`
- How to test (60s):
  - Run `pnpm dev`.
  - Canonical URL: `http://127.0.0.1:5174/?map=bazaar-map&shot=compare`
  - Runtime fast-path URL (menu bypass): `http://127.0.0.1:5174/?autostart=human&map=bazaar-map&shot=compare`
  - Confirm map loads, then pointer lock + WASD/mouse-look + collision remain unchanged.
  - Run `pnpm typecheck` and `pnpm build`.

## Next 3 Tasks
1. Split `apps/client/src/runtime/audio/WeaponAudio.ts` into smaller modules without behavior change.
2. Split `apps/client/src/runtime/map/buildProps.ts` into focused placement helpers while preserving deterministic output.
3. Evaluate adding lightweight formatter/linter wiring with minimal diff surface.

## Known Issues / Risks
- Playwright pointer-lock automation still throws `WrongDocumentError` in this environment; full fire/reload verification needs an interactive browser session.
- Headless Playwright WebGL capture can fail (`A WebGL context could not be created`) — use headed mode for screenshots.
- Compare-shot screenshots are deterministic but do not exercise live firing/reload behavior.
- open_node anchors inside clear travel zones produce `[gen:maps] warning` lines — intentional, they are gap markers.
- Existing map generator warnings for `LMK_HERO_ARCH_01` and `LMK_MID_WELL_01` remain intentional.
