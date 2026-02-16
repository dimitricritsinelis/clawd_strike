# Modular Kit Specification (Recommended)

This defines a minimal modular kit to build the bazaar efficiently and consistently.

## Units
- All dimensions in **meters**.

## Primary Architectural Modules
### Walls
- Straight wall modules: **2m**, **4m**, **6m** lengths
- Wall height (typical): **6.0m**
- Thickness: **0.25–0.40m** (depends on engine collision strategy)

### Corners
- 90° inside corner module
- 90° outside corner module
- Optional “beveled” corner (for smoother movement around tight turns)

### Openings
- Door opening: **1.2m W x 2.4m H**
- Service door opening (side halls): **1.0m W x 2.2m H**
- Window opening: **1.0m W x 1.0m H** (sill at 1.2m)

### Shopfront Modules (Bazaar)
- Shopfront unit: **3.0m W x 3.5m H**
  - shutter/door variants: open, half-open, closed
  - optional 0.5m recess for depth

### Hero Arch Gate
- Opening width: **~9.0m**
- Vertical clearance: **≥ 6.0m**
- Depth/thickness: **1.0–1.5m**

## Dressing Modules
- Stall counter: **1.8m x 0.8m**
- Hanging sign: **0.8m W**
- Awning: **2.5m W**
- Cloth canopy strips: variable length; anchor to signage points + poles

## Collision Guidelines
- Prefer simplified collision hulls for clutter (pots, baskets).
- Ensure stall strip clutter does not protrude into clear travel zones.
- Avoid “micro-colliders” that snag player movement.

