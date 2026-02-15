# Clawd Strike (Loading Screen Only)

This branch intentionally contains only the loading-screen runtime + assets.

## Run

```bash
pnpm install
pnpm dev
```

## Boot / Handoff Contract

The loading screen is implemented as a small boot layer that can later hand off
to the game runtime without rewrites:

- `onLoadingReady()`
- `onGameRuntimeReady()`
- `transitionToGame()`

See `apps/client/src/loading-screen/types.ts`.

## Where Game Code Goes Next

- Loading screen: `apps/client/src/loading-screen/`
- Future runtime (renderer/sim/input, etc.): `apps/client/src/runtime/` (reintroduced later)

