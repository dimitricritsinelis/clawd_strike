# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- Runtime layout-focused handoff bundle created at `artifacts/agent-handoff/bazaar_map_layout_handoff_P45.zip`.
- Bundle is geometry-first: zones, walkable adjacency, wall segments, wall/cage colliders, runtime-vs-design diff, and blockout wall-generation code reference.
- Prop-orchestration templates were intentionally removed from the new handoff focus.
- Canonical compare view metadata included for deterministic planning context (`shots/compare_shot.json`).
- Latest compare screenshot included in handoff bundle for visual grounding (`refs/latest_runtime_compare_view.png`).
- Validation: ✅ `pnpm typecheck` and ✅ `pnpm build`.
- Build warnings remain about landmark/open-node anchors located inside clear travel zones (expected but should stay explicit).
- Bazaar packs are local/fetch-style assets and remain untracked.

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
- Prompt ID: `P45_map_layout_handoff`
- What changed:
- `/Users/dimitri/Desktop/clawd-strike/artifacts/agent-handoff/P45_map_layout_handoff/README.md`
- `/Users/dimitri/Desktop/clawd-strike/artifacts/agent-handoff/P45_map_layout_handoff/derived/wall_segments.csv`
- `/Users/dimitri/Desktop/clawd-strike/artifacts/agent-handoff/P45_map_layout_handoff/derived/wall_colliders.csv`
- `/Users/dimitri/Desktop/clawd-strike/artifacts/agent-handoff/P45_map_layout_handoff/derived/walkable_zone_adjacency.csv`
- `/Users/dimitri/Desktop/clawd-strike/artifacts/agent-handoff/P45_map_layout_handoff/templates/layout_agent_prompt.md`
- `/Users/dimitri/Desktop/clawd-strike/artifacts/agent-handoff/bazaar_map_layout_handoff_P45.zip`
- `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P45_map_layout_handoff/before.png`
- `/Users/dimitri/Desktop/clawd-strike/artifacts/screenshots/P45_map_layout_handoff/after.png`
- Quick test steps:
- `pnpm typecheck`
- `pnpm build`
- Unzip handoff package and provide `templates/layout_agent_prompt.md` + `derived/wall_segments.csv` + `derived/zones_walkable.csv` to the external map-layout agent.

## Next 3 Tasks
1. Receive `layout_change_plan.md` + `wall_change_list.csv` from external agent based on the P45 handoff pack.
2. Validate proposed wall edits against `min_path_width_*` constraints and spawn-to-spawn connectivity.
3. Apply approved geometry edits in runtime spec and regenerate compare screenshots.

## Known Issues / Risks
- Automated movement smoke in Playwright still reports `WrongDocumentError` during pointer-lock request after loading→runtime transition.
- Runtime generator warns that some landmark/open-node anchors are inside clear-travel zones; gameplay-intent valid, but external planners may misread as conflicts without guidance.
- Canopy visuals are conservative (small spans skipped) until better dedicated drape models are integrated.
- Compare-shot mode freezes input by design; traversal checks require non-shot URLs.
