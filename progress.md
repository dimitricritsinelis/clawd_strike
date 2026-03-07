Audience: human, implementation-agent
Authority: status
Read when: map, visuals, ai, gameplay, ui, public-contract, perf, tooling, docs
Owns: current branch state, active change tag, canonical run commands, next tasks, known risks
Do not use for: workflow policy, durable rationale, public contract details, archive history
Last updated: 2026-03-07

# progress.md — Clawd Strike Status

## Active Change Tag
- `tooling`

## Current Status (<=10 lines)
- Local `main` includes mixed in-flight runtime, bot, map-spec, UI, and shared-champion server changes and is being prepared for a release sync to `origin/main`.
- `pnpm typecheck` passes.
- `pnpm build` passes; `prebuild` regenerates map runtime files and still emits the expected clear-zone anchor warnings.
- `pnpm verify:skills-contract` passes against the local build output.
- `pnpm smoke:no-context` passes with output in `artifacts/playwright/no-context-agent-smoke/2026-03-07T17-19-15-866Z`.
- `pnpm --filter @clawd-strike/client gen:maps` updated the generated runtime map spec to reflect the current design-spec drift (`maxProtrusion` now 0.2 in runtime output).
- The last completed `bot:smoke` pass remains `artifacts/playwright/completion-gate/bot-intelligence/2026-03-07T17-13-46-837Z`; a fresh rerun emitted new captures under `2026-03-07T17-20-42-143Z` but did not finish cleanly.

## Canonical Playtest URL
- `http://127.0.0.1:5174/?map=bazaar-map&autostart=human`

## Map Approval Status
- `NOT APPROVED`

## How to Run (real commands only)
```bash
pnpm dev
pnpm --filter @clawd-strike/client gen:maps
pnpm typecheck
pnpm build
pnpm verify:skills-contract
pnpm smoke:no-context
pnpm --filter @clawd-strike/client bot:smoke
BASE_URL=http://127.0.0.1:5174 pnpm --filter @clawd-strike/client capture:shots
BASE_URL=http://127.0.0.1:5174 pnpm qa:autonomous
```

## Last Completed Prompt
- Title: Commit, sync `main`, and redeploy the current release candidate
- Changed: validated the mixed worktree for release, recorded the generated map-runtime drift from the current design spec, and prepared the repo for a push plus Vercel production redeploy.
- Files: `progress.md`, generated map runtime output, and the existing mixed feature work already present in the tree.
- Validation: `pnpm typecheck`, `pnpm build`, `pnpm verify:skills-contract`, `pnpm smoke:no-context`, `pnpm --filter @clawd-strike/client gen:maps`; `bot:smoke` rerun emitted captures but did not complete cleanly.

## Next 3 Tasks
1. Investigate why the fresh `pnpm --filter @clawd-strike/client bot:smoke` run stalls after generating captures under `artifacts/playwright/completion-gate/bot-intelligence/2026-03-07T17-20-42-143Z`.
2. Do a real pointer-lock human pass on the deployed build because the current validation set is still mostly headless.
3. Confirm production shared-champion run start/finish behavior end-to-end against the live Vercel deployment.

## Known Issues / Risks
- This release bundles several unrelated in-flight changes together because the existing worktree was already mixed when the sync/deploy task started.
- The fresh `bot:smoke` rerun appears to stall after writing artifacts; only the earlier completed run has a full pass summary.
- Manual verification here was headless/browser-driven; a true human pointer-lock playtest is still the best final feel check.
- `gen:maps` warnings for authored clear-zone anchors remain expected.
