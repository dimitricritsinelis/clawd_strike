<!-- Save as: /Users/dimitri/Desktop/ClawdStrike_v2/artifacts/prompt-pack/P05_player_controller_aabb_collision.md -->

**Title:** CS/VAL-style movement (Shift-walk + jump) with stable AABB collision

**Read first:**
- `/Users/dimitri/Desktop/ClawdStrike_v2/AGENTS.md`
- `/Users/dimitri/Desktop/ClawdStrike_v2/progress.md`
- Blockout + colliders:
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/map/buildBlockout.ts`
- Runtime scaffolding:
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/game/Game.ts`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/input/PointerLock.ts`

**Goal (1 sentence):** Player can pointer-lock and traverse the blockout with CS/VAL-style movement (default run, **Shift-walk**, **jump**) using stable AABB-only collision with clean sliding and no tunneling at normal speeds.

**Non-goals:**
- Do NOT implement sprint, crouch, slide, or weapon systems.
- Do NOT implement multiplayer.
- Do NOT add complex physics engines.

**Implementation plan (file-specific, numbered):**
1) Dependencies: requires P04 wall colliders; keep collision and movement allocation-free per frame.
2) Add collision primitives + solver:
   - Add: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/sim/collision/Aabb.ts`
   - Add: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/sim/collision/Solver.ts`
   - Add: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/sim/collision/WorldColliders.ts`

   Requirements:
   - World collision uses axis-aligned AABBs only
   - dt clamp + substeps to avoid tunneling
   - Axis-separated resolution (x then z then y) to ensure stable sliding
   - Epsilon separation to avoid sticky corners
   - No per-frame allocations (reuse vectors/arrays)
3) Add player controller:
   - Add: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/sim/PlayerController.ts`

   Defaults (CS/VAL-inspired, but simple):
   - Player AABB: 0.6m wide × 1.8m tall
   - Eye height: 1.7m
   - Run speed: 6.0 m/s
   - Walk speed (Shift): 3.0 m/s
   - Jump enabled (choose gravity + jump velocity for ~1m jump)
   - No step-up behavior (flat-only)
4) Input bindings:
   - WASD move
   - Mouse look (yaw/pitch) under pointer lock
   - Shift = walk (hold)
   - Space = jump
5) Spawning:
   - Implement `?spawn=A|B` (default A)
   - Spawn positions derived from spawn plaza zone centers:
     - Spawn A faces north into bazaar
     - Spawn B faces south into bazaar
6) Wire into game loop:
   - Modify: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/game/Game.ts`

   Each frame:
   - gather input
   - step player controller with substeps
   - update camera from player
7) Minimal debug HUD when `debug=1`:
   - Add: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/debug/Hud.ts`

   Show:
   - position (x,y,z)
   - yaw/pitch
   - grounded
   - speed

   Notes:
   - default view must remain clean (HUD off unless requested).

**Acceptance checks (observable):**
- ✅ map loads via canonical URL
- ✅ movement + collision still works (or is newly added) (this prompt adds it)
- ✅ entire map remains traversable (no snagging at cuts, jog, connectors)
- ✅ blockout colors/readability improved (no regress)
- ✅ determinism preserved (movement stable; no frame-dependent drift)
- ✅ Shift-walk behaves like CS/VAL (slower silent walk; no sprint)
- ✅ Jump works; landing/grounding stable
- ✅ Player cannot escape playable bounds

**Validation (commands that exist):**
```bash
pnpm typecheck
pnpm build
```

Screenshots (exactly 2):
- `artifacts/screenshots/P05/before.png`
- `artifacts/screenshots/P05/after.png`

Reset & Open:
```bash
pnpm dev
```
Open:
- `http://127.0.0.1:5174/?map=bazaar-map&spawn=A`

Progress update (required):
- Update `progress.md` with:
  - Movement defaults (run/walk/jump)
  - Collision notes (substep settings, known snag points)
  - Next 3 tasks
