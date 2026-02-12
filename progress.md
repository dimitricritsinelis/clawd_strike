Original prompt: Scaffold monorepo + core game loop (single map, 5v5 with bots)

Goal: Stand up a pnpm monorepo (apps/client, apps/server, packages/shared, packages/engine) and implement a minimum playable authoritative FPS loop (three.js client + Colyseus server): join via browser, spawn on Dust2-slice map with 9 bots (5v5), WASD+mouse look (pointer lock), AK-47 with learnable recoil and movement inaccuracy, headshot multiplier, die/respawn. Determinism-first, fixed 60Hz server tick, AABB-only collision, procedural materials, no imported assets.

Notes / TODOs:
- `ref-images/` is present (was originally misnamed with a space; renamed to match `AGENTS.md`).

Plan (current chunk):
- Scaffold pnpm workspace + TS/Lint/Test wiring so root scripts work.
- Create `packages/shared` with MapDef + `dust2_slice` map source-of-truth.
- Create `packages/engine` with deterministic sim primitives (tick, movement, AABB collision, weapon recoil).
- Stand up `apps/server` (Colyseus room, 60Hz authoritative sim, bots, snapshots).
- Stand up `apps/client` (Vite + three.js, pointer lock FPS controller, prediction/reconciliation, render MapDef, HUD).
- Add Playwright smoke using the provided `$WEB_GAME_CLIENT` (needs `window.render_game_to_text`).

Progress updates:
- Fixed the user-reported Vite import error by adding missing runtime module: `apps/client/src/runtime/Game.ts`.
- Added strict project-reference-compatible TS build config (declaration emit in referenced projects), fixed multiple strict-TS issues, and added `@types/node` + `@types/three`.
- Added baseline Vitest tests:
  - `packages/shared/src/sim/rng.test.ts`
  - `packages/shared/src/maps/maps.test.ts`
- Build checks now pass:
  - `pnpm typecheck` ✅
  - `pnpm lint` ✅
  - `pnpm test` ✅
- Playwright smoke loop (`$WEB_GAME_CLIENT`) executed repeatedly.
  - In this desktop/headless environment, WebGL context creation fails (ANGLE/SwiftShader), so client now falls back to deterministic 2D diagnostic rendering in `Game`.
  - Playwright still halts after first iteration due first new console error; currently this is a 404 asset fetch from dev tooling, not gameplay logic.

Open TODOs / next agent:
- Continue implementing missing scope from user prompt (client/server currently scaffold + partial loop, not complete feature parity).
- Investigate and remove remaining Playwright console 404 so multi-iteration runs can complete without early break.
- Run full manual browser validation with real GPU context (WebGL path) for pointer-lock + FPS camera feel.

## 2026-02-11 (chunk 1: map rebuild)
- Rebuilt `dust2Slice` layout/bounds/colliders/spawns/bombsites/points for full-map overhaul target.
- Expanded map invariants tests (spawn safety, bombsite-solid non-intersection, required points).
- Added nav connectivity test `packages/engine/src/sim/navgrid.map.test.ts` for route guarantees.

## 2026-02-11 (chunk 2: world renderer overhaul)
- Added new client world architecture:
  - `apps/client/src/runtime/world/WorldRenderer.ts`
  - `apps/client/src/runtime/world/WorldBuildPlan.ts`
  - `apps/client/src/runtime/world/materials/proceduralPbr.ts`
  - `apps/client/src/runtime/world/materials/materialLibrary.ts`
  - `apps/client/src/runtime/world/geometry/boxUv.ts`
  - `apps/client/src/runtime/world/lighting/lightingRig.ts`
  - `apps/client/src/runtime/world/postfx/postPipeline.ts`
  - `apps/client/src/runtime/world/props/instancedDressing.ts`
  - `apps/client/src/runtime/world/weapon/AkViewmodel.ts`
