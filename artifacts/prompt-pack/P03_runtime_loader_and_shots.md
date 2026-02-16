<!-- Save as: /Users/dimitri/Desktop/ClawdStrike_v2/artifacts/prompt-pack/P03_runtime_loader_and_shots.md -->

**Title:** Runtime loader fetch() + shot=compare (shots.json)

**Read first:**
- `/Users/dimitri/Desktop/ClawdStrike_v2/AGENTS.md`
- `/Users/dimitri/Desktop/ClawdStrike_v2/progress.md`
- Runtime boot:
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/bootstrap.ts`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/utils/UrlParams.ts`
- Runtime assets (from P02):
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/public/maps/bazaar-map/blockout_spec.json`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/public/maps/bazaar-map/anchors.json`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/public/maps/bazaar-map/shots.json`

**Goal (1 sentence):** Runtime fetches `blockout_spec.json`, `anchors.json`, and `shots.json` based on `?map=`, and supports deterministic camera snapping via `shot=compare` or `shot=<SHOT_ID>`.

**Non-goals:**
- Do NOT build blockout geometry yet.
- Do NOT implement collision or movement yet.
- Do NOT add heavy debug UIs; keep overlays minimal.

**Implementation plan (file-specific, numbered):**
1) Dependencies: requires P01 runtime scaffold and P02 generated public JSONs.
2) Add strict runtime types + parsing guards:
   - Add: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/map/types.ts`
   - Define TS types for `blockout_spec`, `anchors`, `shots`
   - Implement runtime validation (throw readable errors on missing fields)
3) Implement loader that fetches the three JSONs:
   - Add: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/map/loadMap.ts`

   Fetch URLs:
   - `/maps/${mapId}/blockout_spec.json`
   - `/maps/${mapId}/anchors.json`
   - `/maps/${mapId}/shots.json`

   On failure:
   - Show minimal runtime-owned error overlay containing the failing URL + HTTP status/message.
4) Implement shot system:
   - Add: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/map/shots.ts`

   Behavior:
   - If `shot=compare`:
     - resolve to `SHOT_BLOCKOUT_COMPARE` (must exist in shots.json after P02)
   - If `shot=<id>`:
     - use it if present; otherwise show a warning overlay and fall back to runtime hardcoded compare camera from P01

   When applying shot:
   - set camera position/lookAt/fov from JSON (convert design (x,y,z)→world (x,z,y))
   - optionally freeze player input while a shot is active (for deterministic screenshots)
5) Wire loader + shots into runtime bootstrap:
   - Modify: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/bootstrap.ts` (or `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/game/Game.ts`)

   Startup order:
   - parse URL params (`map`, `shot`)
   - `await loadMap(mapId)`
   - apply shot if present
6) Update `window.render_game_to_text` to include loaded state:
   - Include `{ map: { loaded: true, mapId }, shot: { active, id }, gameplay: { active: true } }`

**Acceptance checks (observable):**
- ✅ map loads via canonical URL (runtime fetches JSONs successfully)
- ✅ movement + collision still works (or is newly added) (not implemented yet; do not regress runtime)
- ✅ entire map remains traversable (N/A yet; do not regress)
- ✅ blockout colors/readability improved (no regress)
- ✅ determinism preserved (`shot=compare` snaps camera identically every load)
- ✅ Missing JSON produces readable error overlay (not silent)
- ✅ No console spam per frame

**Validation (commands that exist):**
```bash
pnpm typecheck
pnpm build
```

Screenshots (exactly 2):
- `artifacts/screenshots/P03/before.png`
- `artifacts/screenshots/P03/after.png`

Reset & Open:
```bash
pnpm dev
```
Open:
- `http://127.0.0.1:5174/?map=bazaar-map&shot=compare`

Progress update (required):
- Update `progress.md`:
  - Confirm runtime now fetches JSONs from `/maps/bazaar-map/`
  - Document shot behavior (`shot=compare` + explicit IDs)
  - Keep Next 3 Tasks updated
