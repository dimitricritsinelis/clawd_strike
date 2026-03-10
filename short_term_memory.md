Audience: human, implementation-agent
Authority: status
Read when: map, visuals, ai, gameplay, ui, public-contract, perf, tooling, docs
Owns: repo-wide short-lived coordination state, active task claims, current blockers, recent completed outcomes
Do not use for: workflow policy, durable rationale, archive history, product truth already owned by specs/contracts
Schema version: stm-v2
Canonical playtest URL: http://127.0.0.1:4174/?map=bazaar-map
Map approval status: NOT APPROVED
Last compacted: 2026-03-10T00:53:53Z

# short_term_memory.md - Clawd Strike Status

## Active Snapshot
<!-- GENERATED START: active-snapshot -->
- STM-20260309-154233-codex | active | codex | ui-flow | Loading-screen champion b... | next: Wait for review or make a...
- STM-20260309-223704-codex | blocked | codex | docs | Lean AGENTS and mirror docs | next: Resolve the blocked build...
- STM-20260310-003248-codex | blocked | codex | map-visual | Restore Spawn B cleanup t... | next: Restore SHOT_11 and captu...
<!-- GENERATED END: active-snapshot -->

## Shared Ephemera
- none

## Task Cards

### STM-20260309-154233-codex | active | ui-flow | Loading-screen champion badge typography
Owner: codex
Branch: codex/champion-badge-font
Goal: Keep the loading-screen shared-champion badge typography update ready for review or typography-only follow-up.
Done when: Review lands or any requested typography-only adjustment is applied without moving badge placement or alignment.
Authority:
- apps/client/src/styles.css
Files:
- apps/client/src/styles.css
Context:
- Only loading-screen shared-champion badge typography changed.
- Placement and alignment stayed unchanged.
- Longer names ellipsize sooner because badge width stayed fixed.
Next:
- Wait for review or make a typography-only adjustment if requested.
Blockers:
- none
Recent Notes:
- 2026-03-09T15:42:33Z | claim | Claimed task.

### STM-20260309-223704-codex | blocked | docs | Lean AGENTS and mirror docs
Owner: codex
Branch: map-dev
Goal: Keep the STM-based policy surfaces lean by trimming AGENTS.md and removing duplicate authority prose from the mirror docs.
Done when: AGENTS.md stays under 6 KB, mirror docs stay lean, DEC-001 and DEC-002 stay durable, and the required validation gates pass.
Authority:
- AGENTS.md
- docs/decisions.md
Files:
- AGENTS.md
- README.md
- docs/decisions.md
Next:
- Resolve the blocked build gate or confirm it is unrelated to the docs rewrite.
Blockers:
- none
Recent Notes:
- 2026-03-09T22:37:09Z | blocker | Blocked on pnpm build hanging after Vite reports 96 modules transformed.
- 2026-03-09T22:37:09Z | progress | Trimmed AGENTS to 79 lines and 6141 bytes; cleaned README and CLAUDE; rewrote DEC-001 and DEC-002.
- 2026-03-09T22:37:04Z | claim | Claimed task.

### STM-20260310-003248-codex | blocked | map-visual | Restore Spawn B cleanup trim pass
Owner: codex
Branch: map-dev
Goal: Recreate the deleted Spawn B cleanup-shell trim retune on SPAWN_B_GATE_PLAZA north/east/west with exact depth and plinth scaling plus required shot review.
Done when: Spawn B cleanup trim logic and shot contract are restored, deterministic shot review passes, and pnpm typecheck / pnpm build / pnpm qa:completion pass.
Authority:
- docs/map-design/specs/map_spec.json
- docs/map-design/shots.json
- apps/client/src/runtime/map/wallDetailPlacer.ts
Files:
- docs/map-design/shots.json
- apps/client/src/runtime/map/wallDetailPlacer.ts
Next:
- Restore SHOT_11 and capture a before baseline, then reimplement the isolated trim pass.
Blockers:
- none
Recent Notes:
- 2026-03-10T00:44:50Z | blocker | Blocked only on pnpm build: root build still hangs after Vite reports 97 modules transformed, matching the preexisting STM-20260309-22370...
- 2026-03-10T00:44:42Z | progress | Restored docs/map-design/shots.json with SHOT_11_SPAWN_B_BACK_WALL, isolated Spawn B cleanup-shell trim scaling in wallDetailPlacer.ts fo...
- 2026-03-10T00:32:48Z | claim | Claimed task.

## Recent Completed Rollup
<!-- TOOL-MANAGED START: completed-rollup -->
- STM-20260310-003355-codex | tooling | Reset test strategy for fast iteration | 2026-03-10 | Added smoke:game/bot:smoke/qa:release/test:playwright:full, narrowed qa:completion to routes+shots, aligned AGENTS/README/decisions/CI, fixed the empty-caret Playwright flake, and validated the new ladder through final qa:release.
- STM-20260309-222607-codex | tooling | STM single-file memory rollout | 2026-03-09 | Added the STM CLI, safe-write validator/tests, CI gate, and legacy status-file migration.
<!-- TOOL-MANAGED END: completed-rollup -->