- Refactored `Game.ts` to delegate world visuals/render/post/viewmodel while preserving netcode and prediction flow.
- Extended `render_game_to_text` with `fallbackMode` and render diagnostics (`drawCalls`, `triangles`, `materials`).
- Added layered floor surface zones (stone/concrete/metal/wood) while preserving existing `SurfaceTag` enum.
- Added `apps/client/public/favicon.svg` and linked it in `index.html`.
- Added `docs/decisions.md` documenting architecture/tradeoff choices.
- Playwright runs executed after each meaningful chunk using `$WEB_GAME_CLIENT` with artifact inspection.
- In this environment WebGL still fails (SwiftShader/ANGLE), so visual validation is through deterministic fallback mode + state output; no new 404 console error observed in latest runs.

Outstanding TODOs / next agent
- Run headed/manual GPU-backed validation on real WebGL hardware to confirm full 3D look, post-processing quality, and AK viewmodel readability.
- Tune material roughness/normal intensities and facade prop density after real-GPU inspection to stay under <=200 draw calls in full 3D mode.
- Add optional Playwright scenario set with richer camera/mouse sweeps once WebGL CI environment is available.

## 2026-02-11 (chunk 3: bazaar realism pass)
- Upgraded procedural material system with style-driven synthesis:
  - Added style modes in `proceduralPbr.ts` (`stucco`, `cobble`, `tile`, `cloth`, `wood`, `sand`, `metal`, `rug`).
  - Extended material catalog in `materialLibrary.ts` (`cobble`, `cloth`, `ceramic`, `reed`, `rug`, `produce`, `spice`).
- Reworked `WorldRenderer.ts` for stronger environment realism:
  - Added street-layer overlays (cobble strips, sand drifts, oil stains).
  - Added deeper facade pass (doors, ring handles, shutters, window bars, trim rhythm).
  - Added market booth structures (posts/counters/reed shelving/sagging cloth canopies).
  - Upgraded prop composition for signage, hanging-chain signs, lantern cages, and cables.
  - Added atmospheric props (palm + dust beam planes).
- Rebuilt `instancedDressing.ts` with denser market items:
  - Crates, barrels, wicker baskets, pottery, sandbags, planks, rugs, produce piles, spice cones, herbs, AC units.
  - Kept all decorative assets `ignoreImpactRay=true` and instanced where practical.
- Updated `WorldBuildPlan.ts` floor material inference and cloth palette to better match desert bazaar direction.

Validation in this environment
- `pnpm typecheck` ✅
- `pnpm lint` ✅
- `pnpm test` ✅
- Playwright runs completed and artifacts reviewed:
  - `output/web-game-bazaar-pass-1/*`
  - `output/web-game-bazaar-pass-2/*`
- Limitation persists: WebGL context creation fails in this environment, so captures remain fallback 2D and cannot visually confirm 3D fidelity.

Next TODO (required)
- Run headed GPU-backed validation on target machine to inspect true 3D bazaar art pass quality and tune clutter/post-processing from real frame diagnostics.

## 2026-02-11 (chunk 4: loading menu spacing adjustment)
- Updated loading menu layout spacing in `apps/client/index.html`:
  - Moved button row to lower-third placement on desktop (`#start .actions top: 74%`).
  - Matched lower-third intent on mobile (`@media ... #start .actions top: 72%`).
- Kept logo position/sizing from prior request unchanged.
- Validation:
  - `pnpm typecheck` ✅
  - Playwright capture generated at `output/web-game-buttons-lower-third/shot-0.png` (environment still in fallback 2D due no WebGL context).

## 2026-02-11 (chunk 5: button size/spacing/position retune)
- Updated loading menu buttons in `apps/client/index.html`:
  - Reduced button row width by ~25% (desktop `686px -> 515px`, mobile `560px -> 420px`).
  - Increased horizontal gap between buttons (desktop `18px -> 30px`, mobile `12px -> 18px`).
  - Moved button row down by 10 percentage points (desktop `top: 74% -> 84%`, mobile `top: 72% -> 82%`).
- Validation:
  - `pnpm typecheck` ✅

