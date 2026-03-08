Audience: human, implementation-agent
Authority: status
Read when: map, visuals, ai, gameplay, ui, public-contract, perf, tooling, docs
Owns: current branch state, active change tag, canonical run commands, next tasks, known risks
Do not use for: workflow policy, durable rationale, public contract details, archive history
Last updated: 2026-03-08

# progress.md — Clawd Strike Status

Original prompt: i want you to trace down this error, fix it, and lets figure out how to make sure it doesnt break again, it feels breaking everytime i redeploy to vercel

## Active Change Tag
- `tooling`

## Current Status (<=10 lines)
- Traced the production high-score outage to legacy Postgres columns (`score_half_points`) that the current shared-champion runtime no longer migrated before querying `score`.
- Reproduced the failure locally against pulled production envs: reconcile first failed with `column "score" does not exist`, then with legacy rollup-view dependencies on `score_half_points`.
- Patched shared-champion schema maintenance to drop/recreate rollup views, migrate legacy half-point columns into integer `score`, and remove the obsolete columns safely.
- Fixed the `pnpm reconcile:shared-champion` operator script so it no longer references deleted `*HalfPoints` fields.
- Ran the repaired reconcile against the production database; the live endpoint now returns `200` and the champion payload (`big bossy`, score `573`).
- Validation: `pnpm test:server`, `pnpm typecheck`, `pnpm build`, plus a live production `GET /api/high-score` verification on `2026-03-08`.

## Canonical Playtest URL
- `http://127.0.0.1:4174/?map=bazaar-map`

## Map Approval Status
- `NOT APPROVED`

## How to Run (real commands only)
```bash
pnpm typecheck
pnpm build
pnpm test:server
pnpm test:playwright
pnpm reconcile:shared-champion -- --help
pnpm --filter @clawd-strike/client exec vite preview --host --port 4174
```

## Last Completed Prompt
- Title: Restore the Vercel high-score path and harden it against legacy schema drift
- Changed: traced the production outage to unmigrated half-point score columns, patched runtime schema maintenance and the reconcile tool, and repaired the live production database.
- Files: `server/highScoreStoreImpl.ts`, `server/highScoreStoreImpl.test.ts`, `scripts/reconcile-shared-champion.ts`, `progress.md`
- Validation: pulled production envs, reproduced the DB failure locally, ran `pnpm test:server`, `pnpm typecheck`, `pnpm build`, executed `pnpm reconcile:shared-champion -- --env-file .env.production.local --json`, and verified `https://clawd-strike.vercel.app/api/high-score`.

## Next 3 Tasks
1. Push the schema-migration fix so future Vercel redeploys carry the self-healing path in code, not only in the repaired database.
2. Optionally add a deployment smoke that hits `/api/high-score` right after prod deploy and fails loudly on any non-`200` response.
3. If score-history semantics matter, decide whether legacy half-point rows should stay rounded integers permanently or get a one-time historical note in internal ops docs.

## Known Issues / Risks
- The live repair rounded legacy half-point values to integer `score` during migration (`1145 -> 573`), which matches the current integer-only contract but slightly changes historical display precision.
- The admin-stats endpoint itself was not fully exercised in this turn because the ad hoc shell header interpolation failed; the public high-score path and DB schema were verified directly.
