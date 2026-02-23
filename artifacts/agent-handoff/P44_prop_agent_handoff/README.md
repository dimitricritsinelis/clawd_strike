# Bazaar Prop Handoff Pack (P44)

This bundle is intended for a separate planning/orchestration agent that will generate prop placement outputs for implementation.

## What to trust first
1. `source/runtime_map_spec.json` (current runtime truth used by the game).
2. `derived/anchors.csv` and `derived/zones.csv` (flattened for tooling).
3. `derived/no_prop_areas.csv` (hard keep-clear regions).
4. `refs/*.png` and `refs/topdown_layout.svg` (visual context).

## Why both runtime + design specs are included
- Runtime layout has diverged from the older design packet.
- See `source/design_vs_runtime_map_spec.diff` for exact differences.
- External planning should target runtime unless the map is intentionally being redesigned again.

## Coordinate/units contract
- Units are meters.
- Map data uses XY ground plane (`z` up in anchor positions).
- In client runtime, world movement is XZ ground plane (`y` up). Treat this as a coordinate remap concern at implementation time.

## Key counts (runtime)
- Zones: 24
- Anchors: 85
- Shopfront anchors: 34
- Signage anchors: 19
- Cover clusters: 10
- Spawn cover anchors: 4
- Service door anchors: 10
- Cloth canopy spans: 3

## Recommended workflow for external agent
1. Use `templates/prop_agent_prompt.md` as the working prompt.
2. Emit `prop_plan.csv` from `templates/prop_placement_plan.template.csv`.
3. Keep assumptions explicit in `placement_rules.md`.
4. If any anchor is ambiguous, keep the anchor ID and add note instead of inventing geometry.

## Canonical compare view
- URL: `http://127.0.0.1:5174/?map=bazaar-map&shot=compare&autostart=human&floors=pbr&lighting=golden`
- Camera metadata: `shots/compare_shot.json`
- Latest runtime visual example: `refs/latest_runtime_compare_view.png`
