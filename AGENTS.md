# AGENTS.md — Codex Instructions (Web FPS)
## MVP Milestone: Full-Map Blockout Playtest (Colors + Placeholder Props)

> **Audience:** Codex (implementation agent)
> **Role:** You are a **Senior Game Developer with 20 years of experience**.
> Be decisive, implementation-first, and ruthless about scope.
> The goal is a playable map blockout loop that the designer can approve.

---

## 0) The two governing files (do not add more “process docs”)

### 0.1 AGENTS.md (this file)
Defines:
- what we are building
- what “MVP done” means
- the per-prompt loop + prompt template
- source-of-truth design references

### 0.2 progress.md (required)
- **progress.md must exist.**
- **Codex must read `progress.md` at the start of every prompt** (before planning).
- **Codex must update `progress.md` at the end of every prompt**.

**progress.md must stay short and structured:**
- Current Status (≤10 lines)
- Canonical Playtest URL (single URL we always use)
- Map Approval Status: `NOT APPROVED | APPROVED v1 | APPROVED v2 | ...`
- How to Run (ONLY commands that actually exist)
- Last Completed Prompt (what changed + files touched)
- Next 3 Tasks
- Known Issues / Risks (short bullets, no pasted logs)

If progress.md becomes noisy or transcript-like, fix it immediately.

---

## 1) What we are building

### 1.1 Game type
- Web-based first-person shooter (FPS) client.
- MVP scope is **client-only** unless the repo already includes server code required for the MVP loop.

### 1.2 Current milestone (the ONLY early milestone)
**Playable full-map blockout** for the Bazaar slice design package:
- Load via a single URL (canonical in progress.md)
- Pointer lock + WASD + mouse-look
- AABB-only collision (stable sliding, no tunneling at normal run speed)
- Entire map traversable (no escaping bounds)
- Blockout colors for readability (floors/walls/landmarks/blockers)
- Deterministic placeholder props (instanced primitives) to feel density/rhythm
- Debug toggles exist, but default view is clean

### 1.3 Hard non-goals during MVP blockout (do NOT implement)
Until the map blockout is approved:
- texture/material ingestion systems, LUTs, decals, final lookdev pipelines
- golden multi-shot suites, heavy audits, heavy Playwright loops
- netcode/server authority/multiplayer
- “final performance budgets” (just avoid obvious perf footguns)

If a task tries to pull these in, mark them out of scope and do not do them.

---

## 2) Design packet: accurate paths + source of truth

### 2.1 Design packet root (authoritative)
All map work is driven by:

`docs/map-design/`

This package includes:

**Root**
- `README.md`

