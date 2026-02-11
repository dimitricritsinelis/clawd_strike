# Decisions (2026-02-11)

## Massive Art Overhaul

1. **Full map rebuild, same map id**
   - Kept `dust2_slice` id stable for protocol/runtime compatibility.
   - Re-authored bounds, colliders, points, spawns, and bombsites for broader tactical space.

2. **Collision-first architecture with visual layering**
   - Gameplay collision remains authoritative and AABB-only from `MapDef.colliders`.
   - Client visuals now layer facade trim/cornices/signage/tarps/cables/lanterns and instanced dressing on top.

3. **Deterministic procedural material system**
   - Added seeded procedural PBR texture generation for base color + roughness + normal.
   - Material identity tied to stable seed keys for reproducibility.

4. **Strict performance posture**
   - Introduced shared material library caching and instanced props to constrain draw/material growth.
   - Added render diagnostics in `render_game_to_text` (`drawCalls`, `triangles`, `materials`).

5. **AK viewmodel is visual-only**
   - Added deterministic first-person AK mesh with idle/move/recoil animation.
   - No gameplay-stat changes; server-authoritative weapon simulation unchanged.

6. **Playwright loop compatibility**
   - Preserved `window.advanceTime(ms)` and `window.render_game_to_text` contracts.
   - Added favicon assets to remove recurring 404 console noise during automated runs.

7. **Fallback mode retained**
   - WebGL fallback remains for environments where context creation fails.
   - `render_game_to_text` now flags `fallbackMode` for clear artifact interpretation.
