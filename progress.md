Audience: human, implementation-agent
Authority: status
Read when: map, visuals, ai, gameplay, ui, public-contract, perf, tooling, docs
Owns: current branch state, active change tag, canonical run commands, next tasks, known risks
Do not use for: workflow policy, durable rationale, public contract details, archive history
Last updated: 2026-03-09

# progress.md — Clawd Strike Status

Original prompt: can we make the font on the champion icon bigger, while ensure the current alignment and placement remain the same

## Active Change Tag
- `ui-flow`

## Current Status (<=10 lines)
- Branch `codex/champion-badge-font` is pushed and PR `#10` is open against `main`.
- Increased only the loading-screen shared-champion badge font-size variables in `apps/client/src/styles.css`; the badge field boxes, offsets, and placement were left unchanged.
- Ready-state badge sizing now uses `clamp(13px, 1.18vw, 19px)` for the champion name and `clamp(15px, 1.34vw, 21px)` for the score.
- Unavailable, loading, and empty badge states were raised proportionally so fallback typography still matches the same badge layout.
- Visual verification passed on 2026-03-09 with a seeded local `AGENT DAN / 40` badge at `http://127.0.0.1:4175/?map=bazaar-map`; the larger text stayed centered in the same name and score windows.
- Validation passed on 2026-03-09: `pnpm typecheck`, `pnpm build`, `PW_PORT=4175 pnpm test:playwright`.
- No public selectors, runtime gameplay, or contract surfaces changed.

## Canonical Playtest URL
- `http://127.0.0.1:4174/?map=bazaar-map`

## Map Approval Status
- `NOT APPROVED`

## How to Run (real commands only)
```bash
pnpm typecheck
pnpm build
PW_PORT=4175 pnpm test:playwright
pnpm --filter @clawd-strike/client exec vite --host --port 4175
```

## Last Completed Prompt
- Title: Enlarge the loading-screen champion badge font without moving the badge layout
- Changed: champion badge typography variables only; the name and score slots keep their existing anchored boxes.
- Files: `apps/client/src/styles.css`, `progress.md`
- Validation: `pnpm typecheck`, `pnpm build`, `PW_PORT=4175 pnpm test:playwright`

## Next 3 Tasks
1. Wait for review on PR `#10`.
2. If the badge needs more presence, continue adjusting only the shared-champion font variables before changing the field boxes.
3. If requested, align the runtime HUD and death-screen champion typography with the loading-screen badge treatment.

## Known Issues / Risks
- Longer champion names will hit ellipsis slightly sooner because the badge width and alignment were intentionally preserved.
