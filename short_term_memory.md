Audience: human, implementation-agent
Authority: status
Read when: map, visuals, ai, gameplay, ui, public-contract, perf, tooling, docs
Owns: repo-wide short-lived coordination state, active task claims, current blockers, recent completed outcomes
Do not use for: workflow policy, durable rationale, archive history, product truth already owned by specs/contracts
Schema version: stm-v2
Canonical playtest URL: http://127.0.0.1:4174/?map=bazaar-map
Map approval status: NOT APPROVED
Last compacted: 2026-03-12T01:15:53Z

# short_term_memory.md - Clawd Strike Status

## Active Snapshot
<!-- GENERATED START: active-snapshot -->
- STM-20260309-154233-codex | active | codex | ui-flow | Loading-screen champion b... | next: Wait for review or make a...
- STM-20260309-223704-codex | blocked | codex | docs | Lean AGENTS and mirror docs | next: Resolve the blocked build...
- STM-20260312-020306-codex | handoff | codex | perf | Scalable runtime perf pass | next: Claim the card and implem...
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

### STM-20260312-020306-codex | handoff | perf | Scalable runtime perf pass
Owner: codex
Branch: main
Goal: Replace per-orb scene graphs with scalable pooled orb rendering and cut baseline render cost.
Done when: Orb perf scales with count, runtime exposes orb perf counters, and perf smoke covers 0/1/5/10/20 orb cases.
Authority:
- AGENTS.md
- apps/client/src/runtime/buffs/BuffManager.ts
- apps/client/src/runtime/game/Game.ts
Files:
- AGENTS.md
Next:
- Claim the card and implement the orb renderer plus perf smoke.
Blockers:
- none
Recent Notes:
- 2026-03-12T02:55:59Z | progress | Recovered orb color and motion using per-buff pooled layers with bob, breathe, and pulse animation while keeping orb-side perf budgets wi...
- 2026-03-12T02:20:52Z | handoff | Orb scaling now stays within budget locally, but the zero-orb baseline remains above target and needs a follow-up non-orb perf pass.
- 2026-03-12T02:20:52Z | progress | Implemented the pooled orb renderer, added orb perf telemetry/debug hooks, and added an orb-scaling perf smoke with paired controls.

## Recent Completed Rollup
<!-- TOOL-MANAGED START: completed-rollup -->
- STM-20260312-011359-codex | map-visual | Retune Spawn B balcony hero window midpoint | 2026-03-12 | Moved the Spawn B hero window to midpoint values between the original and prior lowered pass, regenerated the map outputs, passed qa:completion, and manually verified the updated facade from a fixed Spawn B debug camera.
- STM-20260312-005430-codex | map-visual | Retune Spawn B balcony hero window | 2026-03-12 | Retuned the Spawn B north-wall balcony hero window to be deck-flush and lower against the roofline, regenerated derived map artifacts, passed qa:completion, and manually verified the updated facade in a debug-positioned browser capture.
- STM-20260312-003607-codex | map-visual | Restore balcony arch cap | 2026-03-12 | Set the Spawn B balcony hero stone and glass arch starts to 8.2m, raised the opening and surround heights to restore visible arch cap, sharpened the hero curve, and qa:completion passed.
- STM-20260312-003035-codex | map-visual | Set balcony arch start to 8m | 2026-03-12 | Set the Spawn B balcony hero stone and glass arch starts to 8.0m by updating the hero spring-line values; pnpm qa:completion passed.
- STM-20260312-002235-codex | map-visual | Align arch to parapet top | 2026-03-12 | Aligned the Spawn B balcony hero window arch start to the top of the visible parapet trim above the roofline; pnpm qa:completion passed.
<!-- TOOL-MANAGED END: completed-rollup -->
