<!-- Save as: /Users/dimitri/Desktop/ClawdStrike_v2/artifacts/prompt-pack/P02_generate_runtime_jsons.md -->

**Title:** Generate runtime JSONs (map_spec → public/maps/bazaar-map)

**Read first:**
- `/Users/dimitri/Desktop/ClawdStrike_v2/AGENTS.md`
- `/Users/dimitri/Desktop/ClawdStrike_v2/progress.md`
- Source of truth:
  - `/Users/dimitri/Desktop/ClawdStrike_v2/docs/map-design/specs/map_spec.json`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/docs/map-design/specs/map_spec_schema.json`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/docs/map-design/shots.json`
- Runtime/public expectations:
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/public/`

**Goal (1 sentence):** Add a Node-based generator + validator that derives runtime JSONs from `map_spec.json` and writes them to `apps/client/public/maps/bazaar-map/`, auto-running on `pnpm dev`.

**Non-goals:**
- Do NOT load runtime JSON directly from `docs/` at runtime.
- Do NOT hand-edit the runtime JSON outputs (they must be generated).
- Do NOT add heavy schema/validation frameworks unless absolutely necessary.

**Implementation plan (file-specific, numbered):**
1) Dependencies: can run after P01; safe standalone but will touch dev scripts.
2) Add generator script (Node/ESM):
   - Add: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/scripts/gen-map-runtime.mjs`

   Responsibilities:
   - Read: `/Users/dimitri/Desktop/ClawdStrike_v2/docs/map-design/specs/map_spec.json`
   - Read: `/Users/dimitri/Desktop/ClawdStrike_v2/docs/map-design/shots.json`
   - Write (create dirs as needed):
     - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/public/maps/bazaar-map/blockout_spec.json`
     - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/public/maps/bazaar-map/anchors.json`
     - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/public/maps/bazaar-map/shots.json`
3) Derivation rules (NO INVENTED LAYOUT):
   - `blockout_spec.json` must be derived strictly from `map_spec.json`:
     - playable boundary rect
     - defaults (wall height, ceiling height, floor height)
     - all zones with `{id,type,rect,label,notes}`
     - constraints `{min_path_width_main_lane, min_path_width_side_halls}`
   - `anchors.json` derived strictly from `map_spec.json.anchors`:
     - Convert to `{id,type,zone,pos:{x,y,z},yawDeg,endPos?,widthM?,heightM?,notes?}`
     - Stable ordering: sort by `id`
   - `shots.json` comes from design `/docs/map-design/shots.json`, but ensure a canonical compare shot exists:
     - If missing, inject:
       - `id: "SHOT_BLOCKOUT_COMPARE"`
       - camera = same as design topdown establishing (conversion handled in runtime)
     - Keep `shot=compare` alias expectation (runtime will resolve it later)
4) Validation (lightweight, fast):
   - Fail (exit non-zero) on:
     - missing playable boundary
     - negative/zero widths/heights
     - duplicate zone ids or anchor ids
     - unknown zone types / anchor types (compared to what exists in the spec)
   - Warn (console warn, but succeed) on:
     - anchors that lie inside any `clear_travel_zone` rect (print anchor id + type + clear zone id)
5) Hook generator into dev:
   - Modify: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/package.json`
   - Add scripts:
     - `gen:maps`: `node scripts/gen-map-runtime.mjs`
     - `predev`: `pnpm gen:maps`

   Notes:
   - Ensure `pnpm dev` runs this before Vite starts.
6) Keep JSON output stable:
   - Use 2-space indentation
   - End files with newline
   - Sort arrays for deterministic diffs

**Acceptance checks (observable):**
- ✅ map loads via canonical URL (runtime still boots from P01)
- ✅ movement + collision still works (or is newly added) (do not regress runtime boot)
- ✅ entire map remains traversable (N/A yet; do not regress)
- ✅ blockout colors/readability improved (no regress)
- ✅ determinism preserved (generator outputs stable JSON ordering)
- ✅ After `pnpm dev`, these exist and are non-empty:
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/public/maps/bazaar-map/blockout_spec.json`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/public/maps/bazaar-map/anchors.json`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/public/maps/bazaar-map/shots.json`

**Validation (commands that exist):**
```bash
pnpm typecheck
pnpm build
```

Screenshots (exactly 2):
- `artifacts/screenshots/P02/before.png`
- `artifacts/screenshots/P02/after.png`

Reset & Open:
```bash
pnpm dev
```
Open:
- `http://127.0.0.1:5174/?map=bazaar-map&shot=compare`

Progress update (required):
- Update `progress.md` with:
  - Canonical playtest URL = `http://127.0.0.1:5174/?map=bazaar-map&shot=compare`
  - Files touched (generator + public outputs path)
  - Known issues/warnings (e.g., anchors inside clear zones) as short bullets
