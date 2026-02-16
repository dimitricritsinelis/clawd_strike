# Codex Instructions — Build Bazaar Slice v2.2 from Spec

## Goal
Generate an engine-ready **greybox level** (then first-pass dressing) from:
- `specs/map_spec.json` (zones + anchors)
- `specs/anchor_points.csv` (same anchors in tabular form)

## Required Outputs (Codex)
1. **Blockout geometry** for all zones
2. **Collision + navigation** respecting clear travel zones
3. **Placement of placeholder meshes** at anchors (shops, signs, prop pockets, canopies)
4. A repeatable “regen” script/pipeline (spec → level) so updates are cheap

## Parsing Rules
- Units are **meters**
- Coordinate origin: **SW corner** of playable boundary
- Treat every `rect` as a floor region and (optionally) a bounding volume
- Do **NOT** place any blocking props inside zones of type `clear_travel_zone`

## Zone Build Guidance
- `spawn_plaza`: open area with a few spawn safety props at `spawn_cover` anchors
- `main_lane_segment`: bazaar hall segment; add shopfront modules at shopfront anchors
- `stall_strip`: dressing-only strip; props can overlap within strip but must not intrude into clear zone
- `side_hall`: narrow corridor; keep 3.0m minimum clear corridor through path
- `cut` / `connector`: connectors between lanes; keep corners clean for movement

## Anchor Build Guidance
Anchor types and recommended placeholders:
- `shopfront_anchor` → shop shutter + doorway module (3m wide suggested)
- `signage_anchor` → hanging sign + optional awning
- `cover_cluster` → crates/barrels/carts cluster
- `spawn_cover` → planters + crates in spawn plazas
- `cloth_canopy_span` → a cloth mesh strip from start→end; add sag + variation
- `hero_landmark` → arch gate module
- `landmark` → well/fountain module

## Validation Steps (Codex must run)
- Confirm no prop collisions intersect `clear_travel_zone` polygons.
- Confirm navmesh has a continuous path through:
  - Main lane (south ↔ north)
  - West hall (south ↔ north)
  - East hall (south ↔ north)
- Confirm there are rotations via mid + north cuts.

## Suggested Folder Outputs
- `/GeneratedLevel/` — greybox geometry assets
- `/GeneratedLevel/Props/` — placeholder props instances
- `/GeneratedLevel/Reports/` — validation output (clear-zone violations, nav width checks)

## Notes
If your engine uses centimeters (e.g., Unreal), multiply meters by **100**.
If your engine uses a different up axis, remap accordingly (Z-up is assumed).

