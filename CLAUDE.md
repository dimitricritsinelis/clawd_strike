# CLAUDE.md — Claude Code Entry Point

## 1) Governing Documents (read in order)

Before any implementation work, read these in order:

1. **`AGENTS.md`** — Full agent instructions, contracts, MVP scope, prompt template
2. **`progress.md`** — Current state, last completed work, next 3 tasks, known issues
3. **`docs/map-design/specs/map_spec.json`** — Primary source of truth for map layout

> If these files conflict: `AGENTS.md` > `progress.md` > `map_spec.json`.

---

## 2) What this project is

**Clawd Strike** — a web-based first-person shooter (FPS) client with a playable blockout of the Bazaar Slice map.

**Current milestone:** Full-map blockout playtest (deterministic props + blockout colors) suitable for design approval. See `AGENTS.md §1` for exact scope.

**Tech stack:**
- TypeScript + Three.js (WebGL), Vite 6, pnpm monorepo
- Package manager: `pnpm` (not npm/yarn)
- Client app: `apps/client/`

---

## 3) Commands

```bash
pnpm dev          # Start dev server on localhost:5174 (runs gen:maps first)
pnpm typecheck    # TypeScript check (no emit)
pnpm build        # Production build (runs gen:maps first)

# Generate runtime map files from design spec:
pnpm --filter @clawd-strike/client gen:maps
```

**Canonical playtest URL:** `http://127.0.0.1:5174/?map=bazaar-map&autostart=human`

**Compare shot (deterministic camera):** `http://127.0.0.1:5174/?map=bazaar-map&shot=compare&autostart=human`

---

## 4) Repo layout

```
clawd-strike/
├── apps/client/src/runtime/   # All gameplay code
│   ├── map/                   # Map building (buildBlockout, wallDetailKit, etc.)
│   ├── game/                  # Game loop, weapons, AI, HUD
│   ├── sim/                   # Physics + collision (AABB only)
│   ├── render/                # Materials, shaders, libraries
│   ├── input/                 # Pointer lock, mouse
│   └── ui/                    # HUD components
├── apps/client/public/maps/   # Generated runtime map files (do not edit manually)
├── docs/map-design/           # Design packet (source of truth)
│   ├── specs/map_spec.json    # ← PRIMARY source of truth
│   ├── refs/                  # Visual reference PNGs
│   ├── blockout/              # SVG/GeoJSON layout
│   └── docs/                  # design_brief, acceptance_criteria, etc.
├── artifacts/screenshots/     # Before/after prompt screenshots
├── AGENTS.md                  # Full codex/agent instructions
├── progress.md                # Current status (read before every task)
└── README.md                  # Quick start + URL toggles
```

---

## 5) Coordinate system

- Runtime: **X/Z ground plane, Y up**, 1 unit = 1 metre, floor surface at y = 0
- Design packet: X/Y ground + Z up — translate when reading specs

---

## 6) Key architectural rules

- **AABB collision only** — no triangle mesh physics, no tunneling
- **Determinism** — same mapId + spec + seed → same geometry, spawns, props
- **InstancedMesh** for placeholder props — no per-prop draw calls
- **No per-frame allocations** in movement/collision/update loops — reuse vectors/quats
- **Small fixed material palette** — blockout colors are solid, no texture imports needed for MVP
- **gen:maps runs automatically** before `dev`/`build`/`preview` — never edit `public/maps/` by hand

---

## 7) Map generation pipeline

```
docs/map-design/specs/map_spec.json
        ↓  (gen:maps script)
apps/client/public/maps/bazaar-map/map_spec.json  ← runtime loads this
apps/client/public/maps/bazaar-map/shots.json
```

Anchors are embedded in `map_spec.json` — do not maintain a separate anchors file.

---

## 8) Debug URL toggles (useful for investigation)

| Toggle | Effect |
|--------|--------|
| `debug=1` | Player coords + yaw/pitch HUD |
| `anchors=1&labels=1` | Anchor overlay |
| `perf=1` | Performance HUD (materials, instanced meshes) |
| `high-vis=1` | Extra-bright blockout palette |
| `seed=<int>` | Deterministic prop variation |
| `spawn=B` | Spawn at B-side (default A) |
| `shot=compare` | Lock to deterministic screenshot camera |

---

## 9) Per-task loop (from AGENTS.md §8)

Every task must end with:
1. `pnpm typecheck` + `pnpm build` passing
2. Smoke test at canonical URL (spawn, pointer lock, move, collide, no console spam)
3. `before.png` / `after.png` at `artifacts/screenshots/<PROMPT_ID>/`
4. `progress.md` updated (tight bullets only — not a transcript)

---

## 10) What is out of scope until map is approved

Do **not** implement:
- Texture/LUT/decal ingestion pipelines
- Netcode or multiplayer
- Final performance budgets
- Heavy Playwright automation suites
- Final lookdev or art passes

See `AGENTS.md §1.3` and map approval definition in `AGENTS.md §10`.

---

## 11) Automation hooks (for scripted checks)

```js
window.render_game_to_text(): string   // JSON snapshot of current state
window.advanceTime(ms): Promise<void>  // Advance sim time deterministically
```

---

## 12) Known environment issues

- Headless Playwright WebGL context is unreliable — use headed browser for screenshots
- `gen:maps` emits expected clear-zone anchor warnings — not a bug
- Pointer-lock assertions are limited in CI (smoke script may report blocked pointer lock)
