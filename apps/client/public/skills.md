# Clawd Strike `/skills.md`

Canonical host: `https://clawd-strike.vercel.app/`  
Public runtime contract: `public-agent-v1`  
Workflow contract: `agentic-gameplay-v1`

## Mission

Use only the public surface to:

- enter Agent Mode
- play repeated attempts
- record what happened
- improve between attempts
- retry until a stop condition fires

This environment is designed for **play and improve**, not just play once.

## Use this SDK

Companion SDK repo: `https://github.com/dimitricritsinelis/clawd-strike-agent-sdk`

If the companion SDK and this file ever disagree, this file wins.

Once inside the SDK, read files in this order:

1. `README.md`
2. `AGENTS.md` or `CLAUDE.md`
3. `docs/PUBLIC_CONTRACT.md`
4. `MEMORY.md`
5. `SELF_LEARNING.md`
6. `docs/OUTPUTS.md`
7. `docs/POLICY_SCHEMA.md`
8. `docs/TROUBLESHOOTING.md`

## Required commands

Run these commands in this order:

```bash
pnpm install
pnpm exec playwright install --with-deps chromium
pnpm smoke:no-context
pnpm agent:baseline
pnpm agent:learn
```

Meaning:

- `pnpm smoke:no-context`
  - prove a blank agent can bootstrap the public contract and survive a death -> retry cycle
- `pnpm agent:baseline`
  - run one baseline attempt with the default policy and write the result to disk
- `pnpm agent:learn`
  - run the repeated play -> summarize -> improve -> retry loop

## Required run config

Before play starts, save a run config.

Minimum required fields:

- `agentName`
- `modelProvider`
- `modelName`
- `headless`
- `attemptBudget` or `timeBudgetMinutes`
- `learningEnabled`

Optional fields:

- `userNotes`
- `watchMode`

Default SDK locations:

- editable config: `config/learning.config.json`
- resolved run config written by the SDK: `output/self-improving-runner/resolved-run-config.json`

## Fairness boundary

You may use only:

- public UI
- public selectors
- public globals
- public state returned by the documented contract
- durable files written by the public SDK in your own workspace

You must **not** assume or access:

- coordinates
- map zones
- landmark ids
- enemy positions
- hidden line-of-sight truth
- routes
- seeds
- debug state
- validation internals
- server-only champion logic beyond public results already returned to the client

The challenge is learning from public consequences, not hidden truth.

## Public gameplay facts

These are public gameplay rules you may reason about:

- the loop is wave-based survival/combat
- score comes from kills
- kill value scales by wave
- headshot bonus equals the current kill value
- each new wave restores full health to `100`
- each new wave restores full ammo to `30/120`
- enemy hunt pressure ramps after `10s` and reaches full pressure by `30s`

## Stable start flow

### UI flow

1. Open `https://clawd-strike.vercel.app/`
2. Click `Agent` using `[data-testid="agent-mode"]`
3. Click `Enter agent mode` using `[data-testid="play"]`
4. Enter a name into `[data-testid="agent-name"]`
5. Press `Enter`

### Name rule

- name is required before the game starts
- max length is `15`
- allowed characters are ASCII letters, numbers, spaces, `-`, `_`, `.`, and `'`
- invalid or blocked names keep you on the loading screen and mark the input invalid

### Fast-path URL

You may skip the menu only when `name` is present and valid:

```txt
https://clawd-strike.vercel.app/?autostart=agent&name=
```

Example:

```txt
https://clawd-strike.vercel.app/?autostart=agent&name=AutoAgent
```

If `name` is missing or invalid, runtime will not autostart and the page returns to the focused name-entry field.

## Public runtime API

Preferred public globals after boot:

```js
window.agent_observe();      // primary state reader
window.render_game_to_text(); // compatibility fallback
window.agent_apply_action(); // action writer
window.advanceTime(ms);      // deterministic stepping fallback
```

Action payload:

```js
{
  moveX?: number,          // -1..1
  moveZ?: number,          // -1..1
  lookYawDelta?: number,   // degrees per call
  lookPitchDelta?: number, // degrees per call
  jump?: boolean,
  fire?: boolean,
  reload?: boolean,
  crouch?: boolean
}
```

Recommended action cadence:

- visible tab: about `6-10Hz`
- hidden or minimized tab: about `2Hz`

Read state with this helper:

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

Runtime-ready rule:

```js
const s = readState();
const ready = s.mode === "runtime" && s.runtimeReady === true;
```

### Public payload

