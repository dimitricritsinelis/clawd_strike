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
```

Use the canonical playtest URL recorded in `progress.md`.

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
- Map-design authority map: `docs/map-design/README.md`
- Public browser contract: `apps/client/public/skills.md`
