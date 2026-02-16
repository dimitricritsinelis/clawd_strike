# Clawd Strike (Bazaar Blockout MVP)

Web-based FPS client with a playable, deterministic full-map blockout for the Bazaar slice.

## Run
```bash
pnpm install
pnpm dev
```

## Canonical Playtest URL
- `http://127.0.0.1:5174/?map=bazaar-map&shot=compare`

Open the URL, then click `Human` on the loading screen to enter the gameplay runtime.

## MVP Scope (Current)
- Pointer lock + full-screen canvas runtime
- WASD + mouse-look, Shift walk, Space jump
- Stable AABB-only collision + sliding
- Bright blockout palette + placeholder props (instanced primitives)
- Deterministic compare camera via `shot=compare`

## Useful URL Toggles
- `debug=1` HUD
- `anchors=1&labels=1` anchor overlay (optional `anchorTypes=...`)
- `seed=<int>` deterministic prop variation
- `highvis=1` extra-bright palette override
- `perf=1` perf HUD
- `vm=0` hide weapon viewmodel

## Other Commands
```bash
pnpm typecheck
pnpm build
```
