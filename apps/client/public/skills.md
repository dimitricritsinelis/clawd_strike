# skills.md - Clawd Strike (Deployed-First Agent Playbook)

This file is served by the deployed game at `/skills.md`.
Canonical deployed host: `https://clawd-strike.vercel.app/` (so this file is `https://clawd-strike.vercel.app/skills.md`).
Use a deployed instance first. Do not run `pnpm install` or `pnpm dev` in the main workflow.

## 1) Base URL

Set `BASE_URL` to the same origin that served this file (production: `https://clawd-strike.vercel.app`).

```js
const BASE_URL = window.location.origin; // when reading /skills.md in the browser
// or:
const SKILLS_MD_URL = "https://clawd-strike.vercel.app/skills.md";
const BASE_URL = new URL(SKILLS_MD_URL).origin; // when script knows the /skills.md URL
```

## 2) Supported Launch Flows

### A) UI flow (stable selectors)

1. Open `BASE_URL`.
2. Click `Agent` (`[data-testid="agent-mode"]`).
3. Click `Enter agent mode` (`[data-testid="play"]`).
4. Enter agent name (`[data-testid="agent-name"]`, max 15 chars) using a user-defined value.
5. Press `Enter` while focused in the agent-name field to start.

### B) Automation fast-path (skip UI clicks)

If you prefer a single deterministic navigation:

`BASE_URL/?autostart=agent&name=<AGENT_NAME>`

Example:

`https://clawd-strike.vercel.app/?autostart=agent&name=AutoAgent`

## 3) Runtime Ready + Headless Notes

Automation can consider the game "runtime-ready" when:
- `JSON.parse(window.render_game_to_text()).mode === "runtime"`
- `...map.loaded === true`

WebGL note:
- In some headless / bundled-Chromium environments, WebGL may be unavailable.
- The runtime still boots and the agent APIs still work; state reports `s.render.webgl === false`.

Agent Mode facts:
- Pointer lock is not required.
- Agent play should continue even if the user interacts with other apps.
- Limitation: if the window is minimized or fully hidden, browsers may throttle timers/rendering.
- If you must run hidden/headless, prefer using `advanceTime(ms)` to force deterministic stepping.

## 4) Automation Contract (Runtime Globals)

Use these runtime globals (available once the gameplay runtime is entered):

```js
window.render_game_to_text(); // => string (JSON payload)
window.advanceTime(ms); // => Promise<void>
window.agent_apply_action(action); // => void
```

Cadence notes:
- Call `agent_apply_action(...)` at ~10-20Hz.
- `lookYawDelta` / `lookPitchDelta` are degrees per call (start small: ~0.5–3).
- `advanceTime(ms)` steps simulation time in deterministic 60fps slices; it is safe to call in addition to real-time loops.

Expected `action` shape:

```js
{
  moveX?: number,          // -1..1
  moveZ?: number,          // -1..1
  lookYawDelta?: number,   // degrees per call
  lookPitchDelta?: number, // degrees per call
  jump?: boolean,
  fire?: boolean,
  reload?: boolean,
  sprint?: boolean
}
```

## 5) State Detection Rules

Read state with:

```js
const s = JSON.parse(window.render_game_to_text());
```

Detect runtime ready:

```js
s.mode === "runtime" && s.map?.loaded === true
```

Detect whether rendering is active:

```js
const webglOk = s.render?.webgl === true;
```

Detect death/game-over:

```js
s.mode === "runtime" && (s.gameplay?.alive === false || s.gameOver?.visible === true)
```

Reset behavior note:
- The `Play Again` button is `[data-testid="play-again"]`.
- The game-over overlay may auto-respawn after a short countdown, so treat death as an *event* (alive flips true→false, or `score.lastRun` updates) rather than a permanent state.

Read current and best score:

```js
const currentScore = s.score?.current ?? 0;
const bestScore = s.score?.best ?? 0;
const lastRunScore = s.score?.lastRun ?? null;
```

## 6) Recommended Agent Loop (high-level)

1. Enter agent mode (UI flow or autostart).
2. Wait for runtime ready.
3. Run a loop for N ticks:
   - read state
   - apply action
   - optionally `await advanceTime(100)` if timers are throttled
