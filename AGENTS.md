Audience: implementation-agent
Authority: normative
Read when: map, visuals, ai, gameplay, ui, public-contract, perf, tooling, docs
Owns: repo operating rules, authority order, change tags, validation policy, memory model, prompt template
Do not use for: current branch status, long-term design history outside durable decisions, public browser-agent behavior details
Last updated: 2026-03-07

# AGENTS.md — Clawd Strike Operating Contract

## Purpose
This is the only normative internal implementation doc in the repo.

If any internal prose conflicts with this file, follow this file.

Active repo-owned Markdown is limited to six files:
1. `README.md`
2. `AGENTS.md`
3. `progress.md`
4. `docs/decisions.md`
5. `docs/map-design/README.md`
6. `apps/client/public/skills.md`

Do not add a third memory layer. No per-thread notes, no duplicate tool guides, no subsystem process docs.

## Read Order
1. Read `AGENTS.md`.
2. Read `progress.md`.
3. Read the single spec or contract selected by the task's primary change tag.
4. Read only the code and scripts directly touched.

If a fact is not in one of the six Markdown authorities, prefer code, scripts, JSON specs, and runtime contracts over creating new Markdown.

## Memory Model
- Short-term memory: `progress.md` only. Overwrite aggressively. Never turn it into a transcript.
- Long-term prose memory: `docs/decisions.md` only. Add entries only for durable, non-obvious choices that should survive context resets.
- Durable structured memory: `docs/map-design/specs/map_spec.json`, `docs/map-design/shots.json`, and `apps/client/public/skills.md`.
- Evidence, not memory: `artifacts/`, generated `apps/client/dist/skills.md`, external archive material at `/Users/dimitri/Desktop/clawd-strike-archive`, and bundled skills under `.agents/skills/`.

## Authority Map
- `README.md`: human quick start only.
- `AGENTS.md`: internal policy, read order, change tags, validation policy.
- `progress.md`: current branch/task state only.
- `docs/decisions.md`: durable internal decisions that change future implementation behavior.
- `docs/map-design/README.md`: map-design authority map only.
- `apps/client/public/skills.md`: public browser-only contract only.

### Hard Authority Rules
- Map geometry and layout authority, in order:
  1. `docs/map-design/specs/map_spec.json`
  2. `docs/map-design/refs/bazaar_slice_v2_2_detailed_birdseye.png`
  3. `docs/map-design/blockout/topdown_layout.svg`
- Runtime map files must be generated from the design packet with `pnpm --filter @clawd-strike/client gen:maps`. Do not hand-maintain drift in `apps/client/public/maps/`.
- `apps/client/public/skills.md` must stay fair and browser-only. Do not expose coordinates, map zones, landmark IDs, enemy positions, routes, seeds, hidden line-of-sight truth, or repo-only debug data.
- Tool shims such as `CLAUDE.md` may point to this file, but they may not redefine policy.

## Primary Change Tag
Every task must carry exactly one primary change tag in the prompt and in `progress.md`.

Allowed tags:
- `map-geometry`
- `map-visual`
- `movement-sim`
- `combat-gameplay`
- `bot-ai`
- `ui-flow`
- `public-contract`
- `perf`
- `tooling`
- `docs`

If a user prompt omits the tag, infer the best fit from the requested change and record it explicitly before doing work.

## Change Tag Matrix

