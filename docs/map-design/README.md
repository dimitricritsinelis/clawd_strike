Audience: human, implementation-agent
Authority: normative
Read when: map, visuals, gameplay
Owns: map-design authority map, source-of-truth order, approved reference pack, runtime generation entrypoints
Do not use for: repo workflow, bot policy, scoring policy, public agent contract rules, task history
Last updated: 2026-03-07

# Bazaar Map Design Authority

Current approved packet version: `2.3`
Current runtime map id: `bazaar-map`
Current map approval status: see `progress.md` for the live state; it is currently `NOT APPROVED`.

## Authoritative Files
- Geometry, zones, anchors, and constraints: `specs/map_spec.json`
- Runtime review shot contract: `shots.json`
- Approved reference pack:
  - `refs/bazaar_slice_v2_2_detailed_birdseye.png`
  - `refs/bazaar_slice_v2_2_map_only.png`
  - `refs/bazaar_main_hall_reference.png`

## Authority Order
1. `specs/map_spec.json` for measurable layout truth
2. `refs/bazaar_slice_v2_2_detailed_birdseye.png` for signed visual and layout intent when the JSON needs visual clarification
3. `blockout/topdown_layout.svg` for scaled sanity checks only

## Context-Only Files
- `blockout/topdown_layout.svg`
- `blockout/zones.geojson`
- `blockout/anchors.geojson`
- helper CSVs under `specs/`
- `refs/user_review_screenshot.png`

These files may inform implementation, but they do not outrank the authority order above.

## Archive And History
- External archive material and generated review artifacts are historical evidence only.
- Historical files must never override `specs/map_spec.json`, `shots.json`, or the approved reference pack.

## Runtime Pipeline
- Edit the design packet here.
- Regenerate runtime copies with `pnpm --filter @clawd-strike/client gen:maps`.
- Runtime consumes:
  - `apps/client/public/maps/bazaar-map/map_spec.json`
  - `apps/client/public/maps/bazaar-map/shots.json`
