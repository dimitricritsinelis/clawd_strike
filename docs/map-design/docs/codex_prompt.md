# Codex Prompt — Bazaar Slice v2.2 (Copy/Paste)

You are building a 10-player (5v5) FPS multiplayer map called **Bazaar Slice v2.2**.

## Inputs
- Geometry + anchors: `specs/map_spec.json`
- References: `refs/bazaar_slice_v2_2_detailed_birdseye.png` and `blockout/topdown_layout.svg`

## Task
1. Parse `map_spec.json` and generate a **greybox level**:
   - Create floor regions for each zone rectangle
   - Create walls where appropriate (default wall height 6.0m)
2. Enforce gameplay constraints:
   - Do not place any props that block zones of type `clear_travel_zone`
   - Maintain ≥ 6.0m navigable width through main bazaar clear zones
   - Maintain ≥ 3.0m navigable width through side halls
3. Place placeholder instances at anchors:
   - shopfront_anchor → shop shutter module
   - signage_anchor → hanging sign / awning
   - cover_cluster + spawn_cover → crates/barrels/planters clusters
   - cloth_canopy_span → overhead cloth mesh (with sag)
   - hero_landmark → arch gate module
   - landmark → well/fountain
4. Output a validation report:
   - Any prop/collision intruding into clear travel zones
   - Any nav width violations (main lane < 6m, side halls < 3m)

## Output Artifacts
- A “generated level” file for the engine (or an intermediate representation)
- A JSON report of validation results
- A topdown screenshot of the greybox for review

## Important Notes
- Units in the spec are **meters**
- Coordinate origin is the **southwest** map corner
- North is +Y
- If engine uses centimeters, multiply coordinates by 100.

