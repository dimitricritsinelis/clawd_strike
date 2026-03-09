Audience: human, implementation-agent
Authority: status
Read when: map, visuals, ai, gameplay, ui, public-contract, perf, tooling, docs
Owns: current branch state, active change tag, canonical run commands, next tasks, known risks
Do not use for: workflow policy, durable rationale, public contract details, archive history
Last updated: 2026-03-09

# progress.md — Clawd Strike Status

Original prompt: PLEASE IMPLEMENT THIS PLAN: Reject Malformed Legacy Run Tokens

## Active Change Tag
- `combat-gameplay`

## Current Status (<=10 lines)
- Hardened `POST /api/run/finish` so malformed legacy `shared_champion_run_tokens.player_name` rows are rejected deterministically instead of falling into the generic `500` catch path.
- The finish handler now normalizes stored token names before validation/finalization; names that sanitize cleanly continue through the accepted path with canonicalized audit payloads.
- Added server regression coverage for both branches: malformed legacy names now return `422` with `reason: "invalid-run-token-player-name"`, and whitespace-drift legacy names still finalize successfully after normalization.
- Validation on 2026-03-09: `pnpm test:server`, `pnpm typecheck`, `pnpm build`, `pnpm --filter @clawd-strike/client exec playwright test playwright/shared-champion.spec.ts --grep "validated run submissions keep strict overwrite rules"`.
- Additional runtime smoke on 2026-03-09: `develop-web-game` Playwright client against `http://127.0.0.1:4174/?map=bazaar-map`; screenshot rendered the loading screen correctly and `state-0.json` showed no boot failure.

## Canonical Playtest URL
- `http://127.0.0.1:4174/?map=bazaar-map`

## Map Approval Status
- `NOT APPROVED`

## How to Run (real commands only)
```bash
pnpm test:server
pnpm typecheck
pnpm build
pnpm --filter @clawd-strike/client exec playwright test playwright/shared-champion.spec.ts --grep "validated run submissions keep strict overwrite rules"
```

## Last Completed Prompt
- Title: Reject malformed legacy run-token names without returning 500
- Changed: normalized consumed token names in `handleSharedChampionRunFinishRequest`, rejected invalid stored token names with `422 invalid-run-token-player-name`, and added request-level server regressions for reject/normalize paths.
- Files: `server/highScoreRunApi.ts`, `server/highScoreStoreImpl.test.ts`, `progress.md`
- Validation: see the Current Status validation lines above.

## Next 3 Tasks
1. Run `pnpm reconcile:shared-champion -- --env-file .env.production.local --json` against production and confirm `invalidRunTokenNames` is `0` so no legacy malformed token rows remain live.
2. If production still contains invalid token rows, repair or expire those rows before validating the name constraints, then rerun the reconcile and constraint commands.
3. Consider adding a production-only operator check or alert for non-zero `invalidRunTokenNames` so this class of legacy data issue is caught before it reaches player traffic.

## Known Issues / Risks
- This patch hardens request handling only; it does not clean malformed historical DB rows automatically.
- The repo still has unrelated uncommitted tooling/docs changes from the prior Vercel-domain task; they were left untouched by this gameplay fix.
