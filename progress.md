# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- `docs/map-design` remains the source-of-truth input (spec + refs) and is only used by `gen:maps` to emit runtime copies under `apps/client/public/maps/bazaar-map/`.
- Large legacy artifact + texture payload cleanup moved historical handoff/docs/screenshots data into `archive/`, and generated `AUDIT_LEDGER.md`.
- Latest status is a cleanup commit on branch `codex/code-audit` with runtime/code updates plus large-asset dedupe.
- Validation not rerun in this push-only turn.
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
- Prompt ID: `P123_push_and_commit_cleanup`
- What changed:
  - Committed and pushed `377d3f5` on branch `codex/code-audit` (remote push completed), covering:
    - runtime/material/layout control changes in `apps/client/src/runtime/*`
    - blockout tuning and map shot updates under `apps/client/public/maps/bazaar-map`
    - archiving/cleanup of legacy design handoff payloads to `archive/*`
    - removal of unused heavy texture/model packs and redundant screenshot/temp capture files
    - added `AUDIT_LEDGER.md`.
- Validation:
  - Not rerun this turn (push-only request).
- Quick test steps:
  - `pnpm dev` then open: `http://127.0.0.1:5174/?map=bazaar-map&shot=compare&autostart=human`

## Next 3 Tasks
1. Re-run runtime validation (`pnpm typecheck`, `pnpm build`) after the asset cleanup.
2. Verify all missing references due archive moves are not required at runtime.
3. Run the pointer-lock traversal smoke with map-approval check + compare shot on a clean working tree.

## Known Issues / Risks
- `gen:maps` still emits known clear-zone anchor warnings for designated landmark/open-node anchors.
- Cleanup removed many historical artifacts; downstream scripts should ignore `archive/` paths explicitly.