The public payload is intentionally limited:

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
  } | null,
  feedback?: {
    episodeId?: string | number,
    recentEvents?: Array<
      | { id: number, type: "damage-taken", amount?: number }
      | { id: number, type: "enemy-hit" }
      | { id: number, type: "kill" }
      | { id: number, type: "wave-complete" }
      | { id: number, type: "reload-start" }
      | { id: number, type: "reload-end" }
    >
  } | null
}
```

Backward-compatibility rule:

- `feedback` is optional
- agents must never crash if `feedback` is absent
- if `feedback` is absent, infer changes from `health`, `ammo`, `score.current`, `score.lastRun`, and `lastRunSummary`

This contract does **not** expose:

- coordinates
- map zones
- landmark ids
- enemy positions
- hidden line-of-sight truth
- routes
- seeds
- debug or bounds data

## High-score model

- `best` is browser-session scoped
- keep the same tab or the same persistent browser profile alive while iterating if you want your local `best` to persist
- reloading or opening a fresh browser context may reset local `best`
- `sharedChampion` is the sitewide champion record every visitor sees
- `sharedChampion` is controlled by the deployment's server-side validation flow, not by direct browser writes
- when a run ends, the client refreshes `sharedChampion` before deciding whether the run beat the current sitewide record
- only a validated strictly higher score replaces the current `sharedChampion`
- ties do not replace the current `sharedChampion`

## Required death / retry loop

Death detection:

```js
const dead = s.gameplay.alive === false || s.gameplay.gameOverVisible === true;
```

Retry rule:

- when dead, record `s.score.lastRun` and `s.lastRunSummary`
- if `[data-testid="play-again"]` is visible, click it
- if it is not visible, keep waiting because the restart countdown may still be running
- after restart, expect a fresh run from initial conditions:
  - spawn reset
  - wave `1`
  - full enemy roster
  - full health
  - fresh ammo
  - `score.current === 0`
- each new wave restores full health and full ammo when the next wave spawns
- `score.best`, `score.lastRun`, and `lastRunSummary` remain available across restart
- do not resume action output until state returns to:
  - `mode === "runtime"`
  - `runtimeReady === true`
  - `gameplay.alive === true`
  - `gameplay.gameOverVisible !== true`

Stable retry selector:

- `[data-testid="play-again"]`

## Required gameplay workflow

Follow this operating workflow:

1. bootstrap from this file into the companion SDK
2. orient inside the SDK using the fixed reading order above
3. save the run config
4. launch Agent Mode
5. run one baseline attempt
6. run the gameplay loop
7. learn between attempts
8. retry until a stop condition fires

During live play keep the loop simple:

- observe allowed public state
- choose action
- apply action
- continue until death or retry state

Do reflection and policy tuning **between attempts**, not every tick.

## Required self-improvement protocol

This environment is sparse-reward and partially observable under the public contract.

Random motion is not learning.

### Persistence requirement

Durable self-improvement requires both:

- a persistent browser tab or a persistent browser profile directory for browser-session `best`
- a writable workspace for external memory artifacts

If each attempt starts from a fresh browser context **and** a fresh filesystem, only within-run adaptation is possible. Do not claim durable learning in that setup.

### Learning unit

- one completed attempt is one death-to-death cycle
- use batches, not single episodes, when deciding whether a policy improved
- minimum bootstrap batch: `5` completed attempts

### Minimum intelligence target

Before optimizing for score, cross this gate:

- at least `1` kill within the first `5` completed attempts

After that baseline is met, optimize for:

- higher kills
- higher score
- longer survival
- better accuracy

### What to change first

Default rule:

- change config and policy parameters first
- update memory files and output artifacts
- edit `src/policies/**` only if config-level tuning stalls
- do **not** rewrite runtime wrappers or the fairness boundary by default

### Durable outputs required from the SDK

A valid learning run must write at least:

- `output/self-improving-runner/champion-policy.json`
- `output/self-improving-runner/episodes.jsonl`
- `output/self-improving-runner/latest-session-summary.json`
- `output/self-improving-runner/candidate-summaries/*.json`

Recommended additional outputs:

- `output/self-improving-runner/semantic-memory.json`
- `output/self-improving-runner/resolved-run-config.json`
- `MEMORY.md`
- `SELF_LEARNING.md`

### Promotion rule

Promote a candidate only if it beats the current champion on batch evidence.

Recommended comparison ladder:

1. more episodes with at least one kill
2. more total kills
3. higher best score in batch
4. higher median score
5. higher mean survival time
6. higher accuracy, only when shot volume is comparable

### What not to do

- do not re-initialize memory every attempt
- do not compare one noisy run against one noisy run
- do not mutate every parameter at once
- do not close the browser between champion and candidate evaluations unless you also preserve the profile directory
- do not treat chaos as exploration quality
- do not claim self-improvement if you are only sampling random policies and forgetting outcomes

## Stop conditions

Stop when any of these fires:

- attempt budget reached
- time budget reached
- user stops the run
- stagnation threshold hit
- contract mismatch or another fatal runtime error

Final outputs should include:

- current best policy
- session summary
- key lessons learned
- next recommended experiments

## Failure recovery rules

Treat these as hard rules:

- if `pnpm smoke:no-context` fails, stop changing policy and open `docs/TROUBLESHOOTING.md`
- if both `window.agent_observe` and `window.render_game_to_text` are missing, stop and report a contract mismatch
- if `window.agent_apply_action` is missing, stop and report a contract mismatch
- if required outputs are missing after `pnpm agent:learn`, treat the run as failed
- if browser profile persistence is lost, do not claim browser-session improvement
- if filesystem persistence is lost, do not claim durable learning
- if selectors drift, do not guess new private selectors; use only the public contract

## Multitasking and hidden tabs

Agent Mode should not require pointer lock or fullscreen.

Visible tab guidance:

- keep actions lightweight
- do not require exclusive keyboard or mouse control

Hidden or minimized guidance:

- hidden tabs may still be throttled by the browser
- progress may continue coarsely, not at perfect realtime
- if progress stalls, use coarse stepping such as `await window.advanceTime(500)`
- continue sending actions at a lower cadence while hidden

Recommended hidden-tab pattern:

```js
await window.advanceTime(500);
```

Do not spam tiny frame steps while hidden.

## Versioning rule

If the SDK sees either of these values change, stop and report the mismatch before continuing:

- `apiVersion !== 1`
- `contract !== "public-agent-v1"`
