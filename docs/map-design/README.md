# Bazaar Slice v2.2 — Map Design Package (10P FPS)

This package contains the **engineering-grade** map layout + specifications for **Bazaar Slice v2.2** (3-lane marketplace).
It is intended to be consumed by **Codex** (or a level designer) to produce a blockout + final dressing pass.

## Quick Start (for Codex)
1. Open `specs/map_spec.json` (source of truth for geometry + anchors).
2. Use `blockout/topdown_layout.svg` + `refs/bazaar_slice_v2_2_detailed_birdseye.png` as the visual reference.
3. Implement blockout volumes per `zones` rects (units = meters).
4. Place props/shops **only** on `stall_strip` zones and at `prop_pocket` anchors.
5. Maintain **6.0m clear travel zone** through all main bazaar segments.

## Package Contents
### Visual references (`/refs`)
- `bazaar_slice_v2_2_detailed_birdseye.png` — **signed-off** detailed birds-eye (dimensions + legend + callouts).
- `bazaar_slice_v2_2_map_only.png` — map-only zoom.
- `bazaar_main_hall_reference.png` — reference look for the main bazaar hallway.
- `birdseye_example_v1.png` — prior example style reference (legacy).

### Specifications (`/specs`)
- `map_spec.json` — **single source of truth** (zones, dimensions, anchors, constraints).
- `dimension_schedule.csv` — all major dimensions.
- `anchor_points.csv` — all object placement anchors (shopfronts, signage, prop pockets, cloth spans, landmarks).
- `object_catalog.csv` — recommended prop types and placement rules.
- `callouts.csv` — suggested comms callouts.

### Legacy snapshots (read-only; not source-of-truth)
- `blockout_spec.json` — historical derived runtime snapshot kept for reference only.
- `anchors.json` — historical derived runtime snapshot kept for reference only.
- Runtime generation uses `specs/map_spec.json` and `shots.json`; do not edit legacy snapshots for gameplay changes.

### Blockout assets (`/blockout`)
- `topdown_layout.svg` — scaled topdown layout (10px/m).
- `zones.geojson` — zones as polygons (meters).
- `anchors.geojson` — anchors as points/lines (meters).

### Design + implementation notes (`/docs`)
- `design_brief.md`
- `implementation_steps.md`
- `acceptance_criteria.md`
- `codex_instructions.md`

## Coordinate System
- Origin **(0,0)** = **southwest** corner of playable boundary
- +X = east, +Y = north, +Z = up
- Yaw degrees: 0 = +Y (north), 90 = +X (east)

## Non-Goals / Exclusions
This package **does not** include engine-specific lighting rigs, materials, audio banks, or gameplay scripting.
It provides the level **layout + placement intent** so those can be generated/implemented consistently.
