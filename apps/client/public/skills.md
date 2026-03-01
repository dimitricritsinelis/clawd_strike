# skills.md — Clawd Strike (Agent Playbook)

This document is **served by the game** at: `/skills.md`

It is written for automated agents (Codex, Claude Code, OpenClaw, etc.) to:
1) **build/run** Clawd Strike locally (localhost), and  
2) **play/verify** the game via a **headed** browser (pointer-lock + WebGL).

> Headless browsers are not supported for reliable play: pointer-lock + WebGL are flaky headless.

---

## 0) Quickstart (Localhost)

### Prereqs
- Node: **22** (repo has `.nvmrc` = `22`)
- Package manager: **pnpm** (repo declares `pnpm@10.x`)
- Browser: **Chromium/Chrome/Edge** (headed; pointer lock required)

### Install + Run
From the repo root:
```bash
pnpm install
pnpm dev
```

The dev server runs on:
- `http://127.0.0.1:5174/`

### Canonical play URL (free-move)
- `http://127.0.0.1:5174/?map=bazaar-map&autostart=human`

Recommended for agents (prevents death interruptions):
- `http://127.0.0.1:5174/?map=bazaar-map&autostart=human&unlimitedHealth=1`

### Deterministic “compare shot” URL (camera locked; NOT playable)
- `http://127.0.0.1:5174/?map=bazaar-map&shot=compare&autostart=human`

`shot=compare` **freezes input** and disables pointer-lock handling on purpose (for stable screenshots).

---

## 1) How to Play (Human or Agent)

### Controls (runtime)
- **Pointer lock:** click the game view (canvas) or the on-screen “Click to lock pointer” prompt
- **Look:** mouse
- **Move:** `W A S D`
- **Walk (slower):** hold `Shift`
- **Jump:** `Space`
- **Fire:** left mouse button
- **Reload:** `R`
- **Pause / unlock pointer:** `Escape`
  - If pause menu opens, press `Escape` again (or click “Return to Game”), then click the canvas to re-lock pointer

### What “playing” means for agents
Movement input is ignored unless `pointerLocked === true`. Your agent must:
1) load the runtime (skip loading screen via `autostart=human`), then
2) click to acquire pointer lock, then
3) send keyboard/mouse inputs.

---

## 2) Useful URL Params (runtime)

All params are standard query params on `/?...`

| Param | Examples | Effect |
|------|----------|--------|
| `map` | `map=bazaar-map` | Select map id (default is `bazaar-map`). |
| `autostart` | `autostart=human` | Skip loading screen and boot runtime immediately. |
| `shot` | `shot=compare` | Deterministic camera; **freezes input** (for screenshots). |
| `spawn` | `spawn=A`, `spawn=B` | Select spawn side (default `A`). |
| `name` | `name=Operator` | Player name shown in HUD/killfeed. |
| `debug` | `debug=1` | On-screen debug HUD + enables debug hotkeys. |
| `perf` | `perf=1` | Show performance HUD. (With `debug=1`, `F5` toggles perf HUD.) |
| `anchors` | `anchors=1` | Show anchor markers overlay. (With `debug=1`, `F2` toggles markers.) |
| `labels` | `labels=1` | Show anchor labels overlay. (With `debug=1`, `F3` toggles labels.) |
| `anchor-types` | `anchor-types=landmark,hero_landmark` | Filter which anchors to show. |
| `seed` | `seed=123` | Deterministic variation seed override. |
| `high-vis` | `high-vis=1` | Extra-bright blockout palette override. |
| `vm` | `vm=0` | Hide weapon viewmodel. |
| `vm-debug` | `vm-debug=1` | Viewmodel debug axes (**requires** `debug=1`). |
| `unlimitedHealth` | `unlimitedHealth=1` (aliases: `god=1`, `godMode=1`) | Prevent death interruptions while exploring. |
| `floors` | `floors=blockout` | Force blockout floors (`pbr` is default). |
| `floorRes` | `floorRes=1k` / `2k` / `4k` | Floor texture quality when `floors=pbr`. |
| `walls` | `walls=blockout` | Wall mode selector (may be forced to blockout depending on build flags). |
| `lighting` | `lighting=flat` | Flatter lighting preset (default `golden`). |
| `wallDetails` | `wallDetails=0` | Disable wall detail kit placement. |
| `wall-detail-density` | `wall-detail-density=0.5` | Wall detail density scale (0..2). |
| `props` | `props=blockout` / `bazaar` | Prop visuals mode (may be forced to blockout depending on build flags). |
| `prop-profile` | `prop-profile=subtle|medium|high` | Placeholder prop profile. |
| `prop-jitter` | `prop-jitter=0.0..1.0` | Prop placement jitter. |
| `prop-cluster` | `prop-cluster=0.0..1.0` | Prop clustering. |
| `prop-density` | `prop-density=0.0..1.0` | Prop density scale. |

