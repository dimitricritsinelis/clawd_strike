<!-- Save as: /Users/dimitri/Desktop/ClawdStrike_v2/artifacts/prompt-pack/P01_human_to_gameplay_runtime.md -->

**Title:** Human → gameplay runtime bootstrap

**Read first:**
- `/Users/dimitri/Desktop/ClawdStrike_v2/AGENTS.md`
- `/Users/dimitri/Desktop/ClawdStrike_v2/progress.md`
- `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/main.ts`
- `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/loading-screen/types.ts`
- `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/loading-screen/bootstrap.ts`
- `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/index.html`
- `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/vite.config.ts`
- `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/package.json`
- `/Users/dimitri/Desktop/ClawdStrike_v2/package.json`

**Goal (1 sentence):** Clicking **Human** transitions from the loading screen into an active gameplay runtime (full-screen canvas + pointer lock), with a bright deterministic camera when `shot=compare`.

**Non-goals:**
- Do NOT implement map loading, blockout geometry, anchors, collision, props, multiplayer, weapons, economy, or abilities.
- Do NOT add heavy test harnesses or tooling.
- Gameplay feel reference: **CS:GO / Valorant** (no sprint; Shift is reserved for walk later).

**Implementation plan (file-specific, numbered):**
1) Dependencies: none; safe to run first and standalone.
2) Add Three.js dependency for rendering:
   - Modify: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/package.json`
   - Allow lockfile update: `/Users/dimitri/Desktop/ClawdStrike_v2/pnpm-lock.yaml`
3) Reintroduce a minimal runtime scaffold under `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/`:
   - Add: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/bootstrap.ts`
   - Add: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/game/Game.ts`
   - Add: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/render/Renderer.ts`
   - Add: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/input/PointerLock.ts`
   - Add: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/utils/UrlParams.ts`

   Requirements:
   - Create and attach a full-screen canvas to `#app`
   - Bright clear color (high-albedo neutral; avoid dark/red-heavy)
   - Simple lighting (ambient/hemi), **no shadows**
   - RAF loop renders continuously (no perf HUD yet)
4) Implement deterministic compare camera fallback (hardcoded; no JSON yet):
   - If URL has `shot=compare`, set camera:
     - `pos = (25, 55, 41)`
     - `lookAt = (25, 0, 41)`
     - `fov = 60`

   Notes:
   - These are Three.js world coords; they correspond to a topdown establishing compare view after converting design (x,y,z)→world (x,z,y).
5) Wire loading-screen handoff so Human boots runtime and hides loading UI:
   - Modify: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/main.ts` to call `bootstrapLoadingScreen({ handoff: { transitionToGame } })`
   - Ensure `transitionToGame()`:
     - boots runtime
     - hides `#start` overlay (and any other blocking UI)
6) Pointer lock:
   - In runtime, request pointer lock on user gesture (e.g., first click inside runtime)
   - If not locked, show a tiny runtime-owned overlay “Click to lock pointer”
7) Update `window.render_game_to_text` so automation/smoke checks can detect runtime state:
   - Include `{ gameplay: { active: true }, shot, mapId }` at minimum; keep it small.

**Acceptance checks (observable):**
- ✅ map loads via canonical URL (runtime boots; `map=` may be parsed but not used yet)
- ✅ movement + collision still works (or is newly added) (pointer lock works; movement may be stubbed)
- ✅ entire map remains traversable (N/A yet; do not regress)
- ✅ blockout colors/readability improved (bright runtime view)
- ✅ determinism preserved (`shot=compare` yields identical camera every load)
- ✅ Clicking Human reliably transitions into runtime (no stuck UI)
- ✅ No console spam per frame

**Validation (commands that exist):**
```bash
pnpm typecheck
pnpm build
```

Screenshots (exactly 2):
- `artifacts/screenshots/P01/before.png`
- `artifacts/screenshots/P01/after.png`

Reset & Open:
```bash
pnpm dev
```
Open:
- `http://127.0.0.1:5174/?map=bazaar-map&shot=compare`

Progress update (required):
- Update `progress.md` with:
  - Canonical URL updated to port 5174
  - MapId set to `bazaar-map`
  - Short structured bullets per AGENTS.md (no pasted logs)