## 2026-02-11 (chunk 6: button row moved up 10%)
- Per request, moved loading menu button row up by 10 percentage points:
  - Desktop `#start .actions top: 84% -> 74%`
  - Mobile `@media ... #start .actions top: 82% -> 72%`
- Kept the previous 25% button size reduction and increased inter-button gap unchanged.
- Validation:
  - `pnpm typecheck` ✅

## 2026-02-11 (chunk 4: favicon update)
- Added `apps/client/public/favicon.png` generated from `CladStriker_Icon.png` at 256x256 for browser tab use.
- Updated `apps/client/index.html` favicon link to `image/png` with cache-busting query (`/favicon.png?v=1`).
- Verification: `pnpm --filter @clawd-strike/client build` ✅

## 2026-02-11 (chunk 5: larger tab icon)
- Regenerated `apps/client/public/favicon.png` to make the tab artwork larger by center-cropping the source icon (`700x700`) before resizing to `256x256`.
- Left favicon link unchanged (`/favicon.png?v=1`) so no HTML edits were needed.
- Verification: `pnpm --filter @clawd-strike/client build` ✅

## 2026-02-11 (chunk 7: button row down 3%)
- Adjusted loading menu button row position in `apps/client/index.html`:
  - Desktop `#start .actions top: 74% -> 77%`
  - Mobile `@media ... #start .actions top: 72% -> 75%`
- Validation:
  - `pnpm typecheck` ✅

## 2026-02-11 (chunk 8: loading-screen mute toggle)
- Added top-right loading-screen mute toggle with uploaded icon artwork:
  - Asset: `apps/client/public/ui/mute-toggle.png` (copied from `~/Downloads/mute_icon_transparent.png`).
- Updated menu UI in `apps/client/index.html`:
  - Added `#mute-toggle-btn` inside `#start .panel` with ARIA attributes.
  - Added visual states:
    - `.is-unmuted` full-color/stronger shadow.
    - `.is-muted` reduced opacity/saturation/brightness.
  - Added interaction feedback:
    - hover lift/scale + glow.
    - active press scale.
    - focus-visible ring.
    - short click pulse (`.flash`).
- Extended menu ambience controller `apps/client/src/runtime/audio/LoadingAmbientAudio.ts`:
  - Added `setMuted(muted: boolean)` and `isMuted()`.
  - Start now respects muted state and ramps to either active gain or near-silent gain.
  - Mute toggles no longer require rebuilding the audio graph.
- Wired toggle behavior in `apps/client/src/main.ts`:
  - Queries `#mute-toggle-btn`.
  - Syncs classes + `aria-pressed` + `aria-label`.
  - Click toggles menu ambience mute state and applies click pulse.
  - Leaves existing `loadingAmbient.stop()` behavior on game start unchanged.
- Validation:
  - `pnpm lint` ✅
  - `pnpm test` ✅
  - `pnpm typecheck` ❌ in current environment due existing three.js declaration setup drift (missing `@types/three`), unrelated to this feature.
  - Visual/state checks:
    - `output/web-game-mute-toggle-ui/mute-0-initial.png`
    - `output/web-game-mute-toggle-ui/mute-1-muted.png`
    - `output/web-game-mute-toggle-ui/mute-2-unmuted.png`
    - `output/web-game-mute-toggle-ui/states.json`

## 2026-02-11 (chunk 8: loading screen audio replaced with MP3)
- Replaced procedural loading ambient generator with file-backed loading music player in:
  - `apps/client/src/runtime/audio/LoadingAmbientAudio.ts`
- Preserved existing API (`start`, `stop`, `setMuted`, `isMuted`) so menu/audio control call sites remain compatible.
- Added loading screen audio asset:
  - `apps/client/public/ClawdStriker_Audio.mp3` (copied from repo root provided file).
- Validation run:
  - `pnpm --filter @clawd-strike/client build` ✅
  - Playwright smoke via `$WEB_GAME_CLIENT` against `http://localhost:5173` ✅
  - Capture reviewed at `output/web-game-loading-audio-swap/shot-0.png`.
- Note: root `pnpm typecheck` still reports pre-existing unrelated three.js typing errors in this workspace.

