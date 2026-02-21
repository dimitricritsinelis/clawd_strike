# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- Player name label remains in the top-right score panel and is now visibly larger for readability.
- Health HUD still starts with `HP` directly (no name line), keeping bottom-left uncluttered.
- Score HUD keeps player name above KILLS/HEADSHOTS and scales well at default `Operator` length.
- Deterministic compare-shot pair captured for this prompt (`before.png`/`after.png`).
- Validation: ✅ `pnpm typecheck` and ✅ `pnpm build`.

## Canonical Playtest URL
- `http://127.0.0.1:5174/?map=bazaar-map&floors=pbr&lighting=golden&shot=compare&autostart=human`

## Map Approval Status
- `NOT APPROVED`

## How to Run (real commands only)
```bash
pnpm dev
pnpm typecheck
pnpm build
```

## Last Completed Prompt
- Prompt ID: `P26_player_name_bigger`
- What changed:
  - Increased top-right player-name typography in `/Users/dimitri/Desktop/clawd-strike/apps/client/src/runtime/ui/ScoreHud.ts` (`fontSize` `13px` → `18px`, `fontWeight` `700` → `800`, slight spacing tweak).
  - Captured deterministic compare screenshots:
    - `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P26_player_name_bigger/before.png`
    - `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P26_player_name_bigger/after.png`
- Quick test steps:
  - `pnpm dev`
  - Open `http://127.0.0.1:5174/?map=bazaar-map&floors=pbr&lighting=golden&shot=compare&autostart=human&name=Operator`
  - Verify `OPERATOR` appears larger above KILLS/HEADSHOTS in top-right panel.
  - Verify movement/collision still function (spawn, look, strafe) and no new console spam.

## Next 3 Tasks
1. Add max-width + ellipsis handling for long player names in top-right Score HUD.
2. Optionally expose a `nameSize` tuning hook or adaptive scale rule for ultra-wide names.
3. Run a human pointer-lock pass to verify readability during fast camera motion.

## Known Issues / Risks
- Playwright smoke can still raise `WrongDocumentError` on pointer-lock requests; automated runs are not definitive for lock/move validation.
