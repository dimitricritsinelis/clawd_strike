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
- `anchors=1&labels=1` anchor overlay (optional `anchor-types=landmark,hero_landmark`)
- `seed=<int>` deterministic prop variation
- `high-vis=1` extra-bright palette override
- `perf=1` perf HUD
- `vm=0` hide weapon viewmodel
- `vm-debug=1` viewmodel debug axes (requires `debug=1`)
- `spawn=B` spawn selector (`A` default)
- `prop-profile=subtle|medium|high`, `prop-jitter=0..1`, `prop-cluster=0..1`, `prop-density=0..1`
- `autostart=human` skip menu and bootstrap runtime immediately

Legacy aliases are still accepted (`highvis`, `vmDebug`, `anchorTypes`, `propProfile`, `propJitter`, `propCluster`, `propDensity`).

## Other Commands
```bash
pnpm typecheck
pnpm build
```