## 2026-02-11 (chunk 9: configurable intro->loop window with smooth transition)
- Reworked `apps/client/src/runtime/audio/LoadingAmbientAudio.ts` into a WebAudio buffer player with configurable loop points:
  - `playFromSec`: initial start position
  - `loopStartSec`: where each subsequent loop begins
  - `loopEndSec`: where loop window ends before restarting at `loopStartSec`
  - `crossfadeSec`: smooth overlap duration between outgoing/incoming loop segments
  - `gain`: master volume
- Implemented timed crossfade scheduler so transitions are seamless instead of hard cuts.
- Updated instantiation in `apps/client/src/main.ts` to pass explicit audio config constants in one place.
- Validation:
  - `pnpm --filter @clawd-strike/client build` ✅
  - Playwright smoke run with existing dev server ✅
  - Artifacts: `output/web-game-loading-loop-controls/`
- Note: This environment still logs pre-existing WebGL context errors in Playwright fallback mode; audio code path exercised without new audio runtime exceptions.

## 2026-02-11 (chunk 10: startup/runtime performance pass)
- Implemented requested performance improvements (no gameplay logic changes):

### Startup / iteration speed
- Updated cleanup behavior in `scripts/clean-generated.mjs`:
  - Vite prebundle cache is now preserved by default.
  - Added opt-in env switch `CLEAN_VITE_CACHE=1` to clear `apps/client/node_modules/.vite` only when explicitly requested.

### Lazy initialization to avoid menu-time stalls
- Refactored `apps/client/src/main.ts` to defer heavy game init:
  - `Game` instance is no longer created at module load.
  - `Game` is lazily created only when user starts a mode (`single-player` / `multi-player`).
  - Runtime loop only starts after game start.
  - `render_game_to_text` now returns a valid menu-state payload before game init.
- Kept deterministic virtual-time compatibility for Playwright by exposing `window.advanceTime` once game exists.

### Loading audio path optimization
- Replaced WebAudio full-buffer decode path in `apps/client/src/runtime/audio/LoadingAmbientAudio.ts`:
  - Removed eager `fetch + decodeAudioData` behavior that decoded full 43MB MP3.
  - Switched to `HTMLAudioElement` streaming-style playback with `preload="none"`.
  - Preserved public API (`start`, `stop`, `setMuted`, `isMuted`) and finite-loop behavior via `timeupdate` seek window.

### Renderer + frame-loop cost reduction
- Extended `Game` constructor to accept `highQuality` toggle and passed it from URL query (`?quality=high` opt-in):
  - Default path is low-quality for faster startup/frame-time.
- `apps/client/src/runtime/Game.ts` optimizations:
  - Lower default DPR cap (low quality: 1.0; high quality: 1.5).
  - Low-quality shadow type uses cheaper `PCFShadowMap`.
  - Removed per-frame vector allocations for camera look direction.
  - Reworked HUD FPS + diagnostics sampling:
    - FPS now uses dt smoothing instead of `THREE.Clock.getDelta()` each frame.
    - Expensive diagnostics are sampled every 500ms instead of every tick.
  - Added render quality flag to `render_game_to_text` output.

### World rendering cost controls
- Updated `apps/client/src/runtime/world/WorldRenderer.ts` with quality-aware build path:
  - Constructor now receives `highQuality`.
  - Low-quality mode skips heaviest geometry passes (`buildFacadeLayers`, `buildMarketBooths`, full atmosphere).
  - Low-quality mode uses filtered prop subset and reduced instanced dressing density.
  - `buildStreetLayer` now accepts detail factor and scales strip/drift/stain/rut counts down in low quality.
  - Decorative `ignoreImpactRay` meshes now have shadow casting disabled post-build.
  - Material count for diagnostics is cached once instead of recomputed via scene traversal each call.

### Lighting + post-processing defaults
- `apps/client/src/runtime/world/lighting/lightingRig.ts`:
  - Added `highQuality` argument.
  - Low quality uses 2048 directional shadow map and fewer fill lights.
