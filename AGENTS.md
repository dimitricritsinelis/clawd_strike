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
5. `docs/map-design/layout-reference.md`
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
- Generated map-reference views: `docs/map-design/layout-reference.md` and `docs/map-design/layout-reference.svg` are convenience outputs generated from `map_spec.json`; never hand-maintain them or treat them as higher authority than the design packet.
- Evidence, not memory: `artifacts/`, generated `apps/client/dist/skills.md`, and external archive material at `/Users/dimitri/Desktop/clawd-strike-archive`.

## Authority Map
- `README.md`: human quick start only.
- `AGENTS.md`: internal policy, read order, change tags, validation policy.
- `progress.md`: current branch/task state only.
- `docs/decisions.md`: durable internal decisions that change future implementation behavior.
- `docs/map-design/layout-reference.md`: generated human-readable map naming and wall-reference view only; regenerate it, do not hand-author it.
- `apps/client/public/skills.md`: public browser-only contract only.

### Hard Authority Rules
- Map geometry and layout authority, in order:
  1. `docs/map-design/specs/map_spec.json`
  2. `docs/map-design/refs/bazaar_slice_v2_2_detailed_birdseye.png`
  3. `docs/map-design/blockout/topdown_layout.svg`
- `docs/map-design/shots.json` owns the runtime review shot contract.
- Approved reference pack for map and visual clarification:
  - `docs/map-design/refs/bazaar_slice_v2_2_detailed_birdseye.png`
  - `docs/map-design/refs/bazaar_slice_v2_2_map_only.png`
  - `docs/map-design/refs/bazaar_main_hall_reference.png`
- `docs/map-design/layout-reference.md` and `docs/map-design/layout-reference.svg` are generated reference views. Regenerate them with `pnpm --filter @clawd-strike/client gen:layout-reference`; do not treat them as map authority over the design packet.
- Runtime map files must be generated from the design packet with `pnpm --filter @clawd-strike/client gen:maps`. Do not hand-maintain drift in `apps/client/public/maps/`.
- `apps/client/public/skills.md` must stay fair and browser-only. Do not expose coordinates, map zones, landmark IDs, enemy positions, routes, seeds, hidden line-of-sight truth, or repo-only debug data.
- Internal agent tooling is not game runtime code and is not part of the public `/skills.md` surface. Keep agent-only deploy or debug bundles out of the repo root unless they become an explicit repo workflow requirement.
- Repo-local operator helpers should live in scripts, not new Markdown surfaces. The admin stats helper lives at `apps/client/scripts/admin-stats.sh`; document its usage in existing authority files instead of adding standalone tool docs.
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
| `map-geometry` | `docs/map-design/specs/map_spec.json`, `docs/map-design/shots.json` when shot framing or review contract changes, approved refs when the JSON needs visual clarification, touched map runtime scripts/code | `apps/client/public/skills.md`, archive material, `artifacts/` except direct review evidence | `pnpm --filter @clawd-strike/client gen:maps`, `git diff --exit-code -- apps/client/public/maps`, `pnpm qa:completion`, short manual traversal from both spawns, deterministic shot/reference review against approved refs when visible geometry changed |
| `map-visual` | `docs/map-design/specs/map_spec.json` for openings and collision truth, approved refs for signed visual intent, touched rendering/material code | `apps/client/public/skills.md`, archive material, `artifacts/` except the latest review captures | `pnpm qa:completion`, deterministic shot/reference review against approved refs, before/after shot pair for significant changes, brief in-engine look pass |
| `movement-sim` | `progress.md`, touched runtime movement/input code, `docs/map-design/specs/map_spec.json` only if traversal geometry is affected | map-design refs, `apps/client/public/skills.md` unless public controls/readiness change | the smallest targeted runtime smoke for the touched behavior; human pointer-lock pass when pointer lock, fullscreen, live input flow, or movement feel changed |
| `combat-gameplay` | `progress.md`, touched combat/scoring runtime code, `apps/client/public/skills.md` if score or run-summary semantics change | map-design refs unless sightlines, cover, or traversal are affected | the smallest targeted mechanic smoke for the touched feature, short manual playtest, `pnpm --filter @clawd-strike/client bot:smoke` when enemy combat tuning is involved, `pnpm --filter @clawd-strike/client smoke:headshot-kill-perf` when kill-feedback or score-feedback perf changed |
| `bot-ai` | `progress.md`, touched enemy/runtime code, `docs/map-design/specs/map_spec.json` only if navigation/layout assumptions matter, `apps/client/public/skills.md` if exposed summaries change | visual refs unless lane/readability behavior is being tuned against them | `pnpm --filter @clawd-strike/client bot:smoke`, short human combat pass, perf spot-check if update frequency or search logic changed |
| `ui-flow` | `progress.md`, touched loading-screen/runtime UI code, `apps/client/public/skills.md` if agent entry flow or public selectors change | map-design docs unless the UI is map-specific | `pnpm test:playwright`, `pnpm smoke:no-context` when agent entry flow, retry flow, public selectors, or documented `/skills.md` snippets changed, human smoke when pointer lock, fullscreen, or menu UX changed |
| `public-contract` | `apps/client/public/skills.md`, touched public runtime API/state code, touched contract verification scripts | map-design docs unless the contract text directly depends on map truth | `pnpm verify:skills-contract`, `pnpm smoke:no-context` |
| `perf` | `progress.md`, touched bootstrap/render/warmup code, `apps/client/public/skills.md` if readiness or public state changes | map-design docs unless asset/layout paths changed | before/after perf baseline on the canonical playtest URL, rerun the primary subsystem smoke, human sanity pass if timing or feel changed, `pnpm qa:completion` if player-visible defaults changed, public-contract gates if readiness or public state changed |
| `tooling` | `package.json`, `apps/client/package.json`, touched scripts, `.github/workflows/ci.yml` | map-design docs and `apps/client/public/skills.md` unless the tool directly validates them | the smallest targeted script or CI validation; exact subsystem gate if runtime output changed; `pnpm --filter @clawd-strike/client gen:maps` plus `git diff --exit-code -- apps/client/public/maps` if map generation changed |
| `docs` | only the authority file being corrected, plus `docs/decisions.md` when a durable rule must be captured | runtime code, visual refs, `artifacts/`, archive material unless needed to verify a fact | targeted `rg` or reference scan only; run the full `public-contract` gate if a runtime-facing contract doc changed |

### Cross-cutting Public-Contract Rider
If a task changes `/skills.md`, stable public selectors, agent-visible browser payload/state, or the documented no-context retry flow, also run `pnpm verify:skills-contract` and `pnpm smoke:no-context` regardless of the primary change tag.

### Visual Signoff Rule
Screenshot and reference inspection are required only for visual-signoff surfaces. Use them for visible map-geometry changes, map lookdev/material/props/lighting work, and major HUD layout or signoff-sensitive visual changes. Do not require them for bot logic, combat tuning, movement bug fixes, tooling, perf work, or contract-only changes unless the change intentionally altered appearance.

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

CI is still narrower than the repo completion policy. It should eventually mirror the same tag matrix with path-based routing, but that follow-up belongs in `tooling` work. Passing CI does not replace the required local completion gates.

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
- Keep internal agent tooling separate from the repo root authority surface and from public `apps/client/public/skills.md`.
- Do not create `TESTING.md`, `ARCHITECTURE.md`, `BOTS.md`, `TEXTURES.md`, `MAP_NOTES.md`, or any tool-specific duplicate of this file.
