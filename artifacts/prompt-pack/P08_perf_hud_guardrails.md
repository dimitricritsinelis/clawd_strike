<!-- Save as: /Users/dimitri/Desktop/ClawdStrike_v2/artifacts/prompt-pack/P08_perf_hud_guardrails.md -->

**Title:** Perf HUD + performance guardrails (instancing, materials, DPR cap)

**Read first:**
- `/Users/dimitri/Desktop/ClawdStrike_v2/AGENTS.md`
- `/Users/dimitri/Desktop/ClawdStrike_v2/progress.md`
- Renderer + game loop:
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/render/Renderer.ts`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/game/Game.ts`

**Goal (1 sentence):** Add lightweight performance instrumentation (perf HUD) and enforce MVP guardrails (DPR cap, no shadows, material limits, instancing expectations).

**Non-goals:**
- Do NOT add heavy profiling libraries.
- Do NOT add post-processing.
- Do NOT implement “final performance budgets”; just avoid obvious footguns.

**Implementation plan (file-specific, numbered):**
1) Dependencies: best after P04 (geometry) and P07 (props), but can be implemented earlier.
2) Add perf HUD:
   - Add: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/debug/PerfHud.ts`

   Display:
   - FPS + ms/frame
   - `renderer.info.render.calls`
   - triangles
   - geometries / textures counts
   - instanced mesh counts (if tracked)
3) Add toggles (clean default):
   - URL param `perf=1`
   - Keybind F5 (only when debug enabled)
4) Enforce renderer guardrails:
   - Modify: `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/src/runtime/render/Renderer.ts`

   Rules:
   - Cap DPR (e.g., `Math.min(devicePixelRatio, 2)`)
   - Ensure shadows off by default
   - Ensure materials reused (no accidental per-frame material creation)
5) Optional budget warnings (non-fatal):
   - If draw calls > 140 with debug off, show a small warning in perf HUD (do not spam console)

**Acceptance checks (observable):**
- ✅ map loads via canonical URL
- ✅ movement + collision still works (or is newly added) (no regress)
- ✅ entire map remains traversable (no regress)
- ✅ blockout colors/readability improved (no regress)
- ✅ determinism preserved
- ✅ `&perf=1` shows perf HUD with live, sane numbers
- ✅ No console spam per frame

**Validation (commands that exist):**
```bash
pnpm typecheck
pnpm build
```

Screenshots (exactly 2):
- `artifacts/screenshots/P08/before.png`
- `artifacts/screenshots/P08/after.png`

Reset & Open:
```bash
pnpm dev
```
Open:
- `http://127.0.0.1:5174/?map=bazaar-map&shot=compare&perf=1`

Progress update (required):
- Update `progress.md` with:
  - Perf HUD toggle + what metrics are shown
  - Any current bottlenecks discovered (short bullets)