- `apps/client/src/runtime/world/postfx/postPipeline.ts`:
  - Added `highQuality` argument.
  - SSAO only enabled in high quality.
  - Bloom strength + grading grain/vignette/contrast reduced in low quality.

### Procedural material generation reductions
- `apps/client/src/runtime/world/materials/materialLibrary.ts`:
  - Added constructor `highQuality` and wired in `WorldRenderer`.
  - Quantized UV repeat cache keys (coarser in low quality) to increase material reuse.
  - Lowered procedural texture tile size in low quality (`256` vs `512`).

### Instanced dressing density scaling
- `apps/client/src/runtime/world/props/instancedDressing.ts`:
  - Added `detailFactor` parameter.
  - Scaled instance counts and per-point spawn counts across all dressing sets.
  - Hooked into `WorldRenderer` high/low quality paths.

Validation
- `pnpm lint` ✅
- `pnpm test` ✅
- `pnpm typecheck` ❌ (pre-existing three.js declaration errors in current workspace environment; unaffected by this change set, consistent with earlier notes)
- Playwright smoke (`$WEB_GAME_CLIENT`) with click-through start path:
  - Command used: `--click-selector #single-player-btn --iterations 2 --screenshot-dir output/web-game-perf-pass`
  - Artifacts generated and reviewed:
    - `output/web-game-perf-pass/shot-0.png`
    - `output/web-game-perf-pass/state-0.json`
    - `output/web-game-perf-pass/errors-0.json`
  - Result: game enters play mode and server state advances in fallback 2D mode.
  - Environment limitation persists: headless WebGL context creation fails (ANGLE/SwiftShader), so 3D/GPU-path visual perf could not be validated here.

Follow-up TODOs
- Run manual GPU-backed browser test on target machine to validate actual 3D performance gains and visual quality in both default and `?quality=high` modes.
- If desired, add runtime quality toggle UI (menu button) to avoid query-param usage.
- Consider moving procedural texture generation to worker/off-main-thread for further startup gains while preserving high-quality path.

## 2026-02-11 (chunk 9: mute visual polish)
- Refined mute toggle visual treatment in `apps/client/index.html` per UI feedback:
  - `Muted` state now preserves original icon fidelity (full art, no dimming).
  - `Unmuted` state now has distinct, more professional treatment (teal-tinted/soft-desaturated look) to clearly differ from muted.
  - Upgraded button chrome with subtle border plate and clearer hover/press/focus feedback while reducing harsh opacity effect.
- Validation captures:
  - `output/web-game-mute-toggle-polish/mute-unmuted.png`
  - `output/web-game-mute-toggle-polish/mute-muted.png`
  - `output/web-game-mute-toggle-polish/state.json`

## 2026-02-11 (chunk 10: mute icon full opacity)
- Removed icon transparency in both mute states in `apps/client/index.html`:
  - `#mute-toggle-btn.is-unmuted .mute-icon` now `opacity: 1`.
  - `#mute-toggle-btn.is-muted .mute-icon` remains `opacity: 1`.
- Preserved interactive button treatment (hover/active/focus/pulse) unchanged.
- Validation captures:
  - `output/web-game-mute-toggle-no-opacity/unmuted.png`
  - `output/web-game-mute-toggle-no-opacity/muted.png`

## 2026-02-11 (chunk 11: loading-screen assets consolidated)
- Moved all loading-screen image assets into one folder for organization:
  - `apps/client/public/loading-screen/ClawdStriker_Logo.png`
  - `apps/client/public/loading-screen/Loading_Screen_Background_4K.png`
  - `apps/client/public/loading-screen/button-human.png`
  - `apps/client/public/loading-screen/button-agent.png`
  - `apps/client/public/loading-screen/mute-toggle.png`
- Updated all loading-screen image references in `apps/client/index.html` to use `/loading-screen/...` paths.
- Validation:
  - `pnpm --filter @clawd-strike/client build` ✅

