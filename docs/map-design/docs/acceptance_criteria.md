# Acceptance Criteria — Bazaar Slice v2.2 (Engineering Sign-off)

These criteria define “done” for the initial map build before moving into polish.

## A) Layout / Dimensions (Pass/Fail)
- All zone rectangles match `specs/map_spec.json` (± 0.10m).
- Overall playable boundary is **50m x 82m**.
- Main bazaar segments match widths/lengths:
  - BZ_M1/BZ_M3: **9.5m x 18m**
  - BZ_M2_JOG: **8.5m x 18m** with **+2.0m east** centerline offset.
- Side halls are **4.5m wide** and continuous from y=10 to y=72.

## B) Navigation / Flow (Pass/Fail)
- Main lane clear travel zones (CLEAR_M1/2/3) remain unobstructed by:
  - stalls, shopfront meshes, dressing props, collision volumes
- Minimum navigable widths:
  - Main lane: **≥ 6.0m** continuous
  - Side halls: **≥ 3.0m** continuous
- Each spawn has ≥ 2 viable exits (center + at least one side route).

## C) Sightlines / Spawn Safety (Pass/Fail)
- No direct, uninterrupted line-of-sight from Spawn A to Spawn B.
- No single “power position” can cover:
  - both a spawn exit and both lane entrances simultaneously.
- Hero Arch does not create a hard spawn-trap on Gate Plaza.

## D) Cover Quality (Pass/Fail)
- Cover clusters exist at all marked prop pockets (or approved equivalents).
- No cover placement blocks lane traversal.
- Avoid dominant headglitch patterns:
  - If a cover piece becomes dominant, lower it or offset it from the primary sightline.

## E) Readability / Callouts (Pass/Fail)
- Callout anchors (Arch, Well, Mid Cut, North Cut) are visually distinct.
- Signage supports at least the 15 callouts in `specs/callouts.csv`.

## F) Packaging (Pass/Fail)
- Built map matches the signed birds-eye reference:
  - `refs/bazaar_slice_v2_2_detailed_birdseye.png`
- Build artifacts include updated topdown screenshot for review.

