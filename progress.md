# progress.md — MVP Blockout Branch

## Current Status (<=10 lines)
- Design packet root confirmed: `/Users/dimitri/Desktop/clawd-strike/docs/map-design`.
- `docs/map-design` remains the source-of-truth input (spec + refs) and is only used by `gen:maps` to emit runtime copies under `apps/client/public/maps/bazaar-map/`.
- Facade details: `window_glass` reflective blue shader + balconies (35% facade gate, spawn-plaza forced, A/B symmetric; main lane weighted 1/2/3-bay mix; doors scale with slab; connectors/side-halls/corners have 0 balconies).
- Outer shell: roof caps depth 4 m; side-hall inner/outer wall heights 9 m / 3 m; connector corner zones raised to 9 m to close plaza corner gaps.
- Jog fillers: W/E fill zones close main-lane exterior wall/floor voids so the 9 m shell is continuous from Z=14-68.
- Loading screen info overlay textbox positioned at `--info-textbox-y-lift: -90px`.
- `gen:maps` still emits anchor clearance warnings during build (expected, not a bug).
- Agent playbook is served at `/skills.md`; loading screen button opens it (same-origin).
- Vercel deploy agent skill installed: `.agents/skills/vercel-cli/` + `skills-lock.json`.

## Canonical Playtest URL
- `http://127.0.0.1:5174/?map=bazaar-map&autostart=human`

## Map Approval Status
- `NOT APPROVED`

## How to Run (real commands only)
```bash
pnpm dev
pnpm typecheck
pnpm build
```

## Last Completed Prompt
- Imported Vercel agent skill `vercel-cli` into the repo for Codex: `.agents/skills/vercel-cli/` + `skills-lock.json`.
- `pnpm typecheck` + `pnpm build` pass clean.

## Next 3 Tasks
1. Set up Vercel deployment (project link + build settings) for the pnpm workspace client.
2. Review door placement policy (spawn walls, terminal main-lane zones) against design intent.
3. Mark map `APPROVED` once blockout geometry satisfies design brief acceptance criteria.

## Known Issues / Risks
- `gen:maps` still emits clear-zone anchor warnings for several landmarks/open-node anchors.
- Automated pointer-lock verification is flaky in Playwright and requires manual browser confirmation.
- Headless Playwright WebGL context unreliable; headed capture remains the dependable path.
