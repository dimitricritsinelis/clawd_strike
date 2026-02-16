# Implementation Steps (Blockout → Final) — Bazaar Slice v2.2

This is written as a **build checklist** for Codex or a level designer.

## 0) Inputs (Source of Truth)
- Geometry + anchors: `specs/map_spec.json`
- Visual reference: `refs/bazaar_slice_v2_2_detailed_birdseye.png`
- Scaled vector: `blockout/topdown_layout.svg`

## 1) Blockout Geometry (Greybox)
1. Create the playable boundary: **50m x 82m**
2. Create volumes for each zone (rectangles in `map_spec.json/zones`)
   - Spawn A (Courtyard), Spawn B (Gate Plaza)
   - Main bazaar segments: BZ_M1, BZ_M2_JOG, BZ_M3
   - West/East side halls: SH_W, SH_E
   - Cuts + connectors
3. Walls/ceilings:
   - Default wall height: **6.0m**
   - Default ceiling height: **8.0m** (open sky permissible in courtyard + plaza)
4. Ensure the bazaar clear travel zones are marked and unobstructed:
   - CLEAR_M1, CLEAR_M2, CLEAR_M3

## 2) Navigation / Collision Pass
- Bake navmesh (or equivalent) after blockout.
- Enforce minimum clear widths:
  - Main lane: **6.0m** continuous
  - Side halls: **≥ 3.0m** continuous
- Remove/adjust any geometry that produces snag points at:
  - Cut entrances
  - Connector thresholds
  - Jog corners

## 3) Cover + Prop Placement (First Pass)
Use `specs/anchor_points.csv`:
- Place **shopfront modules** at `shopfront_anchor`
- Place **signage/awning** at `signage_anchor`
- Place cover props at `cover_cluster` and `spawn_cover`
- Place overhead canopies at `cloth_canopy_span`

Rules:
- Stall props belong in `stall_strip` zones.
- Prop pockets should **shape fights** but **not** block lane traversal.
- Avoid creating dominant headglitch positions facing spawn exits.

## 4) Landmark Pass
- Place **Hero Arch Gate** at `LMK_HERO_ARCH_01`
- Place **Mid Well/Fountain** at `LMK_MID_WELL_01`
- Verify both landmarks are visible from key approaches without exposing spawns.

## 5) Art Dressing Pass (Second Pass)
- Add secondary clutter to stall strips: rugs, pottery, sacks, baskets
- Add fabric variety to canopies (holes, tears, different opacity)
- Add signage variety to support callouts (`specs/callouts.csv`)

## 6) Lighting / VFX / Audio (High Level)
- Use warm key light + soft bounce
- Use canopy shadows to break up monotony in the main lane
- Add subtle market ambience (not overpowering footsteps)

## 7) Playtest + Iterate
Run internal tests with 10 players:
- Verify rotations: mid + north cuts are used but not dominant
- Verify main lane is not a sniper tunnel (jog + props should break LoS)
- Verify spawns are not trapped by a single sightline

Acceptance criteria: `docs/acceptance_criteria.md`

