Audience: human, implementation-agent
Authority: status
Read when: map, visuals, ai, gameplay, ui, public-contract, perf, tooling, docs
Owns: repo-wide short-lived coordination state, active task claims, current blockers, recent completed outcomes
Do not use for: workflow policy, durable rationale, archive history, product truth already owned by specs/contracts
Schema version: stm-v2
Canonical playtest URL: http://127.0.0.1:4174/?map=bazaar-map
Map approval status: NOT APPROVED
Last compacted: 2026-03-10T20:11:45Z

# short_term_memory.md - Clawd Strike Status

## Active Snapshot
<!-- GENERATED START: active-snapshot -->
- STM-20260309-154233-codex | active | codex | ui-flow | Loading-screen champion b... | next: Wait for review or make a...
- STM-20260309-223704-codex | blocked | codex | docs | Lean AGENTS and mirror docs | next: Resolve the blocked build...
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

## Recent Completed Rollup
<!-- TOOL-MANAGED START: completed-rollup -->
- STM-20260310-201014-codex | map-visual | Spawn B stained glass visibility fix | 2026-03-10 | Made the authored Spawn B stained-glass windows visibly render by separating void and glass meshes, moving the layered panels in front of the wall face, simplifying the material, and validating in runtime captures plus qa:completion.
- STM-20260310-184018-codex | map-visual | Spawn B stained glass window pass | 2026-03-10 | Implemented window-only authored Spawn B courtyard layouts with pointed-arch stained glass, downloaded the approved 3DTextures asset set, regenerated map artifacts, and passed local typecheck plus qa:completion.
- STM-20260310-051346-codex | map-visual | Spawn B bazaar window hero pass | 2026-03-10 | Reverted the assistant-introduced Spawn B preset/material/shot changes, regenerated runtime artifacts, and left the pre-existing branch door/detail edits intact.
- STM-20260310-003355-codex | tooling | Reset test strategy for fast iteration | 2026-03-10 | Added smoke:game/bot:smoke/qa:release/test:playwright:full, narrowed qa:completion to routes+shots, aligned AGENTS/README/decisions/CI, fixed the empty-caret Playwright flake, and validated the new ladder through final qa:release.
- STM-20260310-003248-codex | map-visual | Restore Spawn B cleanup trim pass | 2026-03-10 | Restored shared plinth/cornice-aware window placement without undoing PR16 Spawn B visuals, fixed docs/map-design shotCount metadata, regenerated map artifacts, and passed pnpm typecheck plus pnpm qa:completion on http://127.0.0.1:5174/.
<!-- TOOL-MANAGED END: completed-rollup -->
