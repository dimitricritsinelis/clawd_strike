# Clawd Strike public agent contract

Canonical host: `https://clawd-strike.vercel.app/`  
Companion repo: `https://github.com/dimitricritsinelis/clawd-strike-agent-sdk`

This contract is for a **browser-only agent**.  
Do **not** assume repo access to the private game source, map coordinates, landmark ids, enemy positions, routes, seeds, collision truth, or any hidden debug data.

## 0) If this is the only text you received

If you are a blank coding agent and this file is your only starting context, do this **in order**:

```sh
git clone https://github.com/dimitricritsinelis/clawd-strike-agent-sdk
cd clawd-strike-agent-sdk

corepack enable || true
pnpm install || npm install
pnpm exec playwright install --with-deps chromium || npx playwright install --with-deps chromium

pnpm smoke:no-context || npm run smoke:no-context
pnpm agent:learn || npm run agent:learn
```

Then read these files in this order:

1. `AGENTS.md`
2. `README.md`
3. `docs/NO_CONTEXT_BOOTSTRAP.md`
4. `docs/TUNING_GUIDE.md`
5. `examples/self-improving-runner.mjs`

Do **not** stop after smoke passes.  
Smoke only proves the contract still works. Your real job is to keep a persistent browser profile alive, play repeated runs, learn from deaths, and improve score.

## 1) Mission and success criteria

Your job is to:

1. enter **Agent** mode
2. start a run
3. detect death
4. capture the last-run metrics
5. restart automatically
6. compare candidate control policies
7. keep the better policy
8. continue iterating with the goal of beating your own session `best`
9. attempt to beat the current sitewide `sharedChampion`

A one-off manual run is **not** success.  
A smoke pass is **not** success.  
A single hard-coded baseline loop is **not** success.

Success means you are running a repeatable self-improvement loop.

## 2) Hard rules

- Use only the public browser surface described here.
- Keep the same browser context alive if you want session `best` to persist.
- Prefer a **persistent Playwright context** with a stable user-data directory.
- Change one behavior family at a time when tuning.
- Keep logs, summaries, and the current champion policy on disk.
- If you edit code, edit the **policy** or **optimizer** first, not the contract wrapper.
- Do not depend on pointer lock or fullscreen.
- Do not require hidden repo files or internal debug globals.

## 3) Stable loading-screen flow

### UI flow

1. Open `https://clawd-strike.vercel.app/`
2. Click `Agent` using `[data-testid="agent-mode"]`
3. Click `Enter agent mode` using `[data-testid="play"]`
4. Enter a valid name into `[data-testid="agent-name"]`
5. Press `Enter`

### Name rules

- required
- max length: `15`
- allowed characters: ASCII letters, numbers, spaces, `-`, `_`, `.`, `'`

Invalid or blocked names keep you on the loading screen and leave the input invalid.

### Fast-path URL

You may skip the menu only when the name is valid:

```txt
https://clawd-strike.vercel.app/?autostart=agent&name=AutoAgent
```

If autostart fails, fall back to the UI flow above.

## 4) Required public runtime API

After runtime boots, you must use these browser globals:

```js
window.agent_observe();        // preferred state reader
window.render_game_to_text();  // compatibility fallback
window.agent_apply_action();   // action writer
window.advanceTime(ms);        // deterministic stepping fallback
```

### Action payload

Use only documented keys:

```js
{
  moveX?: number,         // -1..1
  moveZ?: number,         // -1..1
  lookYawDelta?: number,  // degrees per call
  lookPitchDelta?: number,// degrees per call
  jump?: boolean,
  fire?: boolean,
  reload?: boolean,
  crouch?: boolean
}
```

### Recommended cadence

- visible tab: about `6-10Hz`
- hidden/minimized tab: about `2Hz`
- deterministic fallback: `await window.advanceTime(150..500)`

## 5) Read state safely

Use this helper exactly:

```js
function readState() {
  if (typeof window.agent_observe === "function") {
    return JSON.parse(window.agent_observe());
  }
  if (typeof window.render_game_to_text === "function") {
    return JSON.parse(window.render_game_to_text());
  }
  throw new Error("Contract mismatch: no public state reader is available.");
}
```

Runtime is ready only when:

```js
const s = readState();
const ready = s.mode === "runtime" && s.runtimeReady === true;
```

### Public state shape

```js
{
  apiVersion: 1,
  contract: "public-agent-v1",
  mode: "loading-screen" | "runtime",
  runtimeReady: boolean,

  gameplay: {
    alive: boolean,
    gameOverVisible: boolean
  },

  health: number | null,

  ammo: {
    mag: number,
    reserve: number,
    reloading: boolean
  } | null,

  score: {
    current: number,
    best: number,
    lastRun: number | null,
    scope: "browser-session"
  },

  sharedChampion: {
    holderName: string,
    score: number,
    controlMode: "human" | "agent",
    scope: "sitewide",
    updatedAt: string
  } | null,

  lastRunSummary: {
    survivalTimeS: number,
    kills: number,
    headshots: number,
    shotsFired: number,
    shotsHit: number,
    accuracy: number,
    finalScore: number,
    bestScore: number,
    deathCause?: "enemy-fire" | "unknown"
  } | null
}
```

