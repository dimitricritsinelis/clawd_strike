# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Map v2.3: side halls widened to 6.5m (4.5m clear), connectors to 6.0m, cuts to 12.25m.
- Shopfront anchors rebuilt with organic irregular spacing + per-stall `width_m` (M1=spice, M2=fabric, M3=rug).
- 3 open_node anchors added as intentional market gap zones (M1 mid, M2 well courtyard, M3 arch clear).
- `buildProps.ts`: shopfronts now use `anchor.widthM` as authoritative width (±20% jitter vs. old ~4× range).
- `buildProps.ts`: side hall fillers are now 1.0–1.8m wall-aligned groups (was 0.24–0.62m scattered pebbles).
- `buildProps.ts`: stall filler skips open_node exclusion radius; open_node anchors place no geometry.
- Ammo HUD + AK reload flow from P13 remain intact.
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
- Prompt ID: `P14_map_organic_layout`
- Summary:
  - Widened side halls (6.5m total / 4.5m clear), connectors (6.0m), cuts (12.25m) in `map_spec.json`.
  - Replaced uniform 3m-interval shopfront grid with organic cluster-based layout (~30 anchors, irregular Y spacing).
  - Each anchor carries explicit `width_m` and `height_m`; M2 well stall uses yaw=80° (angled toward well).
  - Added 3 `open_node` anchors encoding intentional market gaps; `buildProps.ts` skips filler within their radius.
  - Side hall fillers scaled up to 1.0–1.8m wall-aligned groups for goods-stack feel.
  - Shopfront width now driven by `anchor.widthM` (±20% jitter) instead of neighbor-gap heuristic (was ±75%).
  - `gen-map-runtime.mjs`: registered `open_node` in `KNOWN_ANCHOR_TYPES`.
  - `dimension_schedule.csv`: updated side hall, cut, and connector dimensions.
- Files touched:
  - `/Users/dimitri/Desktop/ClawdStrike_v2/docs/map-design/specs/map_spec.json`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/scripts/gen-map-runtime.mjs`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/map/buildProps.ts`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/docs/map-design/specs/dimension_schedule.csv`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/progress.md`
- How to test (60s):
  - Run `pnpm dev`.
  - Compare shot: `http://127.0.0.1:5174/?map=bazaar-map&shot=compare`
  - Walk side halls — should feel like a 4.5m clear service alley, not a tunnel.
  - Walk main lane — shops should have irregular rhythm: wide stalls next to narrow ones, gaps at nodes.
  - Check M2 segment: fewer, wider stalls; one stall slightly angled toward well.
  - Verify stall fillers in side halls look like crate stacks vs. main lane scattered pebbles.

## Next 3 Tasks
1. Add optional dry-fire click event/audio when `mag=0 && reserve=0`.
2. Expose ammo (`mag`, `reserve`, `reloading`) in `render_game_to_text` for automated runtime assertions.
3. Add lightweight reload SFX timing hook (start/end) without introducing full animation scope.

## Known Issues / Risks
- Playwright pointer-lock automation still throws `WrongDocumentError` in this environment; full fire/reload verification needs an interactive browser session.
- Compare-shot screenshots are deterministic but do not exercise live firing/reload behavior.
- open_node anchors inside clear travel zones produce `[gen:maps] warning` lines — intentional, they are gap markers.
- Existing map generator warnings for `LMK_HERO_ARCH_01` and `LMK_MID_WELL_01` remain intentional.
