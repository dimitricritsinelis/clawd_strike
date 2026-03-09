Audience: human
Authority: context
Read when: tooling, docs
Owns: quick start, basic command entry points, high-level repo map
Do not use for: workflow policy, current task status, durable decisions, public contract rules
Last updated: 2026-03-09

# Clawd Strike

Web-based FPS focused on refining the Bazaar slice into a production-quality playable experience.

## Setup

```bash
pnpm install
pnpm dev
```

`pnpm dev` serves the client on port `5174` and generates runtime map files first.

## Common Commands

```bash
pnpm stm -- show active
pnpm stm -- show card <id>
pnpm stm -- validate
pnpm typecheck
pnpm test:stm
pnpm test:server
pnpm test:agent-export
pnpm build
pnpm export:agent-starter -- --out ../clawd-strike-agent-starter
pnpm reconcile:shared-champion -- --help
pnpm test:playwright
pnpm qa:completion
pnpm smoke:no-context
pnpm verify:skills-contract
pnpm stats:admin -- --help
```

Use the canonical playtest URL from the current short-term memory snapshot.

## Admin Stats

Use the repo helper instead of hand-building `curl` commands:

```bash
export BASE_URL="http://127.0.0.1:5174"
export STATS_ADMIN_TOKEN="your-token"

pnpm stats:admin -- overview
pnpm stats:admin -- runs limit=25
pnpm stats:admin -- runs playerName=Dimitri championUpdated=true limit=10
pnpm stats:admin -- daily from=2026-03-08T00:00:00.000Z limit=7
```

Supported endpoints:
- `overview`
- `runs`
- `names`
- `daily`

Supported query keys:
- `from`
- `to`
- `controlMode`
- `mapId`
- `playerName`
- `limit`
- `cursor` for `runs`
- `championUpdated` for `runs`

The helper lives at `apps/client/scripts/admin-stats.sh` and pretty-prints JSON with `jq` when available.

In production, admin stats fail closed when `STATS_ADMIN_TOKEN` is missing.

## Shared Champion Recovery

Pull production envs locally, reconcile the schema/history against the unpooled Postgres URL, then use the admin stats helper for review:

```bash
vercel env pull .env.production.local --environment=production
pnpm reconcile:shared-champion -- --env-file .env.production.local --json
pnpm validate:shared-champion-constraints -- --env-file .env.production.local
BASE_URL="https://clawd-strike.vercel.app" STATS_ADMIN_TOKEN="your-token" pnpm stats:admin -- overview
```

Recommended sequence:
1. Run `pnpm reconcile:shared-champion -- --env-file .env.production.local --json`
2. Confirm `invalidChampionRows`, `invalidRunTokenNames`, and `invalidRunRows` are all `0`
3. Run `pnpm validate:shared-champion-constraints -- --env-file .env.production.local`
4. Review the reported `sslmode before/after` values and stats overview

## Agent Starter Export

The public agent starter kit lives in a separate git repository. Export the managed public-safe artifacts into a sibling checkout:

```bash
pnpm export:agent-starter -- --out ../clawd-strike-agent-starter
```

Optional guard when the remote exists:

```bash
pnpm export:agent-starter -- --out ../clawd-strike-agent-starter --expect-origin https://github.com/dimitricritsinelis/clawd-strike-agent-starter
```

The exporter manages only generated starter files such as the mirrored `skills.md`, starter code, CI workflow, and manifest. Keep README, troubleshooting docs, and issue templates in the separate repo itself.

## Directory Map
- `apps/client/src/runtime/`: gameplay runtime, simulation, rendering, HUD, weapons, bots
- `apps/client/src/loading-screen/`: boot flow and mode selection
- `apps/client/scripts/`: map generation, QA, smoke, and contract validation scripts
- `docs/decisions.md`: durable internal decisions
- `docs/map-design/`: Bazaar map packet, source specs, and approved references
- `apps/client/public/skills.md`: public browser-only contract served at `/skills.md`
