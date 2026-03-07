Audience: human, implementation-agent
Authority: normative
Read when: map, visuals, ai, gameplay, ui, public-contract, perf, tooling, docs
Owns: durable internal decisions that future tasks should not rediscover
Do not use for: current task status, temporary bug lists, per-task notes, public browser-agent behavior details
Last updated: 2026-03-07

# Durable Decisions

## DEC-001: Five-file authority model
- Active repo-owned Markdown is limited to `README.md`, `AGENTS.md`, `progress.md`, `docs/decisions.md`, and public `apps/client/public/skills.md`.
- `AGENTS.md` is the only normative internal implementation doc.
- Tool shims such as `CLAUDE.md` may point to the authority files, but they may not restate or redefine policy.

## DEC-002: Two-layer memory model
- `progress.md` is the only short-term memory layer.
- `docs/decisions.md` is the only durable prose memory layer.
- Durable structured truth should live in specs and contracts such as `docs/map-design/specs/map_spec.json`, `docs/map-design/shots.json`, and `apps/client/public/skills.md`.
- `artifacts/`, generated outputs, bundled skill docs, and external archive material are evidence only and are never authoritative.

## DEC-003: Map authority and runtime generation
- Map geometry authority order is `docs/map-design/specs/map_spec.json` -> `docs/map-design/refs/bazaar_slice_v2_2_detailed_birdseye.png` -> `docs/map-design/blockout/topdown_layout.svg`.
- `docs/map-design/shots.json` owns the runtime review shot contract.
- Map-design authority lives in structured files and approved refs, not prose packet docs.
- Runtime map data must be regenerated with `pnpm --filter @clawd-strike/client gen:maps`.
- Do not hand-maintain drift in `apps/client/public/maps/`.

## DEC-004: Public contract fairness boundary
- `apps/client/public/skills.md` is a browser-only public contract and must remain separate from internal process docs.
- The public contract must not expose coordinates, hidden enemy state, routes, seeds, landmark IDs, or other repo-only tactical truth.

## DEC-005: Validation boundary
- `pnpm qa:completion` is required for player-visible map or visual changes.
- If a task changes `/skills.md`, stable public selectors, agent-visible browser payload/state, or the documented no-context retry flow, also run `pnpm verify:skills-contract` and `pnpm smoke:no-context` regardless of the primary change tag.
- Screenshot and reference inspection are reserved for visual-signoff surfaces rather than logic-only gameplay, bot, perf, tooling, or contract work unless appearance intentionally changed.
- Current CI is narrower than local completion policy and does not replace these local gates.

## DEC-006: Play-facing quality bar
- Use Dust II-level production polish as the benchmark for play-facing work, without copying its layout.
- Favor readability over clutter, honest critique over comfort, and practical high-impact changes over vague ambition.
- Separate quick wins from larger rework when that distinction helps prioritization.

## DEC-007: Agent tooling stays out of the repo root surface
- Repo-local agent tooling is not game runtime code and is not part of the public `apps/client/public/skills.md` contract.
- Keep agent-only deploy or debug bundles outside the repo root unless agent-driven deploy or debug becomes an explicit repo workflow requirement.

## DEC-008: Hunt pressure prevents indefinite round stalling
- Bot behavior includes a "hunt pressure" system (`HUNT_ACTIVATION_S = 45`, `HUNT_FULL_S = 180`) that forces progressively more aggressive behavior over time within a round.
- Hunt pressure is independent of tier/difficulty — it ensures that no round can stall indefinitely regardless of how low the current difficulty is.
- Effects ramp continuously from 45s to 180s: OVERWATCH hold distance shrinks (18m → 1.8m), flank budgets grow, shared-knowledge trust rises, collapse scoring strengthens, and directive commit windows shorten.
- Hunt uses uncertain zone/node estimates with delayed squad sharing rather than exact player-coordinate injection. Full hunt must replan destinations into likely contact zones, not just relabel states.
- Zero-contact rounds must still bootstrap a believable search from enemy-spawn inference, cleared-zone elimination, and coordinated lane tasks; the squad may not wait forever for first sight or sound before beginning the hunt.
- This guarantees that idle or hidden players are eventually collapsed on without wallhack-like omniscience, which is required for both human gameplay feel and RL agent training signal.

## DEC-009: Layout reference catalog is generated evidence, not authority
- Fine-grained map naming authority for areas, frontages, walls, and corner callouts lives in `docs/map-design/specs/map_spec.json` under `layout_reference`.
- The human-readable catalog is generated into `docs/map-design/layout-reference.md` and `docs/map-design/layout-reference.svg` with `pnpm --filter @clawd-strike/client gen:layout-reference`.
- The generated catalog is reference evidence only. It must never outrank `docs/map-design/specs/map_spec.json`, `docs/map-design/shots.json`, or approved refs.

## DEC-010: Sitewide champion stays separate from local best
- The public agent contract keeps `score.best` scoped to the current browser context so local self-improvement loops and existing no-context agent behavior remain stable.
- The sitewide shared record is exposed separately as `sharedChampion`, shown on the loading screen and runtime score surfaces, and overwritten only by a strictly higher score.
- The shared record stores holder name, score, mode, and timestamp, but it is not a multi-entry leaderboard.

## DEC-011: Direct champion writes are internal-only
- `GET /api/high-score` remains public and read-only, but browser clients may no longer write arbitrary champion scores directly.
- Public champion submissions now use a server-issued run token plus a server-side validator over run summary stats before any overwrite attempt.
- Production defaults to public run submissions disabled until stronger anti-cheat verification is explicitly enabled; direct `POST /api/high-score` is reserved for internal admin use behind a secret.
