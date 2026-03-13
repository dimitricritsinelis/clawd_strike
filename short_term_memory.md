Audience: human, implementation-agent
Authority: status
Read when: map, visuals, ai, gameplay, ui, public-contract, perf, tooling, docs
Owns: repo-wide short-lived coordination state, active task claims, current blockers, recent completed outcomes
Do not use for: workflow policy, durable rationale, archive history, product truth already owned by specs/contracts
Schema version: stm-v2
Canonical playtest URL: http://127.0.0.1:4174/?map=bazaar-map
Map approval status: NOT APPROVED
Last compacted: 2026-03-13T04:29:23Z

# short_term_memory.md - Clawd Strike Status

## Active Snapshot
<!-- GENERATED START: active-snapshot -->
- STM-20260309-154233-codex | active | codex | ui-flow | Loading-screen champion b... | next: Wait for review or make a...
- STM-20260309-223704-codex | blocked | codex | docs | Lean AGENTS and mirror docs | next: Resolve the blocked build...
- STM-20260312-020306-codex | handoff | codex | perf | Scalable runtime perf pass | next: Claim the card and implem...
- STM-20260312-151925-codex | active | codex | ui-flow | Buff vignette redesign | next: Await review or alpha/fal...
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

### STM-20260312-151925-codex | active | ui-flow | Buff vignette redesign
Owner: codex
Branch: main
Goal: Rebuild the buff overlay around the hit-vignette silhouette with buff-color tint, clean-center edge weighting, and simple pulse/flash timing.
Done when: Buff vignettes reuse the shared edge-vignette shape, latest active buff owns the color, red hit feedback stays on top, and typecheck/server/smoke validation pass.
Authority:
- apps/client/src/runtime/ui/BuffVignette.ts
- apps/client/src/runtime/buffs/BuffTypes.ts
- apps/client/src/runtime/bootstrap.ts
Files:
- apps/client/src/runtime/ui/BuffVignette.ts
Next:
- Await review or alpha/falloff-only tuning in a real headed Chrome pass.
Blockers:
- none
Recent Notes:
- 2026-03-12T17:11:00Z | progress | Raised sustained buff floor/pulse highs, revalidated typecheck plus smoke, verified 5s and 9.2s runtime samples.
- 2026-03-12T16:56:01Z | progress | Tuned buff vignette inward reach with stronger base/pulse/flash, revalidated typecheck plus smoke gates.
- 2026-03-12T16:25:24Z | progress | Replaced decorative buff wash with shared edge-vignette layers, passed typecheck plus smoke gates.

## Recent Completed Rollup
<!-- TOOL-MANAGED START: completed-rollup -->
- STM-20260313-041415-codex | map-geometry | Spawn B courtyard registry pass | 2026-03-13 | Spawn B now uses module-driven composition overrides with one standard window family, one standard door family, a rebuilt centered hero bay, regenerated runtime map/shot data, and passing typecheck/test:server/smoke:game/qa:completion plus manual screenshot capture.
- STM-20260312-034350-codex | ui-flow | Buff vignette reliability fix | 2026-03-12 | Replaced the fragile buff vignette compositor with an inline-SVG alpha overlay, verified visible buff/hit states in a real Chrome human runtime on localhost, and passed typecheck plus smoke validation.
- STM-20260312-033605-codex | map-geometry | Tighten door surround reveal | 2026-03-12 | Root cause was the castle-door surround intentionally centering the model inside a 3.5–6 cm reveal; cover-envelope math now stays wide for masking while the visible surround reveal is tightened to 0.8–1.8 cm, with regeneration and validation passing.
- STM-20260312-032013-codex | ui-flow | Buff charged-vessel screen effect | 2026-03-12 | Implemented a masked charged-vessel buff overlay with dominant-color refresh behavior, localhost QA hooks, captured visual screenshots, and passing typecheck plus smoke validation.
- STM-20260312-031419-codex | map-geometry | Seal door wall bleed | 2026-03-12 | Shared door cover-envelope math now seals all 3D door variants, Spawn B shot authority includes an explicit no-bleed check, maps were regenerated, and typecheck/server/smoke/completion validation passed.
<!-- TOOL-MANAGED END: completed-rollup -->
