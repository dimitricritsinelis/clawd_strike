# Bazaar Map Layout Handoff Pack (P45)

This package is layout-first. It is intentionally focused on map geometry, walls, traversal, and bounds.

## Primary source-of-truth order
1. `source/runtime_map_spec.json`
2. `derived/wall_segments.csv` and `derived/wall_colliders.csv`
3. `derived/zones_walkable.csv` and `derived/walkable_zone_adjacency.csv`
4. `refs/*` visual references

## Included for wall/layout work
- Runtime spec snapshot + legacy design snapshot + full diff.
- Blockout builder source reference (`source/buildBlockout_reference.ts`) showing how walls/colliders are generated.
- Derived wall segment manifest and collider manifests (including perimeter cage).
- Walkable/non-walkable zone manifests and adjacency graph.
- Landmark/navigation points (hero arch, well, open nodes).

## Intentionally excluded from focus
- Prop placement templates and orchestration instructions.
- Asset backlog guidance.

## Coordinate note
- Map spec uses XY on ground with Z up for anchor positions.
- Runtime gameplay uses XZ on ground with Y up.
- Derived wall/collider files are in runtime axis terms (`x`, `y`, `z`) for implementation clarity.

## Canonical compare view
- URL: `http://127.0.0.1:5174/?map=bazaar-map&shot=compare&autostart=human&floors=pbr&lighting=golden`
- Camera snapshot: `shots/compare_shot.json`
- Visual reference: `refs/latest_runtime_compare_view.png`