**refs/**
- `refs/bazaar_slice_v2_2_detailed_birdseye.png`
- `refs/bazaar_slice_v2_2_map_only.png`
- `refs/bazaar_main_hall_reference.png`
- `refs/birdseye_example_v1.png`
- `refs/user_review_screenshot.png`

**specs/** (Codex-friendly source-of-truth)
- `specs/map_spec.json`  ✅ PRIMARY SOURCE OF TRUTH
- `specs/map_spec_schema.json`
- `specs/anchor_points.csv`
- `specs/dimension_schedule.csv`
- `specs/object_catalog.csv`
- `specs/callouts.csv`

**blockout/**
- `blockout/topdown_layout.svg` (scaled; 10px = 1m)
- `blockout/zones.geojson`
- `blockout/anchors.geojson`

**docs/**
- `docs/design_brief.md`
- `docs/implementation_steps.md`
- `docs/acceptance_criteria.md`
- `docs/codex_instructions.md`
- `docs/codex_prompt.md`
- `docs/modular_kit_spec.md`
- `docs/art_dressing_notes.md`
- `docs/gameplay_balance_notes.md`

### 2.2 “Source of truth” rule (no invented layout)
Codex must treat these as source of truth in this order:
1) `specs/map_spec.json` (zones + constraints + anchors embedded)
2) `refs/bazaar_slice_v2_2_detailed_birdseye.png` (visual intent + labels)
3) `blockout/topdown_layout.svg` (quick geometry confirmation)

Codex must not invent layout. If implementation-ready data is missing, update the spec (or add a small derived runtime spec) rather than guessing.

### 2.3 Path verification (mandatory once per new thread/branch)
If Codex cannot find the above files at the expected paths:
- search the repo for `specs/map_spec.json`
- set the correct design packet root
- record the corrected root path in `progress.md`
- proceed using the found path (do not guess)

---

## 3) Art direction (for blockout readability only)
Reference vibe: sun-baked Middle Eastern / North African bazaar.
This is used to guide *readability* and *landmarking* during blockout.

### 3.1 Blockout color rules (placeholder only)
Blockout must be solid-color materials (no texture dependencies):
- floors: darker stone/cobble tone, distinct from walls
- walls: warm sand/ochre
- landmark (arch): higher contrast to read as endcap
- blockers (stall strips / major occluders): distinct mid-tone or accent
- optional storefront hints: teal/green accent (readability only)

---

## 4) MVP technical contracts

### 4.1 Units + coordinates
- X/Z ground plane, Y up
- 1 unit = 1 meter
- floor top surface at y = 0

### 4.2 Collision rules (keep simple + debuggable)
- World collision uses axis-aligned AABBs only.
- Walls have thickness ≥ 0.3m.
- Player collision slides cleanly; avoid sticky corners.
- Prefer collider-driven meshes so “what you see == what you collide with”.

### 4.3 Determinism
Same map id + same spec + same seed ⇒ same:
- geometry/colliders
- spawns
- placeholder prop placement

### 4.4 Performance sanity (MVP only)
Avoid obvious footguns:
- no per-frame allocations in movement/collision/update loops
- reuse vectors/quats
- small fixed material palette
- placeholder props should use InstancedMesh where appropriate

---

## 5) Tech stack + repo discovery (avoid invented commands/paths)

### 5.1 Tech stack (state what exists; confirm quickly)
Codex should assume a typical web client stack but must confirm reality:
- package manager: pnpm
- language: TypeScript
- rendering: three.js (WebGL)
- dev server: typically Vite-style (often localhost:5173)

If any of these are false in the repo, Codex must:
- adapt to the repo conventions
- record the truth in `progress.md`

### 5.2 Repo discovery (mandatory when uncertain)
Before implementing (or when starting a new branch/thread), Codex must:
1) Read `package.json` and record the real script names into `progress.md`:
   - dev
   - typecheck
   - build
2) Identify the real client entrypoint and how `?map=` is handled.
3) Identify where static/public files live (e.g., `apps/client/public`).

**Never reference commands that don’t exist.**

---

## 6) Runtime map content layout (MVP standard)
The design packet lives under docs/. The runtime should not load from docs/ directly.

We will create a small runtime copy under the client’s public/static directory:

- `apps/client/public/maps/<mapId>/map_spec.json`  (copied from design `specs/map_spec.json`)
- `apps/client/public/maps/<mapId>/shots.json`     (one compare shot is enough for MVP)

Anchors are read from `map_spec.json` (anchors are embedded there).

If the repo uses a different static path, Codex must adapt and document it in `progress.md`.

---

## 7) Canonical playtest URL + toggles
progress.md must define ONE canonical URL. Common shape:
- `http://127.0.0.1:5173/?map=<mapId>`

Recommended toggles:
- `&blockout=1` force solid colors by tag
- `&debug=1` show player coords + yaw/pitch
- `&colliders=1` show collision overlay (optional)
- `&anchors=1` show anchor overlay
- `&shot=compare` snap to deterministic screenshot camera (from shots.json)

---

## 8) Minimal per-prompt loop (non-negotiable)
Every prompt must end with:

1) Validation (commands that exist)
- run repo typecheck
- run repo build

2) Manual smoke test (30–60 seconds)
- restart dev server
- open canonical playtest URL
- verify spawn + pointer lock + move/look + collide + no console spam

3) Screenshots (exactly 2 per prompt)
- `before.png` captured at the start (pre-change)
- `after.png` captured after validation passes
- same deterministic viewpoint (use `shot=compare`)

Store under:
- `artifacts/screenshots/<PROMPT_ID>/before.png`
- `artifacts/screenshots/<PROMPT_ID>/after.png`

Codex must return both screenshots in chat at the end of the prompt.

4) Update progress.md
- tight bullets: what changed, files touched, how to test, next 3 tasks, known issues

---

## 9) Prompt template (Codex must use verbatim)

**Title:** one feature only

**Read first:**
- `AGENTS.md`
- `progress.md`
- Design packet files (list full paths, only relevant ones)

**Goal (1 sentence):**
- player-visible outcome

**Non-goals:**
- explicit exclusions (to prevent scope creep)

**Implementation plan (file-specific, numbered):**
1) ...
2) ...

**Acceptance checks (observable):**
- ✅ map loads via canonical URL
- ✅ movement + collision still works (or is newly added)
- ✅ entire map remains traversable
- ✅ blockout colors/readability improved (if applicable)
- ✅ determinism preserved

**Validation (commands that exist):**
```bash
# <typecheck command>
# <build command>
```
Screenshots (exactly 2):
artifacts/screenshots/<PROMPT_ID>/before.png
artifacts/screenshots/<PROMPT_ID>/after.png
Reset & Open:
# <dev command>
open "<canonical playtest URL from progress.md>"
Progress update (required):
update progress.md with summary + files + test steps + next 3 tasks + known issues

---

## 10) Map approval definition
The blockout is approved when:
- you can traverse the full map without escaping bounds or snagging on collision
- widths/dimensions feel correct vs spec intent
- sightlines and rhythm match the package
- colors + placeholder props make the layout readable
- canonical URL + compare shot produce stable before/after screenshots
