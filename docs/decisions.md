Audience: human, implementation-agent
Authority: normative
Read when: map, visuals, ai, gameplay, ui, public-contract, perf, tooling, docs
Owns: durable internal decisions that future tasks should not rediscover
Do not use for: current task status, temporary bug lists, per-task notes, public browser-agent behavior details
Last updated: 2026-03-10

# Durable Decisions

## DEC-001: Authority surfaces are role-based
- `AGENTS.md` is the only normative internal implementation doc.
- One current short-term memory surface owns active coordination state, and `docs/decisions.md` owns durable internal decisions.
- `README.md` is quick start only, `docs/map-design/layout-reference.md` is generated reference evidence, and `apps/client/public/skills.md` is the public browser-only contract.
- Tool shims such as `CLAUDE.md` may point to authority surfaces, but they may not restate or redefine policy.

## DEC-002: Structured truth outranks prose summaries
- Durable structured truth lives in specs and contracts such as `docs/map-design/specs/map_spec.json`, `docs/map-design/shots.json`, and `apps/client/public/skills.md`.
- Generated views, artifacts, bundled skill docs, and other evidence surfaces are never authoritative over their owning specs and contracts.
- Prefer code, scripts, specs, and runtime contracts over new prose when they can answer the question.

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
- Default fast local validation is `pnpm typecheck && pnpm test:server && pnpm smoke:game`.
- `pnpm qa:completion` is required for player-visible map or visual changes and now covers traversal plus deterministic shot review only.
- `pnpm --filter @clawd-strike/client bot:smoke` is required for enemy tuning and remains part of `pnpm qa:release` alongside `pnpm qa:completion` and `pnpm build`.
- If a task changes `/skills.md`, stable public selectors, agent-visible browser payload/state, or the documented no-context retry flow, also run `pnpm verify:skills-contract` and `pnpm smoke:no-context` regardless of the primary change tag.
- `pnpm test:playwright` remains the full browser regression suite for loading-screen, public-selector, public-payload, and shared-champion work rather than the default inner-loop gate.
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
- Bot behavior includes a "hunt pressure" system (`HUNT_ACTIVATION_S = 10`, `HUNT_FULL_S = 30`) that forces progressively more aggressive behavior over time within a round.
- Hunt pressure is independent of tier/difficulty — it ensures that no round can stall indefinitely regardless of how low the current difficulty is.
- Effects ramp continuously from 10s to 30s: OVERWATCH hold distance shrinks (18m → 1.8m), flank budgets grow, shared-knowledge trust rises, collapse scoring strengthens, and directive commit windows shorten.
- The search-phase ladder now compresses with that same window: caution before 10s, probe/sweep/collapse during the 10-30s ramp, and pinch at 30s full hunt.
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
- Public run submissions stay enabled by default once the validated run-token flow exists; `SHARED_CHAMPION_ENABLE_PUBLIC_RUNS=false` is an emergency kill switch, and direct `POST /api/high-score` remains internal admin-only behind a secret.

## DEC-012: Validated run history is private server-side data
- Every accepted validated run is persisted as a first-class server-side run record rather than only as audit JSON or the single shared champion row.
- Public browser/game contracts stay unchanged; run history is exposed only through protected internal admin stats endpoints, not through `/skills.md` or public runtime payloads.
- Client/network metadata for stats storage uses privacy-preserving HMAC fingerprints, not raw IP addresses or raw user-agent strings.

## DEC-013: Shared champion storage accepts standard provider URL aliases
- Shared champion server routes prefer explicit overrides (`POSTGRES_WRITE_URL`, `POSTGRES_READ_URL`) but must also accept standard marketplace/provider aliases such as `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `DATABASE_URL`, and `NEON_DATABASE_URL`.
- Production compatibility with deployment-provided aliases is required for the public champion surface; do not narrow production back to a single env var name.
- The resolver behavior is covered by a server-side regression test and CI job so deploy-time config assumptions fail before release.

## DEC-014: Production shared-champion ops use explicit envs and fail-closed stats auth
- Production deployments should set explicit `POSTGRES_WRITE_URL` and `POSTGRES_READ_URL` even though runtime alias fallback remains supported for compatibility.
- Admin stats must fail closed in production when `STATS_ADMIN_TOKEN` is missing; the built-in fallback token is development-only.
- Shared champion schema/history reconciliation runs through a dedicated operator command using an unpooled Postgres URL rather than relying on the first live request to bootstrap storage.

## DEC-015: Public agent starter kit is a separate repo fed by one-way export
- The public agent starter kit lives in a separate git repository with its own history, package metadata, README, issue templates, and CI.
- The game repo remains authoritative for the live `/skills.md` contract, the public browser/runtime API, and the export logic that produces starter artifacts.
- Export flow is one-way from the game repo into the starter repo. The game runtime must not import from the starter repo, and the starter repo must not become a workspace package, submodule, or subtree of the game repo.
- The exporter manages only public-safe generated files such as the mirrored `skills.md`, starter helper code, CI workflow, and manifest/checksums. Human-facing repo docs and issue templates stay owned in the separate repo.

## DEC-016: Shared champion Postgres URLs normalize legacy SSL modes to verify-full
- Shared champion Postgres URLs may arrive from provider env vars with legacy `sslmode=prefer`, `sslmode=require`, or `sslmode=verify-ca`.
- Repo runtime behavior should normalize those modes to `sslmode=verify-full` before handing the URL to `pg`, preserving the repo’s current strict certificate-validation intent while avoiding the current driver warning.
- Production operators should validate shared-champion DB constraints through a dedicated command after reconcile reports a clean database, instead of relying on reconcile side effects.

## DEC-017: Buff-orb visuals must scale without dynamic per-orb lights
- Runtime buff orbs should preserve their glowing pickup readability, but they must render through pooled shared resources rather than per-orb scene graphs with dynamic lights and per-instance material allocation.
- Idle runtime performance and orb-scaling performance are both first-class perf surfaces; orb perf validation must include zero-orb baseline plus multi-count orb scenarios rather than a single fixed orb count.
- Future orb-look changes should preserve that scalability boundary unless a new owning perf decision explicitly replaces it.
