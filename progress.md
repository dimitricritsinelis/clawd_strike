Audience: human, implementation-agent
Authority: status
Read when: map, visuals, ai, gameplay, ui, public-contract, perf, tooling, docs
Owns: current branch state, active change tag, canonical run commands, next tasks, known risks
Do not use for: workflow policy, durable rationale, public contract details, archive history
Last updated: 2026-03-08

# progress.md — Clawd Strike Status

Original prompt: notice how the name text isnt perfectly centered on the rectangle its in, also the number should be right aligned and shouldnt show decimals

## Active Change Tag
- `ui-flow`

## Current Status (<=10 lines)
- Tightened the loading-screen world champion name box so max-length names sit visually centered in the left plaque panel instead of drifting left.
- Added a loading-screen-local integer score formatter, so the plaque shows whole numbers only and no longer renders half-point decimals.
- Right-aligned the loading-screen score inside the small score panel and tuned the box width/padding so `9999` fits without clipping.
- Loading-screen Playwright expectations now use the plaque-specific rounded score display while HUD/death-screen champion formatting remains unchanged.
- `pnpm typecheck`, `pnpm build`, and `pnpm test:playwright` all passed on `2026-03-08`.
- Live desktop/mobile captures verified the max-length name case and a `9999` score preview on the loading screen.

## Canonical Playtest URL
- `http://127.0.0.1:5174/?map=bazaar-map&autostart=human`

## Map Approval Status
- `NOT APPROVED`

## How to Run (real commands only)
```bash
pnpm dev
pnpm typecheck
pnpm build
pnpm test:playwright
```

## Last Completed Prompt
- Title: Tighten loading-screen champion name centering and right-align the score
- Changed: narrowed and recentered the plaque name field for max-length names, switched the loading-screen plaque to whole-number score display only, and right-aligned the score so four digits fit cleanly in the score panel.
- Files: `apps/client/src/loading-screen/ui.ts`, `apps/client/src/styles.css`, `apps/client/playwright/shared-champion.spec.ts`
- Validation: `pnpm typecheck`, `pnpm build`, `pnpm test:playwright`, plus live desktop/mobile visual captures and a web-game-client screenshot pass on the loading screen.

## Next 3 Tasks
1. If the plaque still feels slightly off on non-Latin or unusually narrow/wide names, tune the name field with a small responsive tracking ladder rather than widening it again.
2. If the loading-screen plaque should mirror production score semantics more explicitly, decide whether rounding or truncation is the intended whole-number rule and document it in code.
3. If the champion surface gets more polish work, re-check hierarchy against the main logo before increasing text weight or glow again.

## Known Issues / Risks
- The loading-screen plaque now intentionally rounds champion scores to whole numbers locally, which differs from the half-point precision still shown on HUD/death surfaces.
- Existing unrelated worktree changes remain in place and were not modified by this UI task.
