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
- `main` is staged for a deployment handoff that bundles the faster 10s/30s bot hunt curve, death-time shared-champion refresh, AK reload/kill-confirm audio, a headshot banner, and wave-start ammo reset coverage.
- `pnpm typecheck`, `pnpm build`, `pnpm verify:skills-contract`, `pnpm smoke:no-context`, `pnpm --filter @clawd-strike/client smoke:wave-ammo-reset`, `pnpm --filter @clawd-strike/client bot:smoke`, and `pnpm test:playwright` all passed on `2026-03-07`.
- The linked Vercel project is `clawd-strike` (`.vercel/project.json`), so pushing `main` is expected to trigger the next production deployment.

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
pnpm --filter @clawd-strike/client smoke:wave-ammo-reset
pnpm --filter @clawd-strike/client bot:smoke
BASE_URL=http://127.0.0.1:5174 pnpm --filter @clawd-strike/client capture:shots
BASE_URL=http://127.0.0.1:5174 pnpm qa:autonomous
```

## Last Completed Prompt
- Title: Commit the validated gameplay/client updates on `main` and redeploy Vercel
- Changed: verified the pending bot/gameplay/UI/public-contract changes, refreshed `progress.md` for the deployment handoff, and prepared the repo for a `main` push into the linked Vercel project.
- Files: `progress.md`
- Validation: `pnpm typecheck`, `pnpm build`, `pnpm verify:skills-contract`, `pnpm smoke:no-context`, `pnpm --filter @clawd-strike/client smoke:wave-ammo-reset`, `pnpm --filter @clawd-strike/client bot:smoke`, and `pnpm test:playwright` (manual pointer-lock test remained intentionally skipped).

## Next 3 Tasks
1. Do a real human combat pass in-browser to confirm the faster 10s/30s hunt curve, headshot banner, and AK feedback feel cohesive in a live pointer-lock session.
2. Verify the new `main` deployment on Vercel behaves the same as the local validated build, especially shared-champion refresh and restart/ammo reset behavior.
3. If early-wave pressure is still too sharp after that live pass, tune search weighting or tier timing instead of adding more one-off exceptions.

## Known Issues / Risks
- This machine still cannot provide a true subjective human combat pass from headless automation because pointer lock and WebGL visuals are limited in that path.
- The new deployment still needs a real browser sanity pass after Vercel finishes, even though the local automated gates are green.