| Tag | Read this first | Ignore this by default | Required targeted validation |
| --- | --- | --- | --- |
| `map-geometry` | `docs/map-design/README.md`, `docs/map-design/specs/map_spec.json`, `docs/map-design/shots.json` when shot framing changes, touched map runtime scripts/code | `apps/client/public/skills.md`, archive material, `artifacts/` except direct review evidence | `pnpm --filter @clawd-strike/client gen:maps`, `pnpm qa:completion` |
| `map-visual` | `docs/map-design/README.md`, `docs/map-design/specs/map_spec.json` for openings/collision truth, touched rendering/material code | `apps/client/public/skills.md`, archive material, `artifacts/` except the latest review captures | `pnpm qa:completion` |
| `movement-sim` | `progress.md`, touched runtime movement/input code, `docs/map-design/specs/map_spec.json` only if traversal geometry is affected | map-design refs, `apps/client/public/skills.md` unless public controls/readiness change | the smallest targeted runtime validation; human smoke when pointer lock, fullscreen, or live input flow changes |
| `combat-gameplay` | `progress.md`, touched combat/scoring runtime code, `apps/client/public/skills.md` if score or run-summary semantics change | map-design refs unless sightlines, cover, or traversal are affected | the smallest targeted combat validation; `pnpm --filter @clawd-strike/client bot:smoke` when enemy combat tuning is involved |
| `bot-ai` | `progress.md`, touched enemy/runtime code, `docs/map-design/specs/map_spec.json` only if navigation/layout assumptions matter, `apps/client/public/skills.md` if exposed summaries change | visual refs unless lane/readability behavior is being tuned against them | `pnpm --filter @clawd-strike/client bot:smoke` |
| `ui-flow` | `progress.md`, touched loading-screen/runtime UI code, `apps/client/public/skills.md` if agent entry flow or public selectors change | map-design docs unless the UI is map-specific | `pnpm test:playwright`; human smoke when pointer lock, fullscreen, or menu UX changes |
| `public-contract` | `apps/client/public/skills.md`, touched public runtime API/state code, touched contract verification scripts | map-design docs unless the contract text directly depends on map truth | `pnpm verify:skills-contract`, `pnpm smoke:no-context` |
| `perf` | `progress.md`, touched bootstrap/render/warmup code, `apps/client/public/skills.md` if readiness or public state changes | map-design docs unless asset/layout paths changed | the smallest targeted perf validation; `pnpm qa:completion` if player-visible defaults changed; contract validations if public readiness changed |
| `tooling` | `package.json`, `apps/client/package.json`, touched scripts, `.github/workflows/ci.yml` | map-design docs and `apps/client/public/skills.md` unless the tool directly validates them | the smallest targeted script or CI validation |
| `docs` | only the authority file being corrected, plus `docs/decisions.md` when a durable rule must be captured | runtime code, visual refs, `artifacts/`, archive material unless needed to verify a fact | targeted `rg` or reference scan only; run contract validations only if a runtime-facing contract doc changed |

## Validation Policy
Every task ends with:
1. `pnpm typecheck`
2. `pnpm build`
3. the targeted validation required by the primary change tag

### Repo Policy vs Current CI Reality

| Scope | Repo policy | Current CI on 2026-03-07 |
| --- | --- | --- |
| All tasks | `pnpm typecheck`, `pnpm build`, and the smallest targeted validation that matches the change | `pnpm install --frozen-lockfile`, `pnpm --filter @clawd-strike/client gen:maps`, `git diff --exit-code -- apps/client/public/maps`, `pnpm typecheck`, `pnpm build` |
| Player-visible map or visual changes | `pnpm qa:completion` | not covered |
| Public contract or public runtime surface changes | `pnpm verify:skills-contract`, `pnpm smoke:no-context` | not covered |
| Input flow, pointer lock, fullscreen, or menu UX changes | human smoke | not covered |

CI is narrower than the repo completion policy. Passing CI does not replace the required local completion gates.

## Play-Facing Review Standard
Apply this standard to `map-geometry`, `map-visual`, `combat-gameplay`, `bot-ai`, and any other task that changes what the player sees or feels.

- Operate like a senior level designer and environment artist at a top-tier game studio with 20+ years of competitive FPS map experience.
- Use Counter-Strike's Dust II as the quality benchmark for production polish, not as a template to copy.
- Be ultra-critical, detail-oriented, and honest. Assume the map still needs meaningful improvement before it is production-ready.
- Push work toward studio-quality execution while staying realistic about the current tech stack, tools, and runtime constraints.
- Prefer practical, high-impact recommendations over vague or overly ambitious ideas.
- When useful, separate quick wins from larger rework items.
- Keep asking what is missing and what is not being asked.
- Readability beats clutter. Never trade navigation, collision, sightlines, or callout clarity for superficial dressing.

For `tooling`, `docs`, and pure `public-contract` work, use the normal engineering standard instead of forcing a level-design critique lens onto unrelated tasks.

## Implementation Guardrails
- Preserve deterministic behavior where the current runtime already depends on it.
- Keep collision and traversal quality stable when polishing visuals.
- Treat map beautification as gameplay-sensitive work: materials, props, openings, and silhouette changes must not silently damage navigation, sightlines, or cover behavior.
- When runtime behavior changes, update the owning authority file in the same task.
- Prefer maintainable, explicit systems over clever one-off process.
- Delete obsolete docs instead of leaving stale instruction surfaces behind.

## Prompt Template
Use this shape when starting work:

```text
Primary change tag: <one tag from AGENTS.md>
Goal: <what should change>
Constraints: <quality, runtime, product, or scope limits>
Acceptance signal: <what proves the task is done>
Relevant authority: <spec, contract, or file that owns the change>
```

## Completion Discipline
- Update `progress.md` at the end of every task.
- Keep `progress.md` short and current.
- Keep `docs/decisions.md` short and durable.
- Do not create `TESTING.md`, `ARCHITECTURE.md`, `BOTS.md`, `TEXTURES.md`, `MAP_NOTES.md`, or any tool-specific duplicate of this file.
