Audience: human, implementation-agent
Authority: status
Read when: map, visuals, ai, gameplay, ui, public-contract, perf, tooling, docs
Owns: current branch state, active change tag, canonical run commands, next tasks, known risks
Do not use for: workflow policy, durable rationale, public contract details, archive history
Last updated: 2026-03-08

# progress.md — Clawd Strike Status

Original prompt: lets implement the following fixes: Increase to 10 bots per round, bots can’t stand on top of each other, and health needs to reset between each round.

## Active Change Tag
- `bot-ai`

## Current Status (<=10 lines)
- Raised the runtime wave roster from 9 to 10 via a shared enemy-count constant and updated score/wave bookkeeping to match 10-kill waves.
- Added a tenth authored fallback spawn at west-hall north (`x=4.75`, `z=60`) and extended the role template to keep the extra bot as baseline rifler pressure.
- Fixed bot ghosting in two layers: spawn selection/finalization now rejects overlapping footprints, and a deterministic post-movement depenetration pass keeps live bots from occupying the same space.
- Restored player health to `100` on each new wave spawn; the wave-ammo-reset smoke now proves both ammo and health refill between rounds.
- Updated `/skills.md` retry semantics to document full-health and full-ammo wave resets, and kept localhost/preview shared-champion calls offline so browser tests stay console-clean.
- Aligned shared-champion ruleset metadata to 10-kill waves and bumped the ruleset version string to avoid mixing old and new score semantics.
- Validation on 2026-03-08: `pnpm typecheck`, `pnpm build`, `pnpm --filter @clawd-strike/client exec playwright test playwright/death-restart.spec.ts playwright/public-agent-contract.spec.ts`, `BASE_URL=http://127.0.0.1:4174 pnpm --filter @clawd-strike/client smoke:wave-ammo-reset`, `BASE_URL=http://127.0.0.1:4174 pnpm --filter @clawd-strike/client bot:smoke`, `BASE_URL=http://127.0.0.1:4174 pnpm verify:skills-contract`, `BASE_URL=http://127.0.0.1:4174 pnpm smoke:no-context`.

## Canonical Playtest URL
- `http://127.0.0.1:4174/?map=bazaar-map`

## Map Approval Status
- `NOT APPROVED`

## How to Run (real commands only)
```bash
pnpm typecheck
pnpm build
pnpm --filter @clawd-strike/client exec vite preview --host --port 4174
BASE_URL=http://127.0.0.1:4174 pnpm --filter @clawd-strike/client exec playwright test playwright/death-restart.spec.ts playwright/public-agent-contract.spec.ts
BASE_URL=http://127.0.0.1:4174 pnpm --filter @clawd-strike/client smoke:wave-ammo-reset
BASE_URL=http://127.0.0.1:4174 pnpm --filter @clawd-strike/client bot:smoke
BASE_URL=http://127.0.0.1:4174 pnpm verify:skills-contract
BASE_URL=http://127.0.0.1:4174 pnpm smoke:no-context
```

## Last Completed Prompt
- Title: Raise bot waves to 10, remove bot overlap, and reset health each round
- Changed: enemy wave sizing/spawn separation/live depenetration, wave health reset, score-wave bookkeeping, localhost shared-champion gating, and public `/skills.md` retry semantics.
- Files: `apps/client/src/runtime/enemies/EnemyManager.ts`, `apps/client/src/runtime/enemies/EnemyController.ts`, `apps/client/src/runtime/game/Game.ts`, `apps/client/src/runtime/bootstrap.ts`, `apps/client/src/runtime/ui/ScoreHud.ts`, `apps/client/src/shared/sharedChampionClient.ts`, `apps/shared/highScore.ts`, `apps/client/public/skills.md`, `apps/client/playwright/death-restart.spec.ts`, `apps/client/playwright/public-agent-contract.spec.ts`, `apps/client/playwright/shared-champion.spec.ts`, `apps/client/scripts/wave-ammo-reset-smoke.mjs`, `apps/client/scripts/bot-intelligence-smoke.mjs`
- Validation: see the Current Status validation line above.

## Next 3 Tasks
1. Run a short human combat pass on `http://127.0.0.1:4174/?map=bazaar-map` to verify hall pressure and round-to-round health refill subjectively, since only automated coverage was run this turn.
2. If shared-champion production verification matters immediately, run the shared-champion Playwright suite against an API-enabled environment to confirm the bumped ruleset version behaves as expected end-to-end.
3. Consider centralizing the preview/test base URL so the smoke scripts and preview port stop diverging between `4174` and `5174`.

## Known Issues / Risks
- The required human combat pass from the repo completion standard was not performed in this turn; only automated browser/runtime validation was completed.
- Shared-champion network calls are intentionally disabled on localhost/preview to avoid console-noise from missing local API routes; canonical deployments still use the network path.
