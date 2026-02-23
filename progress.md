# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- Enemy visuals use `/assets/models/characters/enemy_raider/model.glb`; first-person gun remains `/assets/models/weapons/ak47/ak47.glb`.
- Enemy aim alignment updated: model now applies a facing fixup yaw so visual orientation matches controller aim direction.
- Enemy muzzle flash anchor now resolves from model geometry (gun-tip approximation) instead of a fixed hardcoded body offset.
- Shared-template performance optimization remains in place (single load + per-enemy clone).
- Canonical compare screenshots for this prompt captured at `artifacts/screenshots/P50_enemy_muzzle_alignment/`.
- Validation: ✅ `pnpm typecheck` and ✅ `pnpm build`.
- Smoke run in headed mode reached runtime; automated pointer-lock still throws `WrongDocumentError` in harness context (known issue).

## Canonical Playtest URL
- `http://localhost:5174/`

## Map Approval Status
- `NOT APPROVED`

## How to Run (real commands only)
```bash
pnpm dev
pnpm typecheck
pnpm build
```

## Last Completed Prompt
- Prompt ID: `P50_enemy_muzzle_alignment`
- What changed:
- `/Users/dimitri/Desktop/clawd-strike/apps/client/src/runtime/enemies/EnemyVisual.ts`
- `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P50_enemy_muzzle_alignment/before.png`
- `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P50_enemy_muzzle_alignment/after.png`
- Quick test steps:
- `pnpm typecheck`
- `pnpm build`
- `pnpm dev`
- Open `http://localhost:5174/`, select `HUMAN`, and verify enemies face the player while firing.
- Confirm enemy muzzle flash emits from AK tip area during enemy shots.
- Open `http://localhost:5174/?shot=compare` for deterministic compare capture.

## Next 3 Tasks
1. Fine-tune muzzle tip resolver by adding optional named-node hints if future enemy rigs include muzzle/weapon bones.
2. Add lightweight runtime toggle to visualize enemy muzzle anchor for one-shot alignment checks.
3. Re-run manual in-browser traversal/combat pass and verify enemy look-at + muzzle FX behavior across all spawn lanes.

## Known Issues / Risks
- Runtime generator still warns that some landmark/open-node anchors lie inside clear-travel zones.
- Automated Playwright pointer-lock smoke can still throw `WrongDocumentError`; this is a harness limitation when loading-screen→runtime handoff occurs.
- If future enemy models are authored with different forward axes, `MODEL_FACING_FIXUP_YAW_RAD` and muzzle-axis assumptions will need per-model tuning.