Legacy aliases are accepted for some keys (`highvis`, `vmDebug`, `anchorTypes`, `propProfile`, `propJitter`, `propCluster`, `propDensity`).

---

## 3) Automation Contract (RECOMMENDED for agents)

The game exposes two stable globals for automation:

```js
window.render_game_to_text(): string
window.advanceTime(ms: number): Promise<void>
```

### 3.1 `window.render_game_to_text()`
Returns a JSON string describing the current state.

#### Loading screen shape
```js
JSON.parse(window.render_game_to_text()).mode === "loading-screen"
```

#### Runtime shape (key fields)
```js
const s = JSON.parse(window.render_game_to_text());
s.mode === "runtime";
s.map.loaded;                      // boolean
s.map.error;                       // string? (only present on error)
s.gameplay.pointerLocked;          // boolean (must be true to move)
s.gameplay.grounded;               // boolean
s.gameplay.speedMps;               // number
s.view.camera.pos;                 // {x,y,z}
s.view.camera.yawDeg, pitchDeg;    // numbers
```

### 3.2 `window.advanceTime(ms)`
Advances simulation in deterministic 60Hz steps (useful to skip waiting in scripted checks).

---

## 4) Minimal “Agent Play” Loop (headed browser automation)

This is framework-agnostic. If you use Playwright/Selenium/etc., the steps are:

1) Open a play URL (recommended):
   - `/?map=bazaar-map&autostart=human&unlimitedHealth=1&debug=1`
2) Wait until:
   - `state.mode === "runtime"` AND `state.map.loaded === true`
3) Click the game canvas to acquire pointer lock.
4) Wait until:
   - `state.gameplay.pointerLocked === true`
5) Send inputs:
   - Hold `W` for 1s → release
   - Move mouse a bit → verify yaw changes
6) Verify movement by checking `state.view.camera.pos` changed over time.

### Example Playwright snippet (headed)
```js
// Pseudocode / reference only (this repo does not vendor Playwright)
import { chromium } from "playwright";

const base = process.env.BASE_URL ?? "http://127.0.0.1:5174";
const url = `${base}/?map=bazaar-map&autostart=human&unlimitedHealth=1&debug=1`;

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

await page.goto(url, { waitUntil: "networkidle" });

await page.waitForFunction(() => {
  const s = JSON.parse(window.render_game_to_text());
  return s.mode === "runtime" && s.map.loaded === true;
});

await page.click("canvas");

await page.waitForFunction(() => {
  const s = JSON.parse(window.render_game_to_text());
  return s.mode === "runtime" && s.gameplay.pointerLocked === true;
});

await page.keyboard.down("W");
await page.waitForTimeout(1000);
await page.keyboard.up("W");

// Optional: read position to assert movement happened
const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
console.log(state.view.camera.pos);
```

---

## 5) Build/Deploy Notes (for agents with repo access)

### Typecheck + build
```bash
pnpm typecheck
pnpm build
```

### Preview the production build locally
```bash
pnpm preview
```
Vite preview prints the URL/port it binds to.

### Where map data comes from
- Design source-of-truth: `docs/map-design/specs/map_spec.json`
- Runtime loads:
  - `/maps/<mapId>/map_spec.json`
  - `/maps/<mapId>/shots.json`
- These runtime files are generated before dev/build/preview via the client `gen:maps` step.

If you ever see `/maps/...` 404s, run:
```bash
pnpm --filter @clawd-strike/client gen:maps
```

---

## 6) Troubleshooting

- **Pointer lock won’t engage:** click the canvas; if blocked, press `Escape` and click again. Ensure the tab is focused and not embedded in an iframe.
- **You can’t move:** confirm `JSON.parse(window.render_game_to_text()).gameplay.pointerLocked === true`.
- **WebGL issues / black screen:** use a headed Chromium browser with hardware acceleration enabled.
- **Anchor-clearance warnings in terminal:** expected during map generation; not fatal for play.
- **Port 5174 already in use:** stop the other dev server; this repo uses `strictPort: true`.

---
End of `/skills.md`.
