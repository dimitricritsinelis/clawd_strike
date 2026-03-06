# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- Runtime map is generated from `docs/map-design/specs/map_spec.json` into `apps/client/public/maps/bazaar-map/` via `pnpm --filter @clawd-strike/client gen:maps`.
- Canonical runtime remains `bazaar-map` on the Vite client at port `5174`.
- Repo storage audit confirmed the largest deletable files are transient Playwright traces, generated `apps/client/dist` output, and unused raw files under `art-source/`; runtime `apps/client/public/**` assets remain referenced by the game.
- All `artifacts/playwright/**/trace.zip` files were deleted on March 6, 2026; `artifacts/playwright` dropped from `3.7G` to `379M`.
- Public no-context agent contract is hardened locally: `skills.md` now states the page-JS requirement, includes a compatibility `readState()` helper, documents `[data-testid="play-again"]`, and defines the full death/retry loop plus realistic hidden-tab guidance.
- New local validation is in: `smoke:no-context` starts from `/skills.md`, uses only documented selectors/public APIs, and confirms 2 death/respawn cycles; `verify:skills-contract` confirms the served `/skills.md` matches the built contract file.
- `pnpm qa:completion` still runs traversal/visual review plus `bot:smoke`, and both pass on this state.
- `pnpm typecheck`, `pnpm build`, `pnpm --filter @clawd-strike/client exec playwright test playwright/public-agent-contract.spec.ts`, `BASE_URL=http://127.0.0.1:5174 AGENT_NAME=NoContextProbe pnpm smoke:no-context`, `BASE_URL=http://127.0.0.1:5174 pnpm verify:skills-contract`, and `BASE_URL=http://127.0.0.1:5174 AGENT_NAME=ContractProbe pnpm qa:completion` all pass locally.
- Completion gate still reports only the existing 2 advisory visual warnings (`SHOT_09_BZ_M2_EAST_FACADE`, `SHOT_03_SPAWN_B_TO_BAZAAR`) for missing visible landmark anchors.
- Production rollout is blocked on missing Vercel credentials on this machine: `.vercel/project.json` is present and `vercel` is installed, but `vercel whoami` fails with `No existing credentials found`.
- Map approval still pending facade readability signoff and a real human pointer-lock combat pass against the current bot feel.

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
pnpm smoke:no-context
pnpm verify:skills-contract
pnpm qa:completion
pnpm --filter @clawd-strike/client bot:smoke
BASE_URL=http://127.0.0.1:5174 AGENT_NAME=SmokeRunner pnpm --filter @clawd-strike/client smoke:agent
BASE_URL=http://127.0.0.1:5174 pnpm --filter @clawd-strike/client capture:shots
BASE_URL=http://127.0.0.1:5174 pnpm qa:autonomous
```

## Last Completed Prompt
- Title: Playwright trace cleanup
- Changed: deleted all transient `trace.zip` archives under `artifacts/playwright` after confirming they were non-runtime Playwright outputs; preserved summaries, screenshots, and other review artifacts.
- Files touched: `progress.md`
- Validation: `find artifacts/playwright -type f -name 'trace.zip' | wc -l` → `0`; `du -sh artifacts/playwright` → `379M`

## Next 3 Tasks
1. Authenticate Vercel on this machine (`vercel login` or `VERCEL_TOKEN`) so preview deploy, preview smoke, and production promotion can actually run.
2. Deploy preview from the linked repo root, then run `smoke:no-context` and `verify:skills-contract` against the preview URL before promoting.
3. After production rollout, rerun the no-context smoke against `https://clawd-strike.vercel.app` and verify the live `/skills.md` plus live runtime now match the hardened contract.

## Known Issues / Risks
- `gen:maps` still emits expected clear-zone anchor warnings for several landmark/open-node anchors.
- Automated Chrome in this environment still would not grant human-mode pointer lock, so combat feel still needs a human pass even though traversal/bot smoke/completion gate are green.
- The generic skill-client canvas capture still returns a black frame on this runtime; page-level Playwright screenshots were used for the required before/after pair.
- `qa:completion` still reports advisory warnings on `SHOT_09_BZ_M2_EAST_FACADE` and `SHOT_03_SPAWN_B_TO_BAZAAR` because those views do not surface landmark anchors in-frame, even though the visual review passes.
- The preview/prod rollout could not be executed here because `vercel whoami` reports `No existing credentials found`; live-site acceptance is still pending that authentication step.
- The current bot overhaul is still wave-survival AI, not full T/CT objective bots; there is no bomb logic, grenade usage, jump-spot system, or objective planner yet.
- Warmup remains fail-open by design: asset preload failures warn and continue with fallback behavior.
