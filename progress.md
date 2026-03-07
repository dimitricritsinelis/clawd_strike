Audience: human, implementation-agent
Authority: status
Read when: map, visuals, ai, gameplay, ui, public-contract, perf, tooling, docs
Owns: current branch state, active change tag, canonical run commands, next tasks, known risks
Do not use for: workflow policy, durable rationale, public contract details, archive history
Last updated: 2026-03-07

# progress.md — Clawd Strike Status

## Active Change Tag
- `perf`

## Current Status (<=10 lines)
- Performance review quick wins remain shipped, and the headshot kill-frame hitch fix is now layered on top of them.
- Headshot and kill feedback now drains from a queued post-sim pipeline instead of stacking direct HUD/audio work inside the shot callback.
- Score HUD kill/headshot scoring is now applied in one pass; duplicate score flashes and overlapping timeout resets were removed.
- Kill feed entries and damage-number elements are prewarmed before combat, and kill-feedback audio now prewarms its internal path before first use.
- Dev-only runtime telemetry now reports `combatFeedbackQueue`, `lastCombatFeedbackMs`, and `lastKillFeedbackMs`.
- New smoke coverage: `pnpm --filter @clawd-strike/client smoke:headshot-kill-perf` validates score deltas, kill-feedback budget, and frame-spike budget around a scripted headshot kill.
- Latest targeted smoke passed at `spike=1.931ms`, `killFeedback=0ms` on the Chrome/WebGL path.
- `pnpm typecheck`, `pnpm build`, `pnpm qa:completion`, and bot smoke all pass.
- Map approval is still pending a real human pointer-lock/combat pass on the current runtime defaults.

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
- Title: Headshot kill-frame hitch fix
- Changed: moved hit and kill feedback into a queued drain after simulation, collapsed Score HUD kill/headshot updates into one pass, prewarmed kill-feed and damage-number DOM pools plus combat-feedback audio state, added dev-only combat perf telemetry and an internal debug combat emitter, and added a targeted headshot perf smoke script.
- Files: `bootstrap.ts`, `ScoreHud.ts`, `KillFeed.ts`, `DamageNumbers.ts`, `WeaponAudio.ts`, `global.d.ts`, `headshot-kill-perf-smoke.mjs`, `apps/client/package.json`
- Validation: `pnpm typecheck`, `pnpm build`, `pnpm --filter @clawd-strike/client smoke:headshot-kill-perf`, `pnpm qa:completion`

## Next 3 Tasks
1. Run a real human pointer-lock/combat pass and confirm live headshots now feel clean with the queued feedback path.
2. Implement zone-based visibility culling using `map_spec.json` zone adjacency (highest remaining perf gain: 2-5ms in corridor views).
3. Pre-compress floor/wall textures to KTX2 (BC7/ETC2) to cut VRAM 4-6x and improve load times.

## Known Issues / Risks
- `gen:maps` still emits expected clear-zone anchor warnings for several landmark/open-node anchors.
- `qa:completion` still reports advisory warnings on `SHOT_09_BZ_M2_EAST_FACADE` and `SHOT_03_SPAWN_B_TO_BAZAAR` because those views do not surface landmark anchors in-frame, even though the visual review passes.
- Automated Chrome in this environment still would not grant a true human pointer-lock playtest, so combat feel still needs a manual pass even though traversal and bot smoke are green.
- The generic skill-client canvas capture still returns a non-WebGL black or blank frame on this runtime; project Playwright helpers were used for the real visual and perf review path.
- If runtime warmup times out, the game now falls back to blockout-safe surfaces before spawn; that avoids late streaming but still needs a human sanity check on extremely slow machines.
- The new headshot perf smoke exercises the queued feedback path via an internal debug-only emitter; it validates the hitch fix deterministically but does not replace full live-combat coverage.
- The preview or prod rollout could not be executed here because `vercel whoami` reports `No existing credentials found`; live-site acceptance is still pending that authentication step.
- The current bot overhaul is still wave-survival AI, not full T/CT objective bots; there is no bomb logic, grenade usage, jump-spot system, or objective planner yet.
