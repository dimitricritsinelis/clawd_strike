Audience: human, implementation-agent
Authority: normative
Read when: map, visuals, ai, gameplay, ui, public-contract, perf, tooling, docs
Owns: durable internal decisions that future tasks should not rediscover
Do not use for: current task status, temporary bug lists, per-task notes, public browser-agent behavior details
Last updated: 2026-03-07

# Durable Decisions

## DEC-001: Six-file authority model
- Active repo-owned Markdown is limited to `README.md`, `AGENTS.md`, `progress.md`, `docs/decisions.md`, `docs/map-design/README.md`, and public `apps/client/public/skills.md`.
- `AGENTS.md` is the only normative internal implementation doc.
- Tool shims such as `CLAUDE.md` may point to the authority files, but they may not restate or redefine policy.

## DEC-002: Two-layer memory model
- `progress.md` is the only short-term memory layer.
- `docs/decisions.md` is the only durable prose memory layer.
- Durable structured truth should live in specs and contracts such as `docs/map-design/specs/map_spec.json`, `docs/map-design/shots.json`, and `apps/client/public/skills.md`.
- `artifacts/`, generated outputs, bundled skill docs, and external archive material are evidence only and are never authoritative.

## DEC-003: Map authority and runtime generation
- Map geometry authority order is `docs/map-design/specs/map_spec.json` -> `docs/map-design/refs/bazaar_slice_v2_2_detailed_birdseye.png` -> `docs/map-design/blockout/topdown_layout.svg`.
- Runtime map data must be regenerated with `pnpm --filter @clawd-strike/client gen:maps`.
- Do not hand-maintain drift in `apps/client/public/maps/`.

## DEC-004: Public contract fairness boundary
- `apps/client/public/skills.md` is a browser-only public contract and must remain separate from internal process docs.
- The public contract must not expose coordinates, hidden enemy state, routes, seeds, landmark IDs, or other repo-only tactical truth.

## DEC-005: Validation boundary
- `pnpm qa:completion` is required for player-visible map or visual changes.
- `pnpm verify:skills-contract` and `pnpm smoke:no-context` are required when the public contract or its runtime-facing surface changes.
- Current CI is narrower than local completion policy and does not replace these local gates.

## DEC-006: Play-facing quality bar
- Use Dust II-level production polish as the benchmark for play-facing work, without copying its layout.
- Favor readability over clutter, honest critique over comfort, and practical high-impact changes over vague ambition.
- Separate quick wins from larger rework when that distinction helps prioritization.
