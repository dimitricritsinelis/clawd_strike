# AGENTS.md — Web FPS (MVP: Full Map Blockout + Playtest)

Always read these before responding to any new prompt/thread in this folder:
- `AGENTS.md` (this file)
- `progress.md` (current status + next tasks)
- `PROMPTS_MVP_BRANCH_v2.md` (prompt patterns + conventions)

> **This branch is MVP-first.** The goal is to make the game **buildable, runnable, and playtestable** while we iterate the map layout quickly.

---

## 1) What we are building

### 1.1 Game type
- **Genre:** First-Person Shooter (FPS)
- **Platform:** Web (client-only runtime for MVP)
- **Feel target:** tactical / CS-like pacing (readable lanes, meaningful cover, predictable sightlines)
- **Game type:** Counter Strike Go and Valorant are the style of game we are trying to develop

### 1.2 Current milestone (what “done” means right now)
**Playable full-map blockout** for the Bazaar Slice map:
- Load: `http://127.0.0.1:5173/?map=souk_vertical_slice`
- **Pointer lock + WASD + mouse look**
- **AABB-only collision** (stable sliding, no tunneling at normal speed)
- **Entire slice is traversable** (main bazaar street + west/east side streets + courtyard + arch endcap)
- **Blockout colors** to read regions (floors/walls/landmark/blockers)
- **Deterministic placeholder props** (simple instanced primitives) to help spatial readability

### 1.3 Explicit non-goals (do NOT do these during MVP blockout)
- Texture/material ingestion systems, LUTs, decals, “final look” rendering
- Golden multi-shot screenshot suites or heavy audit gates
- Server/netcode/multiplayer planning or implementation
- Perfect performance budgeting (only avoid obvious perf footguns)

If a task tries to pull these in, it’s **out of scope**.

---

## 2) Art direction (so the blockout matches the intended vibe)

**Reference:** `docs/map-design/Bazaar Asset Pack v1/ref-images/bazaar_reference_4k.png`

Target vibe: **sun-baked Middle Eastern / North African bazaar district**.

Use these cues to guide *blockout composition* (NOT final materials):
- **Landmark:** a strong **arch endcap** visible down the main corridor
- **Street rhythm:** breaks every **~8–14m** (jogs/alcoves/stall strips)
- **Proportions:** chunky, thick walls; layered facades later

Suggested blockout palette (placeholder only):
- Walls: warm sand / ochre
- Accents: teal/green (shutters), faded turquoise/rust (sign zones)
- Floor: darker stone/cobble tone (distinct from walls)
- Landmark: slightly higher contrast / brighter value so it reads

What to avoid (even in blockout):
- Long straight “test corridor” sightlines
- Paper-thin walls (creates sticky collision and unrealistic scale)

---

## 3) Design packet is authoritative (do not invent layout)

All map work is driven by:
`docs/map-design/Bazaar Asset Pack v1/docs/map-design/bazaar_slice_v1/`

For blockout MVP, every map prompt must reference the relevant subset of:
- `layout_spec.md` (dimensions + widths)
- `birdseye.svg` (or `birdseye.png`) (top-down intent)
- `anchors.json` (landmark + zones)
- `shot_list.md` (repeatable test shots)

If something is missing, **update the design packet data** (or add a runtime copy) rather than guessing.

---

## 4) Technical contracts (MVP)

### 4.1 Units + coordinates
- World axes: **X/Z = ground plane**, **Y up**
- **1 unit = 1 meter**
- Floor top surface at **`y = 0`**

### 4.2 Collision (must stay simple + debuggable)
- **AABB-only** colliders
- Walls must have thickness **≥ 0.3m**
- Player collision should **slide** cleanly (avoid sticky corners)

### 4.3 Determinism
- Same `map` id ⇒ same blockout ⇒ same spawns ⇒ same placeholder prop placements

### 4.4 Rendering rules for blockout
- Use **placeholder geometry** (boxes/planes) + **solid-color materials**
- Prefer “what you collide with is what you see” (collider-driven meshes)
- Use instancing for repeated placeholder props

### 4.5 Performance sanity (lightweight)
- Avoid obvious perf cliffs:
  - no per-frame allocations in movement/collision loops
  - reuse vectors/quats
  - don’t spawn thousands of unique materials

---

## 5) Per-prompt validation loop (non-negotiable)

### 5.1 Required commands (every prompt)
```bash
pnpm typecheck
pnpm build
```

### 5.2 Manual smoke test (30–60 seconds)
```bash
pnpm dev
open "http://127.0.0.1:5173/?map=souk_vertical_slice"
```
Verify:
- spawn works
- pointer lock works
- move/look works
- collide with walls/floor
- no console spam

### 5.3 Screenshots (exactly 2 per prompt)
- Capture **one** `before.png` (start of prompt)
- Capture **one** `after.png` (after validation passes)
- Use the same URL + same deterministic shot each time, e.g.:
  - `http://127.0.0.1:5173/?map=souk_vertical_slice&shot=blockout_compare`

Store at:
- `artifacts/screenshots/<PROMPT_ID>/before.png`
- `artifacts/screenshots/<PROMPT_ID>/after.png`

Return both images in chat at the very end of the prompt.

---

## 6) Codex prompt template (use verbatim)

**Title:** <one feature only>

**Context to read (only what’s relevant):**
- `AGENTS.md` (this file)
- `docs/map-design/Bazaar Asset Pack v1/docs/map-design/bazaar_slice_v1/<relevant files>`

**Goal (1 sentence):**
<player-visible outcome>

**Non-goals:**
- <explicit exclusions>

**Implementation steps (numbered, file-path specific):**
1. …
2. …

**Acceptance checks:**
- ✅ `pnpm typecheck` passes
- ✅ `pnpm build` passes
- ✅ <observable runtime checks>

**Screenshots (exactly 2):**
- `artifacts/screenshots/<PROMPT_ID>/before.png`
- `artifacts/screenshots/<PROMPT_ID>/after.png`

**Reset & Open:**
```bash
pnpm dev
open "http://127.0.0.1:5173/?map=souk_vertical_slice"
```