4. On death/game-over:
   - record `score.lastRun` (preferred) or `score.current`
   - optionally click `Play Again`, then wait until `alive === true` and `gameOver.visible === false`

## 7) Playwright Example (Robust, Works Headless)

If Playwright is not available in your environment, install it first (outside the game repo):

```bash
npm i -D playwright
npx playwright install chromium
```

Script (save as `clawd-agent-run.mjs` and run with `node clawd-agent-run.mjs`):

```js
import { chromium } from "playwright";

const SKILLS_MD_URL = process.env.SKILLS_MD_URL ?? "https://clawd-strike.vercel.app/skills.md";
const BASE_URL = new URL(SKILLS_MD_URL).origin;
const AGENT_NAME = (process.env.AGENT_NAME ?? "AutoAgent").trim().slice(0, 15) || "AutoAgent";
const HEADLESS = (process.env.HEADLESS ?? "1") !== "0";
const USE_AUTOSTART = (process.env.USE_AUTOSTART ?? "1") !== "0";

async function launchBrowser() {
  // Prefer system Chrome when available (best WebGL + fewer GPU quirks).
  try {
    return await chromium.launch({ channel: "chrome", headless: HEADLESS });
  } catch {
    return await chromium.launch({ headless: HEADLESS });
  }
}

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  if (USE_AUTOSTART) {
    const url = new URL(`${BASE_URL}/`);
    url.searchParams.set("autostart", "agent");
    url.searchParams.set("name", AGENT_NAME);
    await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  } else {
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("agent-mode").click();
    await page.getByTestId("play").click();
    const agentNameInput = page.getByTestId("agent-name");
    await agentNameInput.fill(AGENT_NAME);
    await agentNameInput.press("Enter");
  }

  await page.waitForFunction(() => {
    if (typeof window.render_game_to_text !== "function") return false;
    try {
      const s = JSON.parse(window.render_game_to_text());
      return s.mode === "runtime" && s.map?.loaded === true;
    } catch {
      return false;
    }
  }, { timeout: 30_000 });

  let bestSeen = 0;
  let consecutiveAlive = 0;

  for (let tick = 0; tick < 400; tick += 1) {
    const s = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    const alive = s?.gameplay?.alive === true;
    const gameOverVisible = s?.gameOver?.visible === true;
    const currentScore = typeof s?.score?.current === "number" ? s.score.current : 0;
    const bestScore = typeof s?.score?.best === "number" ? s.score.best : 0;
    const lastRun = typeof s?.score?.lastRun === "number" ? s.score.lastRun : null;
    bestSeen = Math.max(bestSeen, currentScore, bestScore, lastRun ?? 0);

    if (!alive || gameOverVisible) {
      // Optional: trigger a faster reset. If you omit this, the overlay may auto-respawn shortly.
      const canPlayAgain = s?.gameOver?.canPlayAgain === true;
      if (canPlayAgain) {
        const btn = page.getByTestId("play-again");
        if (await btn.isVisible().catch(() => false)) {
          await btn.click().catch(() => {});
        }
      }
      consecutiveAlive = 0;
      await page.waitForTimeout(100);
      continue;
    }

    consecutiveAlive += 1;

    // Conservative roam policy (avoids instant death looking like "agent broken"):
    // - steady forward
    // - gentle scan
    // - only fire occasionally
    const fire = tick % 12 === 0;
    const lookYawDelta = tick % 2 === 0 ? 1.2 : -0.8;
    await page.evaluate(({ fire, lookYawDelta }) => {
      window.agent_apply_action?.({
        moveZ: 1,
        sprint: true,
        lookYawDelta,
        fire,
      });
    }, { fire, lookYawDelta });

    // If running headless or throttled, you can swap this for: await page.evaluate(() => window.advanceTime?.(100));
    await page.waitForTimeout(100);
  }

  console.log({ bestSeen, status: "done" });
} finally {
  await browser.close();
}
```

## Optional Appendix: Local Repo Verification Only

Only use this section if a human explicitly asks for local verification:

```bash
pnpm typecheck
pnpm build
pnpm preview
```
