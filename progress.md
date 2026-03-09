Audience: human, implementation-agent
Authority: status
Read when: map, visuals, ai, gameplay, ui, public-contract, perf, tooling, docs
Owns: current branch state, active change tag, canonical run commands, next tasks, known risks
Do not use for: workflow policy, durable rationale, public contract details, archive history
Last updated: 2026-03-09

# progress.md — Clawd Strike Status

Original prompt: the vercel deployed version of this game is still reading record offline. this needs to be fixed, i have already asked and it clearly wasnt fixed. dont make mistakes this time

## Active Change Tag
- `public-contract`

## Current Status (<=10 lines)
- Synced work onto `origin/main` in branch `codex/shared-champion-esm-hotfix` because production was ahead of the prior local checkout.
- Confirmed the live production failure before the fix: `GET /api/high-score` and `POST /api/run/start` returned Vercel `500 FUNCTION_INVOCATION_FAILED`.
- Pulled Vercel logs and identified the root cause: Node ESM could not resolve `/var/task/apps/shared/playerName` because `apps/shared/highScore.ts` imported `./playerName` without the `.js` suffix.
- Fixed the shared-module imports in `apps/shared/highScore.ts` and `apps/shared/publicAgentContract.ts` to use explicit `./playerName.js`.
- Added a regression test in `server/highScoreStoreImpl.test.ts` that scans `apps/shared/*.ts` and fails if any relative import used by shared server modules omits the `.js` suffix.
- Local validation passed on 2026-03-09: `pnpm test:server`, `pnpm typecheck`, `pnpm build`, `BASE_URL=http://127.0.0.1:4174 pnpm verify:skills-contract`, `BASE_URL=http://127.0.0.1:4174 pnpm smoke:no-context`.
- Local rendered verification passed: the Playwright client captured the loading screen and the local state payload showed the contract remained intact.
- Vercel packaging passed with `vercel build` and `vercel build --prod`; preview verification passed with `vercel curl` returning `200` for both `/api/high-score` and `/api/run/start`.
- Production was redeployed with `vercel deploy --prebuilt --prod --yes`; post-deploy production now returns champion JSON and run tokens, and the live loading screen champion DOM reads `BIG BOSSY` / `573` instead of `RECORD OFFLINE`.
- Post-deploy production error check passed: `vercel logs --environment production --level error --since 5m --no-branch --expand` returned no new errors.

## Canonical Playtest URL
- `http://127.0.0.1:4174/?map=bazaar-map`

## Map Approval Status
- `NOT APPROVED`

## How to Run (real commands only)
```bash
pnpm test:server
pnpm typecheck
pnpm build
pnpm --filter @clawd-strike/client exec vite preview --host --port 4174
BASE_URL=http://127.0.0.1:4174 pnpm verify:skills-contract
BASE_URL=http://127.0.0.1:4174 pnpm smoke:no-context
vercel build
vercel build --prod
vercel deploy --prebuilt --yes
vercel deploy --prebuilt --prod --yes
curl https://clawd-strike.vercel.app/api/high-score
curl -X POST https://clawd-strike.vercel.app/api/run/start -H 'content-type: application/json' -H 'origin: https://clawd-strike.vercel.app' --data '{"playerName":"Probe","controlMode":"agent","mapId":"bazaar-map"}'
```

## Last Completed Prompt
- Title: Restore production shared-champion API and remove `RECORD OFFLINE` from the live deployment
- Changed: explicit `.js` suffixes for shared Node ESM imports, regression coverage for shared import specifiers, Vercel preview verification, and production redeploy.
- Files: `apps/shared/highScore.ts`, `apps/shared/publicAgentContract.ts`, `server/highScoreStoreImpl.test.ts`, `progress.md`
- Validation: see the Current Status validation lines above.

## Next 3 Tasks
1. Commit and push `codex/shared-champion-esm-hotfix` so the repo history matches the production deployment that is now live.
2. If the team wants stronger coverage, add a CI check that runs the shared-import suffix regression test or a lightweight `vercel build` smoke on shared-module changes.
3. If preview UI verification without manual auth matters, document or automate the Vercel deployment-protection bypass path for agent-driven preview checks.

## Known Issues / Risks
- Preview deployments are protected by Vercel auth, so browser-level preview UI checks require `vercel curl` or a bypass token; direct anonymous `curl` is expected to return `401`.
- `vercel logs --environment production --level error --since 30m` still shows the pre-fix crash history; use a short post-deploy window to verify the new deployment is clean.
