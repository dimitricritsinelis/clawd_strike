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
- Deleted every non-`main` local branch and every non-`main` branch on `origin`.
- Removed the attached worktree at `.claude/worktrees/hardcore-brattain` so the pinned `claude/hardcore-brattain` branch could be deleted cleanly.
- Local branch list now contains only `main`.
- Remote branch list now contains only `origin/main` plus the symbolic `origin` ref.
- Removed the remaining detached temp worktrees under `/private/tmp/`; `git worktree list` now shows only the primary checkout on `main`.

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
- Title: Delete every non-main branch locally and on origin
- Changed: deleted all non-`main` local branches, deleted `origin/loading-screen`, `origin/map-dev`, and `origin/map-dev-2`, removed the `.claude/worktrees/hardcore-brattain` worktree, and then force-removed the remaining detached temp worktrees under `/private/tmp/`.
- Files: `progress.md`
- Validation: `git branch`, `git branch -r`, `git worktree list`, `git fetch --prune origin`, `git worktree remove --force ...`.

## Next 3 Tasks
1. Do a real pointer-lock human pass on the live site to confirm the AK/enemy materials and the adjusted HUD spacing both look correct in an actual WebGL session.
2. Resume the separate `bot:smoke` stall investigation now that the production visual regression is cleared.
3. Keep `main` as the only long-lived branch unless a new isolated workstream actually needs a separate branch/worktree.

## Known Issues / Risks
- Any future CSP tightening must preserve `blob:` under `connect-src` while embedded-texture `.glb` assets remain in use.
- The separate `bot:smoke` stall remains unresolved and is unrelated to this visual regression.
