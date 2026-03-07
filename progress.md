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
- Fixed the production CSP regression that was turning embedded-texture GLB models white on Vercel.
- `vercel.json` now allows `blob:` under `connect-src`, which is required for Three `GLTFLoader` to fetch embedded GLB texture blobs.
- Updated `docs/security.md` to document that `blob:` is required in both `img-src` and `connect-src` for embedded-texture GLB assets.
- Required gates pass: `pnpm typecheck` and `pnpm build`.
- Targeted validation passed with a local static server serving the production `dist/` output plus the patched CSP header.
- The prior live repro under `artifacts/weapon-white-live/` showed the failure; the patched local repro under `artifacts/weapon-white-local-csp-20260307T1206/` and `artifacts/weapon-white-local-csp-autostart-20260307T1207/` no longer emits the CSP / `GLTFLoader` blob texture errors.

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
- Title: Fix the white gun regression caused by the production CSP
- Changed: patched `vercel.json` CSP to allow `blob:` under `connect-src`, updated `docs/security.md`, and recorded the result in `progress.md`.
- Files: `vercel.json`, `docs/security.md`, `progress.md`
- Validation: `pnpm typecheck`, `pnpm build`, `curl -I http://127.0.0.1:4174/` against a local static server serving `apps/client/dist` with the patched CSP, plus Playwright artifact captures under `artifacts/weapon-white-local-csp-20260307T1206/` and `artifacts/weapon-white-local-csp-autostart-20260307T1207/`.

## Next 3 Tasks
1. Redeploy so Vercel serves the patched CSP header in production.
2. Re-check the deployed AK and enemy raider materials with a real pointer-lock human pass after redeploy.
3. Resume the separate `bot:smoke` stall investigation once the production visual regression is cleared.

## Known Issues / Risks
- The current live Vercel deployment will stay broken until it is redeployed with the patched `vercel.json`.
- Any future CSP tightening must preserve `blob:` under `connect-src` while embedded-texture `.glb` assets remain in use.
- The separate `bot:smoke` stall remains unresolved and is unrelated to this visual regression.
