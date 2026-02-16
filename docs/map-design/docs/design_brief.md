# Design Brief — Bazaar Slice v2.2 (10 Players FPS)

## High-Level Intent
A compact **3-lane multiplayer map** set in a **warm stone bazaar district**:
- **Main lane:** wide bazaar hallway with shops + decorations along the sides
- **Side lanes:** two narrower service alleys (west/east) for flanks and rotations
- **Player count:** designed for **10 players (5v5)**

The map should support:
- Fast but readable engagements
- Reliable rotations between lanes
- Clear navigation landmarks (arch gate, mid well)

## Art / Setting Notes
- Material language: sun-baked stone, plaster, wood shutters, fabric awnings/canopies
- Dressing: rugs, pottery, sacks, produce crates, hanging signage, cloth banners overhead
- Lighting mood: warm, late-afternoon / golden-hour tones with cloth canopy shadow breakup

Reference: `refs/bazaar_main_hall_reference.png`

## Gameplay Pillars
### 1) Maintain a Clear Travel Zone
The center of the bazaar must remain continuously navigable:
- Main lane clear travel width: **6.0m**
- Stall strips remain **edge-only**; props must not intrude into the clear zone

### 2) Controlled Sightlines
Long LoS down main lane is controlled via:
- A **jog** in the main lane (BZ-M2)
- Prop pockets on edges to create cover timing
- Overhead canopy spans to introduce visual occlusion + lighting variation

### 3) Strong Rotations
Two cross-cuts at **mid** and **north** provide:
- Flank routes without overwhelming the main lane
- Quick rotation between alleys and bazaar to prevent stagnation

## Lane Roles
- **Main Bazaar:** primary engagements + readable mid-map control
- **West Hall:** close-quarters flank lane with intermittent cover pockets
- **East Hall:** close-quarters flank lane with intermittent cover pockets

## Landmarks
- **Hero Arch Gate:** north threshold; navigation anchor + pacing beat
- **Mid Well/Fountain:** mid-map LoS break + callout anchor

## Scale and Dimensions
Source of truth:
- `refs/bazaar_slice_v2_2_detailed_birdseye.png`
- `specs/map_spec.json`
- `specs/dimension_schedule.csv`

