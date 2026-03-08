Audience: human
Authority: context
Read when: tooling, docs
Owns: quick start, basic command entry points, high-level repo map
Do not use for: workflow policy, current task status, durable decisions, public contract rules
Last updated: 2026-03-07

# Clawd Strike

Web-based FPS focused on refining the Bazaar slice into a production-quality playable experience.

Authority order: `AGENTS.md` -> `progress.md` -> the relevant spec or contract.

## Setup

```bash
pnpm install
pnpm dev
```

`pnpm dev` serves the client on port `5174` and generates runtime map files first.

## Common Commands

```bash
pnpm typecheck
pnpm build
pnpm test:playwright
pnpm qa:completion
pnpm smoke:no-context
pnpm verify:skills-contract
pnpm stats:admin -- --help
```

Use the canonical playtest URL recorded in `progress.md`.

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

## Directory Map
- `apps/client/src/runtime/`: gameplay runtime, simulation, rendering, HUD, weapons, bots
- `apps/client/src/loading-screen/`: boot flow and mode selection
- `apps/client/scripts/`: map generation, QA, smoke, and contract validation scripts
- `docs/decisions.md`: durable internal decisions
- `docs/map-design/`: Bazaar map packet, source specs, and approved references
- `apps/client/public/skills.md`: public browser-only contract served at `/skills.md`

## Authorities
- Internal policy: `AGENTS.md`
- Current branch state: `progress.md`
- Durable internal decisions: `docs/decisions.md`
- Map geometry authority: `docs/map-design/specs/map_spec.json`
- Map review shot contract: `docs/map-design/shots.json`
- Public browser contract: `apps/client/public/skills.md`
