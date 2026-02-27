# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- `docs/map-design` remains the source-of-truth input (spec + refs) and is only used by `gen:maps` to emit runtime copies under `apps/client/public/maps/bazaar-map/`.
- No evidence the design packet is slowing iteration (folder is ~7MB, mostly refs, and not shipped in the client build output).
- Validation passed: `pnpm typecheck` and `pnpm build`.
- Latest compare-shot screenshot pair captured under `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P122_map_design_folder_review/`.

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
- Prompt ID: `P122_map_design_folder_review`
- What changed:
  - Reviewed whether `docs/map-design/` is still needed; confirmed it is part of the current runtime generation pipeline (design spec -> `gen:maps` -> runtime copies).
  - Updated `/Users/dimitri/Desktop/clawd-strike/progress.md` with the decision and notes.
- Validation:
  - `pnpm typecheck`
  - `pnpm build`
- Screenshots:
  - `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P122_map_design_folder_review/before.png`
  - `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P122_map_design_folder_review/after.png`
- Quick test steps:
  - `pnpm dev` then open: `http://127.0.0.1:5174/?map=bazaar-map&shot=compare&autostart=human`

## Next 3 Tasks
1. Define and apply a retention policy for `artifacts/screenshots/` (e.g., keep last N prompt folders, archive older folders outside repo).
2. Run a human traversal pass for map-approval evidence (pointer lock, full-route collision/snag notes, no out-of-bounds escape).
3. Continue blockout readability tuning (landmark/blocker color rhythm and deterministic prop density) toward map approval criteria.

## Known Issues / Risks
- `gen:maps` still emits known clear-zone anchor warnings for designated landmark/open-node anchors.
- Automated browser smoke may miss pointer-lock behavior; final pointer-lock sign-off should remain interactive.