## 2026-02-11 (chunk 12: loading-screen audio asset consolidated)
- Moved loading-screen music file into the same asset folder:
  - from `apps/client/public/ClawdStriker_Audio.mp3`
  - to `apps/client/public/loading-screen/ClawdStriker_Audio.mp3`
- Updated menu ambient audio source paths:
  - `apps/client/src/runtime/audio/LoadingAmbientAudio.ts`
  - `apps/client/src/main.ts`
  - new path: `/loading-screen/ClawdStriker_Audio.mp3`
- Validation:
  - `pnpm --filter @clawd-strike/client build` ✅

## 2026-02-11 (chunk 13: mute icon uses original artwork as-is)
- Removed mute-button icon visual manipulation in `apps/client/index.html`:
  - No icon opacity styling for mute states.
  - No icon filter styling for mute states.
- Preserved interactive behavior with structural button feedback (hover lift, press scale, focus ring, pulse) without altering icon image rendering.
- Validation captures:
  - `output/web-game-mute-toggle-original-icon/unmuted-original-icon.png`
  - `output/web-game-mute-toggle-original-icon/muted-original-icon.png`

## 2026-02-11 (chunk 14: mute button smaller + tighter top-right)
- Updated mute button layout in `apps/client/index.html`:
  - Desktop: `top/right -> 10px + safe-area`, `width clamp(68px, 7vw, 108px)`.
  - Mobile: `top/right -> 6px + safe-area`, `width clamp(62px, 16vw, 94px)`.
- Validation:
  - `pnpm --filter @clawd-strike/client build` ✅

## 2026-02-11 (chunk 15: mute icon replacement + top-right reduction)
- Ensured replaced mute icon is used by adding a cache-busting query to the loading-screen image ref:
  - `src="/loading-screen/mute-toggle.png?v=2"`
- Reduced mute toggle size by ~30% and moved to true top-right corner:
  - Desktop: `top/right: 0 + safe-area`, `width: clamp(48px, 5vw, 76px)`
  - Mobile: `top/right: 0 + safe-area`, `width: clamp(43px, 11vw, 66px)`
- Validation:
  - `pnpm --filter @clawd-strike/client build` ✅
  - Verified rendered icon source: `/loading-screen/mute-toggle.png?v=2`
  - Screenshot: `output/web-game-mute-toggle-replaced-icon/menu-top-right-small-mute.png`

## 2026-02-11 (chunk 16: replaced mute icon asset)
- Replaced loading-screen mute icon file with newly attached artwork:
  - source: `~/Downloads/ChatGPT Image Feb 11, 2026, 01_30_40 PM.png`
  - destination/renamed: `apps/client/public/loading-screen/mute-toggle.png`
- Updated icon cache-buster in `apps/client/index.html`:
  - `/loading-screen/mute-toggle.png?v=3`
- Validation:
  - `pnpm --filter @clawd-strike/client build` ✅
  - Verified rendered src: `/loading-screen/mute-toggle.png?v=3`
  - Screenshot: `output/web-game-mute-toggle-replaced-final/menu-with-replaced-mute.png`

## 2026-02-11 (chunk 10: faster loading-audio startup)
- Root cause found for delayed loading-screen audio start:
  - `LoadingAmbientAudio` used `audio.preload = "none"`, delaying network fetch until `play()`.
  - Auto-start on initial page load had been removed from `main.ts`; only user interaction triggered start.
- Changes made:
  - `apps/client/src/runtime/audio/LoadingAmbientAudio.ts`
    - Changed preload policy to `audio.preload = "auto"`.
    - Added eager `audio.load()` after element creation to start buffering immediately.
  - `apps/client/src/main.ts`
    - Restored startup attempt on page load: `void loadingAmbient.start();`
  - `apps/client/index.html`
    - Added `<link rel="preload" as="audio" href="/loading-screen/ClawdStriker_Audio.mp3" type="audio/mpeg" />`.
- Validation:
  - `pnpm --filter @clawd-strike/client build` ✅
  - Playwright smoke capture: `output/web-game-audio-autostart/shot-0.png` ✅
