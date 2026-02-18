# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Added CS-style ammo HUD overlay with tabular `mag / reserve`, low-ammo color states, and reload progress bar.
- Added single-weapon AK ammo/reload wrapper (`30/90`, `R` reload, auto-reload at empty, firing blocked during reload).
- `Game` now routes fire/reload through `Ak47Weapon` and exposes ammo snapshot for UI updates.
- `Ak47FireController.update(...)` now supports per-frame `shotBudget` for ammo-safe burst limits.
- `bootstrap` now instantiates/updates/disposes ammo HUD without changing crosshair behavior.
- Determinism preserved for map/props systems.
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
- Prompt ID: `P13_ammo_hud`
- Summary:
  - Implemented ammo HUD + AK ammo/reload state wrapper and wired it through runtime/game loop.
  - Added shot-budget enforcement in fire controller so weapon cannot fire beyond available mag ammo.
  - Captured deterministic compare-shot screenshots at:
    - `/Users/dimitri/Desktop/ClawdStrike_v2/artifacts/screenshots/P13_ammo_hud/before.png`
    - `/Users/dimitri/Desktop/ClawdStrike_v2/artifacts/screenshots/P13_ammo_hud/after.png`
- Files touched:
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/ui/AmmoHud.ts`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/weapons/Ak47Weapon.ts`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/weapons/Ak47FireController.ts`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/game/Game.ts`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/bootstrap.ts`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/progress.md`
- How to test (60s):
  - Run `pnpm dev`.
  - Compare shot: `http://127.0.0.1:5174/?map=bazaar-map&shot=compare`
  - Gameplay check: `http://127.0.0.1:5174/?map=bazaar-map&autostart=human`
  - Lock pointer, hold fire, and verify ammo decrements; press `R` to reload early.
  - Confirm auto-reload triggers at `mag=0`, and crosshair remains unchanged/fixed.

## Next 3 Tasks
1. Add optional dry-fire click event/audio when `mag=0 && reserve=0`.
2. Expose ammo (`mag`, `reserve`, `reloading`) in `render_game_to_text` for automated runtime assertions.
3. Add lightweight reload SFX timing hook (start/end) without introducing full animation scope.

## Known Issues / Risks
- Playwright pointer-lock automation still throws `WrongDocumentError` in this environment; full fire/reload verification needs an interactive browser session.
- Compare-shot screenshots are deterministic but do not exercise live firing/reload behavior.
- Existing map generator warnings for `LMK_HERO_ARCH_01` and `LMK_MID_WELL_01` remain intentional.
