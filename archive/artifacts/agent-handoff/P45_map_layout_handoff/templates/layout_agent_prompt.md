# Map Layout / Walls Analysis Prompt

Use only files in this bundle. Prioritize runtime files over legacy design files.

## Objective
Analyze and plan map layout/wall changes for `bazaar-map` without doing prop placement.

## Required outputs
1. `layout_change_plan.md` with specific zone or wall changes (IDs, coordinates, rationale).
2. `wall_change_list.csv` with additive/removal edits against `derived/wall_segments.csv`.
3. `risk_notes.md` covering traversal, line-of-sight, spawn safety, and collision risks.

## Hard constraints
- Keep map inside `playable_boundary`.
- Preserve minimum widths from `derived/layout_summary.json` (`min_path_width_main_lane`, `min_path_width_side_halls`).
- Maintain connectivity across both spawns and all three main lane segments.
- Preserve deterministic compare shot framing (`shots/compare_shot.json`) unless change explicitly requests camera update.

## Focus areas
- Zone dimensions and adjacency
- Walkable flow and choke geometry
- Wall segments and perimeter cage
- Landmark readability and clear approach areas

Do not include prop asset planning in this pass.
