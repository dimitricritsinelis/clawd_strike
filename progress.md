Original prompt: You are a senior game dev. Review this repo and make reccomendations on changes/improvement/optimization/reduce clutter. The point of this repo is simply to load the loading screen. ultimastely we will build upon this and build a game so keep that in mind. here are another developers reccomendations, but ultimately i trust your judgment: Recommendations

Regenerate and commit a clean lockfile now (pnpm install) so the branch truth matches the new repo shape.
Move vite and typescript into package.json (devDependencies) and keep root scripts as simple wrappers.
Split loading screen into explicit modules:
ui.ts
audio.ts (or keep current class there)
bootstrap.ts (entry that later hands off to game runtime)
Define a clean handoff contract now for future game boot:
onLoadingReady()
onGameRuntimeReady()
transitionToGame()
Keep this in a small types.ts so adding game systems later doesn’t force rewrites.
Add an asset optimization pass before game expansion:
Convert large PNG UI art to WebP where acceptable.
Add compressed audio variant (e.g., AAC/OGG) and fallback strategy.
Keep original source art separately from runtime assets.
Add a short branch contract doc (single markdown file) stating: “This branch intentionally contains only loading-screen runtime + assets,” plus where game code will be introduced next. This prevents accidental reintroduction of old engine/server files.; return your reccomendations and then lets implement. the goal is to finalize the loading screen branch before we continue with game development

Notes:
- 2026-02-15: Refactored loading screen into `apps/client/src/loading-screen/{bootstrap,ui,audio,types}.ts` and kept `window.render_game_to_text`/`window.advanceTime` hooks for the Playwright loop.
- 2026-02-15: Confirmed loading screen uses optimized AVIF/WEBP variants in `apps/client/index.html` preload + `<picture>`/`image-set`, and switched loading ambient defaults to `ClawdStriker_Audio_Loading_Trimmed.mp3` in `apps/client/src/loading-screen/audio.ts` (0:05–2:15 segment) so trimmed audio is consistently used.
- 2026-02-15: Updated `restart-game.command` to launch Chrome with `--autoplay-policy=no-user-gesture-required` so loading audio can start without a manual click when running local restart flow.
- 2026-02-15: Updated loading bootstrap to attempt ambient playback on initial mount (`loadingAmbient.start()`), while still preserving user-interaction fallback if autoplay is blocked.