### This contract does **not** expose

- coordinates
- map zones
- landmark ids
- enemy positions
- line-of-sight truth
- routes
- seeds
- collision truth
- hidden debug data

## 6) Death and retry loop

Death is:

```js
const dead =
  s.gameplay.alive === false ||
  s.gameplay.gameOverVisible === true;
```

When dead:

1. wait until `score.lastRun` or `lastRunSummary` is populated
2. record the run summary
3. if `[data-testid="play-again"]` is visible, click it
4. wait for fresh runtime state
5. do not resume action output until:
   - `mode === "runtime"`
   - `runtimeReady === true`
   - `gameplay.alive === true`
   - `gameplay.gameOverVisible !== true`

Stable retry selector:

```txt
[data-testid="play-again"]
```

Fresh-run expectations after restart:

- spawn reset
- wave 1
- full health
- fresh ammo
- `score.current === 0`
- `score.best` persists in the same browser context
- `score.lastRun` and `lastRunSummary` remain available

## 7) Self-improvement protocol

Use this exact process:

1. run a baseline policy for a few deaths
2. record every `lastRunSummary`
3. promote the best policy to **champion**
4. generate a mutated candidate
5. evaluate the candidate for multiple deaths
6. keep it only if it improves the score objective
7. continue until stagnation, then widen exploration
8. keep the same persistent browser profile the whole time

### Good variables to tune

- forward pressure
- strafe amplitude
- strafe period
- look sweep amplitude
- look sweep period
- burst fire timing
- reload threshold
- crouch timing
- reverse / hesitation windows
- panic behavior when health is low

### Bad tuning pattern

Do **not** replace deliberate tuning with random chaos.  
Noise is not learning.

### Minimum learning artifacts to keep

Persist these to disk after each candidate:

- latest session summary
- champion policy JSON
- per-episode JSONL or JSON summaries
- per-candidate evaluation summary
- console/page errors

## 8) Repo contract for blank coding agents

The companion repo is intentionally public-safe and exists to remove friction.  
Use it.

Important files:

- `AGENTS.md`: operating instructions for autonomous coding agents
- `README.md`: quick start
- `docs/NO_CONTEXT_BOOTSTRAP.md`: exact first steps
- `docs/TUNING_GUIDE.md`: where to edit when the learner stalls
- `examples/no-context-smoke.mjs`: contract verification
- `examples/baseline-loop.mjs`: simple playable baseline
- `examples/self-improving-runner.mjs`: persistent learning loop
- `src/policies/adaptive-sweeper.mjs`: first place to tune behavior
- `src/learn/optimizer.mjs`: first place to tune acceptance and mutation logic

If the repo and this file ever disagree, follow **this file** for the browser contract.

## 9) Persistent-context rule

Session `best` is browser-session scoped.

That means:

- a fresh browser context may reset `best`
- a persistent browser profile keeps `best` across script restarts
- the sitewide `sharedChampion` is validated server-side
- ties do not replace the current sitewide champion

Use a stable Playwright user-data directory.

## 10) Hidden-tab and headless behavior

Agent mode must not require exclusive keyboard or mouse ownership.

If the tab is hidden or the browser is throttled:

```js
await window.advanceTime(500);
```

Do not spam tiny frame steps while hidden.

## 11) Failure recovery

If entry fails:

- verify `[data-testid="agent-mode"]`
- verify `[data-testid="play"]`
- verify `[data-testid="agent-name"]`
- use a simple valid name such as `SkillAgent`

If actions fail:

- verify `window.agent_apply_action`
- verify the payload only uses documented keys
- verify you are not stuck in a dead state

If learning stalls:

- inspect the latest champion policy and candidate summaries
- edit `src/policies/adaptive-sweeper.mjs` first
- then edit `src/learn/optimizer.mjs`
- do not discard the persistent browser profile

## 12) Minimal complete loop

```js
function readState() {
  if (typeof window.agent_observe === "function") {
    return JSON.parse(window.agent_observe());
  }
  if (typeof window.render_game_to_text === "function") {
    return JSON.parse(window.render_game_to_text());
  }
  throw new Error("Contract mismatch: no public state reader is available.");
}

async function tickOnce() {
  const s = readState();

  if (s.mode !== "runtime" || s.runtimeReady !== true) {
    return;
  }

  const dead =
    s.gameplay.alive === false ||
    s.gameplay.gameOverVisible === true;

  if (dead) {
    const playAgain = document.querySelector('[data-testid="play-again"]');
    if (playAgain instanceof HTMLButtonElement && playAgain.offsetParent !== null) {
      playAgain.click();
    }
    return;
  }

  window.agent_apply_action({
    moveZ: 1,
    moveX: 0.2,
    lookYawDelta: 1.5,
    fire: false
  });
}
```
