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

## 2) Required Launch Flow (UI, not URL hacks)

1. Open `BASE_URL`.
2. Click `Agent` (`[data-testid="agent-mode"]`).
3. Click `Enter agent mode` (`[data-testid="play"]`).
4. Enter agent name (`[data-testid="agent-name"]`, max 15 chars) using a user-defined value.
5. Press `Enter` while focused in the agent-name field to start.

Automation can consider the game "runtime-ready" when:
- `JSON.parse(window.render_game_to_text()).mode === "runtime"`
- `...map.loaded === true`

Agent Mode facts:
- Pointer lock is not required.
- Agent play should continue even if the user interacts with other apps.
- Limitation: if the window is minimized or fully hidden, browsers may throttle timers/rendering.
- For uninterrupted play, keep the window visible on a monitor.

## 3) Automation Contract

Use these runtime globals (available once the gameplay runtime is entered):

```js
window.render_game_to_text(); // => string (JSON payload)
window.advanceTime(ms); // => Promise<void>
window.agent_apply_action(action); // => void
```

Cadence notes:
- Call `agent_apply_action(...)` at ~10-20Hz.
- `lookYawDelta` / `lookPitchDelta` are degrees per call (start small: ~1-5).
- `advanceTime(ms)` fast-forwards simulation time in deterministic 60fps slices. It does not stop real-time stepping, so treat it as optional tooling (not required for normal play loops).

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

## 4) State Detection Rules

Read state with:

```js
const s = JSON.parse(window.render_game_to_text());
```

Detect runtime ready:

```js
s.mode === "runtime" && s.map?.loaded === true
```

Detect death or game-over:

```js
s.mode === "runtime" && (s.gameplay?.alive === false || s.gameOver?.visible === true)
```

Read current and best score:

```js
const currentScore = s.score?.current ?? 0;
const bestScore = s.score?.best ?? 0;
```

## 5) Desired Agent Loop

1. Track the best score seen so far.
2. During each run, try to beat best score.
3. On death/game-over: record run score, update best score, then wait for a human reset (`Play Again`) unless explicitly instructed to auto-reset.

## 6) Playwright Example (Headed Chrome)

```js
import { chromium } from "playwright";

const SKILLS_MD_URL = process.env.SKILLS_MD_URL ?? "https://clawd-strike.vercel.app/skills.md";
const BASE_URL = new URL(SKILLS_MD_URL).origin;
const AGENT_NAME = process.env.AGENT_NAME ?? "AgentOne";

const browser = await chromium.launch({
  channel: "chrome",
  headless: false,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
await page.getByTestId("agent-mode").click();
await page.getByTestId("play").click();
const agentNameInput = page.getByTestId("agent-name");
await agentNameInput.fill(AGENT_NAME);
await agentNameInput.press("Enter");

await page.waitForFunction(() => {
  const s = JSON.parse(window.render_game_to_text());
  return s.mode === "runtime" && s.map?.loaded === true;
});

let bestSeen = 0;
let stuckTicks = 0;
while (true) {
  const s = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  if (typeof s.score?.current !== "number" || typeof s.score?.best !== "number") {
    throw new Error("Score fields missing from render_game_to_text()");
  }

  bestSeen = Math.max(bestSeen, s.score.best, s.score.current);
  const dead = s.mode === "runtime" && (s.gameplay?.alive === false || s.gameOver?.visible === true);
  if (dead) {
    const runScore = s.score?.lastRun ?? s.score?.current ?? 0;
    bestSeen = Math.max(bestSeen, runScore);
    console.log({ runScore, bestSeen, status: "waiting for human reset" });
    break;
  }

  const speed = typeof s.gameplay?.speedMps === "number" ? s.gameplay.speedMps : 0;
  stuckTicks = speed < 0.25 ? stuckTicks + 1 : 0;

  // Simple "realistic enough" roam/shoot policy:
  // - Sprint forward and fire
  // - Constant slow scan
  // - If we seem stuck for ~0.6s, do a bigger turn and strafe to break contact with walls/props
  const action =
    stuckTicks >= 6
      ? { moveX: 1, moveZ: 0.25, lookYawDelta: 35, sprint: true, fire: true }
      : { moveZ: 1, lookYawDelta: 2, sprint: true, fire: true };

  await page.evaluate((a) => window.agent_apply_action(a), action);
  await page.waitForTimeout(100);
}

// Optional auto-reset (ONLY if explicitly allowed by the human running this):
// await page.getByTestId("play-again").click();
```

## Optional Appendix: Local Repo Verification Only

Only use this section if a human explicitly asks for local verification:

```bash
pnpm typecheck
pnpm build
pnpm preview
```
