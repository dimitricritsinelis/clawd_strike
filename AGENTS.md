Audience: implementation-agent
Authority: normative
Read when: implementation work
Owns: rules, precedence, tags, validation, prompt template
Do not use for: branch status, durable history outside decisions, public browser details
Last updated: 2026-03-10

# AGENTS.md — Clawd Strike Operating Contract

## Contract
This is the only normative internal implementation doc in the repo; if internal prose conflicts, follow this file.
Do not create duplicate policy docs, per-thread notes, or subsystem process guides.
Prefer code, scripts, specs, and runtime contracts over prose when they can answer the question.

## Read / Precedence
1. Read `AGENTS.md`.
2. Read the current short-term memory snapshot via `pnpm stm -- show active`.
3. Read the single owning spec or contract for the task's primary change tag.
4. Read only the code and scripts you will touch.

Active status lives in one STM surface; `docs/decisions.md` owns durable prose memory.
`progress.md` is deprecated for this repo; do not create, update, read, or write it.
Specs and contracts outrank prose; generated views and artifacts are evidence only.

## Domain Authorities
- Map authority in `docs/map-design/`: `specs/map_spec.json` -> birdseye ref -> `blockout/topdown_layout.svg`; `shots.json` owns shot review.
- Use approved refs in `docs/map-design/refs/` for visual clarification.
- Generated map outputs are not authority: run `pnpm --filter @clawd-strike/client gen:layout-reference` and `pnpm --filter @clawd-strike/client gen:maps`; never hand-maintain drift.
- `apps/client/public/skills.md` is the browser-only contract. Do not expose coordinates, zones, landmarks, enemy positions, routes, seeds, hidden LOS, or repo-only debug data.
- Internal agent tooling is not runtime code or part of public `/skills.md`; `CLAUDE.md` may point here, not redefine policy.

## Branch Safety
- Stay on the current branch unless explicitly instructed otherwise, and treat branch names in plans or STM as descriptive only.
- Before any git command that could change HEAD, check `git status --short` and `git branch --show-current`.
- If the worktree is dirty, do not `checkout`, `switch`, `rebase`, `reset`, `stash`, auto-stash, auto-commit, or discard changes to move work.
- If a different branch or worktree would be safer, stop and ask instead of creating it implicitly.
- When parallel work stays in one worktree, remain on the current branch unless told to isolate the task.
- In updates and handoffs, report the current branch and dirty state when it matters.

## Primary Change Tag
Every task carries exactly one primary change tag in the prompt and, when tracked, in the current STM snapshot.
Allowed tags: `map-geometry`, `map-visual`, `movement-sim`, `combat-gameplay`, `bot-ai`, `ui-flow`, `public-contract`, `perf`, `tooling`, `docs`.
If omitted, infer the best fit and record it before work starts.

## Tag Routing
- `map-geometry`, `map-visual`: read map authority first; add `shots.json` for shot/review changes and approved refs for visual clarification. Validation: `pnpm qa:completion`; geometry also needs map regen/diff (`pnpm --filter @clawd-strike/client gen:maps`, `git diff --exit-code -- apps/client/public/maps`), manual traversal, and deterministic reference review for visible/signoff-sensitive changes.
- `movement-sim`, `combat-gameplay`, `bot-ai`, `ui-flow`, `perf`: read the STM snapshot and touched runtime code; pull map/public-contract authorities only when needed. Validation: smallest targeted smoke; default runtime sanity is `pnpm smoke:game`; human pointer-lock/menu/input smoke when feel or UX changed; `pnpm --filter @clawd-strike/client bot:smoke` for enemy tuning, `pnpm test:playwright` for loading-screen/public-selector/public-payload/shared-champion regressions, before/after perf checks for perf work, and `pnpm qa:completion` when player-visible map or visual defaults changed.
- `public-contract`: read public `skills.md`, touched public API/state code, and contract verification scripts. Validation: `pnpm verify:skills-contract` and `pnpm smoke:no-context`.
- `tooling`: read root/client `package.json`, touched scripts, and `.github/workflows/ci.yml`. Validation: smallest targeted script/CI check; if runtime output changes, also run the owning subsystem gate; if map generation changes, also run map regen/diff.
- `docs`: read only the authority file being corrected plus `docs/decisions.md` when the rule is durable. Validation: targeted reference scan only, unless the doc changes a runtime-facing public contract.

## Cross-cutting Riders
Public-contract rider: if a task changes `/skills.md`, public selectors, agent-visible browser state/payload, or the documented no-context retry flow, also run `pnpm verify:skills-contract` and `pnpm smoke:no-context`.
Visual-signoff rule: screenshot and reference inspection are required only for visible map work, lookdev/material/props/lighting, and major HUD/signoff-sensitive visual changes; skip them for logic-only gameplay, bot, perf, tooling, or contract work unless appearance changed.
Passing CI does not replace tag-specific local validation.

## Guardrails
- Preserve deterministic behavior where the current runtime already depends on it.
- Readability beats clutter. Visible polish must not silently harm collision, traversal, sightlines, cover, or callout clarity; critique should prioritize practical high-impact improvements.
- When runtime behavior changes, update the owning authority file in the same task.
- Prefer maintainable, explicit systems over clever one-off process.
- Delete obsolete docs instead of leaving stale instruction surfaces behind.

## Prompt Template
Use:

```text
Primary change tag: <one tag from AGENTS.md>
Goal: <what should change>
Constraints: <limits>
Acceptance signal: <done proof>
Relevant authority: <owning spec or contract>
```

## Completion
- Default dev iteration should use `pnpm dev` plus `pnpm typecheck`, `pnpm test:server`, and `pnpm smoke:game`; add `pnpm bot:smoke` for bot work, `pnpm verify:skills-contract && pnpm smoke:no-context` for public-contract work, `pnpm qa:completion` for map/visual checkpoints, and `pnpm qa:release` for release candidates.
- Use `pnpm test:playwright` only for full browser regressions such as loading-screen, public-selector, public-payload, or shared-champion changes, not as the default gameplay inner-loop check.
- Targeted validation commands should be selected based on the primary change tag and run before task completion.
- Keep STM updates at claim/progress/status/finish.
- Keep the STM snapshot compact and current; collapse finished work into one-line rollups.
- Keep `docs/decisions.md` short and durable; add entries only for lasting behavior changes.
- Keep internal agent tooling separate from the repo root authority surface and from public `apps/client/public/skills.md`.
- Do not create duplicate tool-specific policy docs.
