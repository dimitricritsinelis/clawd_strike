# Prop/Asset Planning Prompt (Use with External Agent)

Use only files from this handoff bundle as source of truth. Do not infer geometry outside these files.

## Objective
Generate a deterministic prop orchestration plan for `bazaar-map` that can be implemented directly from anchors/zones.

## Required outputs
1. `prop_plan.csv` with one row per placement using the provided template columns.
2. `asset_backlog.csv` listing unique assets/prefabs required and estimated counts.
3. `placement_rules.md` summarizing any assumptions, constraints, and unresolved questions.

## Hard constraints
- Respect all rows in `derived/no_prop_areas.csv`.
- Never place props in `clear_travel_zone` areas.
- Preserve minimum path widths from `source/runtime_map_spec.json` constraints.
- Use anchor IDs from `derived/anchors.csv`; do not invent replacement IDs.
- Keep placement deterministic: same map + same seed => same placement rows.

## Placement guidance
- `shopfront_anchor`: storefront modules, counters, rugs, pottery frontage.
- `signage_anchor`: signs, awnings, hanging cloth elements.
- `cover_cluster`: crate/barrel/cart/sack clusters for gameplay cover.
- `spawn_cover`: low-risk safety cover near spawns without blocking exits.
- `service_door_anchor`: side-hall service-door facade dressing.
- `cloth_canopy_span`: overhead canopy spans using `pos` -> `endPos`.

## Validation checklist
- All placement rows reference valid anchor IDs.
- No row intersects `no_prop_areas`.
- Main-lane and side-hall path widths remain valid.
- Hero arch and well landmark readability is preserved.
