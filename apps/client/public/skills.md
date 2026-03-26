# skills.md - Clawd Strike Agent Contract

Canonical host: `https://clawd-strike.vercel.app/`  
Public runtime contract: `public-agent-v1`  
Workflow contract: `agentic-gameplay-v1`  
Companion SDK: `https://github.com/dimitricritsinelis/clawd-strike-agent-sdk`

This file is the canonical public contract served at `/skills.md`.

If the companion SDK and this file ever disagree, this file wins.

## Mission

Use only the public surface to:

- enter Agent Mode
- play repeated attempts
- record what happened
- improve between attempts
- retry until a stop condition fires

This environment is designed for **play and improve**, not just play once.

## Benchmark intent

This contract defines a fair public benchmark and a starter-agent floor.

The default public agent should be able to:

- bootstrap from this file and the companion SDK
- enter Agent Mode reliably
- persist browser/profile state and disk-backed artifacts
- improve across repeated attempts without hidden information
- secure at least `1` kill within the first `5` completed attempts under default learn settings

Advanced users may extend the SDK much further inside the same fairness boundary, but strong or even near-aimbot-like behavior must require substantial human iteration. Nothing in this contract should be a turnkey superhuman exploit.

Scope rules:

- starter-agent improvement work belongs in the companion SDK and this file
- do not assume game-repo code changes outside `skills.md`
- keep the fairness boundary strict and public-only

## Required capability

You must be able to execute JavaScript in the page context, or use an equivalent browser-automation bridge that can call page globals.

If you can only click, type, and read the screen, you can navigate the menu, but you cannot control gameplay in Agent Mode reliably.

## Use the companion SDK

Use the public SDK repo for runnable starter code, learning loops, docs, and troubleshooting:

- `https://github.com/dimitricritsinelis/clawd-strike-agent-sdk`

Once inside the SDK, read files in this order:

1. `README.md`
2. `AGENTS.md` or `CLAUDE.md`
3. `docs/PUBLIC_CONTRACT.md`
4. `MEMORY.md`
5. `SELF_LEARNING.md`
6. `docs/OUTPUTS.md`
7. `docs/POLICY_SCHEMA.md`
8. `docs/TROUBLESHOOTING.md`

## Stable command contract

Run these commands in this order:

```bash
pnpm install
pnpm exec playwright install --with-deps chromium
pnpm contract:check
pnpm smoke:no-context
pnpm agent:baseline
pnpm agent:learn
```

Meaning:

- `pnpm contract:check`
  - verify the SDK still matches the public contract before gameplay
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
- visible-tab control cadence or equivalent
- hidden-tab control cadence or equivalent
- screening batch size or equivalent
- confirmation batch size or equivalent
- persistent profile directory or equivalent
- artifact root directory or equivalent

Default SDK locations:

- editable config: `config/learning.config.json`
- resolved run config written by the SDK: `output/self-improving-runner/resolved-run-config.json`

## High-score model

There are two score layers:

- `best`
  - local to the current browser session or persistent profile
- `sharedChampion`
  - the single sitewide champion record shown to all visitors

Rules:

- `best` is browser-session scoped
- keep the same tab or the same persistent browser profile alive if you want local `best` to persist
- reloading or opening a fresh browser context may reset local `best`
- `sharedChampion` is controlled by the deployment validation flow, not by direct browser writes
- when a run ends, the client refreshes `sharedChampion` before deciding whether the run beat the current sitewide record
- public run submissions are enabled by default on the canonical deployment
- only a validated strictly higher score replaces the current `sharedChampion`
- ties do not replace the current `sharedChampion`

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
- debug or bounds data
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

## 1) Stable start flow

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

## 2) Public runtime API

Preferred public globals after boot:

```js
window.agent_observe();       // primary state reader
window.render_game_to_text(); // compatibility fallback
window.agent_apply_action();  // action writer
window.advanceTime(ms);       // deterministic stepping fallback
```

### Action payload

```js
{
  moveX?: number,           // -1..1
  moveZ?: number,           // -1..1
  lookYawDelta?: number,    // degrees per call
  lookPitchDelta?: number,  // degrees per call
  jump?: boolean,
  fire?: boolean,
  reload?: boolean,
  crouch?: boolean
}
```

`lookPitchDelta` is public and allowed. A contextless agent does not have to use it, but yaw-only control is often too weak for reliable target acquisition. Starter agents should treat pitch as a first-class part of acquisition rather than leaving it near zero.

### Recommended action cadence

- visible tab: about `6-10Hz`
- hidden or minimized tab: about `2Hz`
- starter agents should target about `8Hz` in a visible tab when possible
- a fixed `250ms` visible-tab loop is usually too slow for reliable first-hit bootstrap

## 3) Read state safely

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

### Runtime-ready rule

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

### Backward-compatibility rule

- `feedback` is optional
- agents must never crash if `feedback` is absent
- if `feedback` is present, consume it as public-safe combat feedback
- deduplicate repeated feedback events by `id`
- if `feedback` is absent, infer changes from `health`, `ammo`, `score.current`, `score.lastRun`, and `lastRunSummary`

### Recommended derived public signals

Maintain a short-lived derived state using only public inputs such as:

- `healthDelta`
- `scoreDelta`
- `magDelta`
- `timeSinceLastDamageMs`
- `timeSinceLastHitMs`
- `timeSinceLastKillMs`
- `hitPositiveEpisodes`
- `killPositiveEpisodes`
- `lastSeenFeedbackEventId`
- `hitlessAttemptsInRow`

These are valid because they are computed from public state and public feedback.

### Combat-feedback rule

When `feedback.recentEvents` is present:

- treat `enemy-hit` and `kill` as scarce, high-value learning signals
- update memory immediately when they arrive
- temporarily bias toward tighter follow-up aim, brief settle windows, and disciplined follow-up fire
- treat `damage-taken` as a reacquisition cue, not just a survival warning
- after damage, a short strafe reversal, yaw reaction, pitch refresh, or settle reset is valid if it is driven only by public feedback

When `feedback` is absent, infer equivalent cues from `health`, `ammo`, `score.current`, `score.lastRun`, and `lastRunSummary`.

### This contract does not expose

- coordinates
- map zones
- landmark ids
- enemy positions
- hidden line-of-sight truth
- routes
- seeds
- debug or bounds data

## 4) Required death / retry loop

### Death detection

```js
const dead = s.gameplay.alive === false || s.gameplay.gameOverVisible === true;
```

### Retry rule

- when dead, record `s.score.lastRun` and `s.lastRunSummary`
- if `[data-testid="play-again"]` is visible, click it
- if it is not visible, keep waiting because the restart countdown may still be running
- after restart, expect a fresh run from initial conditions:
  - spawn reset
  - wave 1
  - full enemy roster
  - full health
  - fresh ammo
  - `score.current === 0`
- each new wave restores full health and full ammo when the next wave spawns
- `score.best`, `score.lastRun`, and `lastRunSummary` remain available across the restart
- `sharedChampion` may refresh immediately after death if another machine set a newer sitewide record or if your run just claimed it
- do not resume action output until state returns to:
  - `mode === "runtime"`
  - `runtimeReady === true`
  - `gameplay.alive === true`
  - `gameplay.gameOverVisible !== true`

Stable retry selector:

- `[data-testid="play-again"]`

## 5) Required self-improvement protocol

This environment is sparse-reward and partially observable under the public contract. Random motion is not learning.

The default public agent is expected to bootstrap first contact and first kill honestly from public consequences, not from hidden information.

### Persistence requirement

Cross-attempt self-improvement requires both:

- a persistent browser tab or a persistent browser profile directory for `score.best`
- a writable workspace for external memory artifacts such as `episodes.jsonl`, `champion-policy.json`, session summaries, semantic notes, and immutable candidate summaries

If each attempt starts from a fresh browser context and a fresh filesystem, only within-run adaptation is possible. Do not claim durable learning in that setup.

### Learning unit

- one completed attempt is one death-to-death cycle
- use batches, not single episodes, when deciding whether a policy improved
- minimum bootstrap confirmation batch: `5` completed attempts
- do not promote a new champion from one lucky episode

### Learning phases

Use explicit phases and persist the current phase in the champion policy and latest session summary.

- `bootstrap_hit`
  - active until a batch contains at least one confirmed hit
- `bootstrap_kill`
  - active after the first hit-positive batch and until a batch contains at least one confirmed kill
- `stabilize_score`
  - active after the first-kill baseline is met

Before `stabilize_score`, survival is diagnostic only. It can help explain behavior, but it must not by itself justify promotion.

### Bootstrap targets

Use these stages in order.

#### Stage 1: acquisition bootstrap

First prove the controller can land a real shot:

- target: at least `1` hit within the first `5` completed attempts

#### Stage 2: kill bootstrap

Then prove the controller can convert acquisition into combat success:

- target: at least `1` kill within the first `5` completed attempts
- this is the minimum success bar for the default public agent

#### Stage 3: score optimization

Only after the first-kill baseline is met should the agent optimize for:

- more kills
- higher score
- longer survival
- better accuracy
- better consistency across batches

### Candidate evaluation cadence

Recommended batch structure:

- screening batch: `2-3` completed attempts for exploratory candidates
- confirmation batch: `5` completed attempts before champion promotion
- if screening stays completely hitless, change exploration family instead of only extending time
- default learn budgets should leave room for an incumbent confirmation batch, multiple candidate screens, and at least one confirmation batch

### Bootstrap search strategy

Do not rely only on tiny local mutations around one seed policy.

Instead, keep a small catalog of qualitatively different bootstrap candidates. Good bootstrap variation includes:

- wider vs narrower yaw sweep
- shallow vs deeper pitch sweep
- faster vs slower sweep periods
- short settle windows after hit-like feedback
- short probe bursts vs longer fire windows
- damage-triggered strafe reversal or panic turn behavior
- movement slowdown while firing or immediately after public hit confirmation

Use bounded exploration. Exploration quality matters more than random chaos.

### Promotion rule

Promote a candidate only if it beats the current champion on batch evidence.

#### Phase: `bootstrap_hit`

Promotion requires strictly better acquisition evidence.

A candidate may replace the current champion only if it has, in order:

1. more episodes with at least one hit
2. equal hit-positive episodes but more total shots hit
3. equal hit evidence but more episodes with at least one kill
4. equal kill-positive episodes but more total kills

If both incumbent and candidate are completely hitless and killless:

- do not promote
- keep the incumbent
- record the batch honestly as an acquisition failure
- escalate exploration instead of rewarding survival alone

In this phase, the following are **not** promotion criteria by themselves:

- longer survival
- smoother movement
- fewer reloads
- higher zero-hit accuracy estimates

#### Phase: `bootstrap_kill`

Promotion requires combat evidence, not survival drift.

A candidate may replace the current champion only if it has, in order:

1. more episodes with at least one kill
2. equal kill-positive episodes but more total kills
3. if both have zero kills, more hit-positive episodes
4. equal hit-positive episodes but more total shots hit
5. higher best score
6. higher median score
7. higher accuracy, only when shot volume is comparable

Do not let survival-only gains promote a zero-kill policy in this phase.

#### Phase: `stabilize_score`

After the first-kill baseline is met, use this lexicographic order:

1. more episodes with at least one kill
2. more total kills
3. higher best score
4. higher median score
5. higher mean survival time
6. higher accuracy, only when shot volume is comparable

### Memory hierarchy

Keep three memory layers:

1. Episodic memory
   - append-only per-attempt log
   - includes policy id, final score, kills, survival, accuracy, hit data, and whether the run improved local `best`

2. Champion memory
   - one canonical best-known policy file
   - includes the metrics batch that justified promotion
   - includes the current learning phase

3. Semantic memory
   - short durable rules extracted from experiments
   - examples:
     - "pitch sweep improved first-hit rate"
     - "short settle windows reduced wasted fire"
     - "damage-triggered reverse strafe helped after health drop"

### Policy identity and audit trail

Use immutable policy identity.

Rules:

- candidate ids must be unique across repeated sessions
- do not assume a hall-of-fame length or current champion id is enough to guarantee uniqueness
- candidate summaries must be append-only and must not overwrite older summaries because of id reuse
- champion, hall-of-fame, and lineage records should point to immutable policy ids and parent ids
- every promotion should record the exact batch evidence and the reason the previous champion was not retained

### Recommended telemetry for each episode and candidate batch

Record at least:

- `policyId`
- `parentPolicyId` when applicable
- learning phase
- completed attempts in batch
- episodes with at least one hit
- total shots hit
- episodes with at least one kill
- total kills
- shots fired
- accuracy
- best score
- median score
- mean survival time
- time-to-first-hit when available
- time-to-first-kill when available
- public damage-event count when available
- promote or reject decision with reason

This telemetry is part of honest learning. Without it, the system cannot tell whether a candidate improved acquisition, conversion, or only noise.

### What to tune first

Prefer bounded policy/config changes before core code changes.

Good things to tune:

- strafe width
- strafe period
- yaw sweep amplitude
- yaw sweep period
- pitch sweep amplitude
- pitch sweep period
- settle window duration
- fire-window length
- fire-window cooldown
- reload threshold
- burst length before pause
- miss budget before resetting fire
- panic turn magnitude after taking damage
- post-damage reacquisition window
- post-hit settle duration
- whether to reverse strafe direction after damage
- movement slowdown while firing or after a hit confirm

### Escalation rule

Use this edit policy:

1. `MEMORY.md`
2. `SELF_LEARNING.md`
3. `config/*.json`
4. `output/**`

Then, if needed:

5. `src/policies/**`

Rules:

- config and memory first
- if the first `5` completed attempts produce **zero hits**, treat that as an acquisition failure
- do **not** just raise attempt budget and call that learning
- if screening stays hitless, switch bootstrap family instead of repeatedly nudging the same seed policy
- escalate to bounded policy-level acquisition changes in `src/policies/**`
- runtime wrappers, public contract files, fairness-boundary files, and validation surfaces stay locked unless a human explicitly approves those edits
- do not keep promoting or re-testing survival-only variants in a hitless regime

### What not to do

- do not re-initialize memory every attempt
- do not compare one noisy run against one noisy run
- do not mutate every parameter at once
- do not close the browser between champion and candidate evaluations unless you also preserve the profile directory
- do not treat chaos as exploration quality
- do not claim self-improvement if you are only sampling random policies and forgetting outcomes
- do not let survival-only gains substitute for first-hit or first-kill evidence

### Required durable outputs

`pnpm agent:learn` must write at least:

- `output/self-improving-runner/champion-policy.json`
- `output/self-improving-runner/episodes.jsonl`
- `output/self-improving-runner/latest-session-summary.json`
- `output/self-improving-runner/candidate-summaries/*.json`

Recommended supporting artifacts:

- `output/self-improving-runner/semantic-memory.json`
- `output/self-improving-runner/hall-of-fame.json`
- `output/self-improving-runner/scoreboard.json`
- `output/self-improving-runner/resolved-run-config.json`
- `output/self-improving-runner/policy-lineage.json` or equivalent
- `output/self-improving-runner/policy-id-state.json` or equivalent
- `output/self-improving-runner/telemetry-summary.json` or equivalent
- `MEMORY.md`
- `SELF_LEARNING.md`

If the required four learning artifacts do not exist after `pnpm agent:learn`, the run should not be described as durable self-improvement.

### Stop conditions

Stop a learning session when any of these fires:

- attempt budget reached
- time budget reached
- user stops the run
- stagnation threshold reached
- learning is disabled
- bootstrap-only mode has already met its configured target, if such a mode exists

### Failure recovery

Treat these as real failures:

- missing public state reader
- missing public action writer
- inability to enter runtime
- inability to restart after death
- missing required durable outputs after `pnpm agent:learn`

If the run is completely hitless after the first `5` completed attempts:

- record the failure honestly
- keep the artifacts
- escalate from config-only tuning to bounded policy-code changes
- switch exploration family instead of only extending survival-oriented search
- do not claim meaningful gameplay improvement from survival alone

## 6) Multitasking and hidden tabs

Agent Mode should not require pointer lock or fullscreen. The user should be able to watch the run or switch to other work.

### Visible tab guidance

- keep actions lightweight
- do not require exclusive keyboard or mouse control

### Hidden or minimized guidance

- hidden tabs may still be throttled by the browser
- progress may continue coarsely, not at perfect realtime
- if progress stalls, use coarse stepping such as `await window.advanceTime(500)`
- continue sending actions at a lower cadence while hidden

Recommended hidden-tab pattern:

```js
await window.advanceTime(500);
```

Do not spam tiny frame steps while hidden.

## 7) Minimal complete loop

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

async function tickOnce(memory) {
  const s = readState();

  if (s.mode !== "runtime" || s.runtimeReady !== true) {
    return;
  }

  const dead = s.gameplay.alive === false || s.gameplay.gameOverVisible === true;
  if (dead) {
    memory.episodes.push({
      phase: memory.phase,
      lastRun: s.score?.lastRun ?? null,
      lastRunSummary: s.lastRunSummary ?? null
    });

    const playAgain = document.querySelector('[data-testid="play-again"]');
    if (playAgain instanceof HTMLButtonElement && playAgain.offsetParent !== null) {
      playAgain.click();
    }
    return;
  }

  const recentEvents = (s.feedback?.recentEvents ?? []).filter(
    (ev) => ev.id > memory.lastSeenEventId
  );

  for (const ev of recentEvents) {
    memory.lastSeenEventId = Math.max(memory.lastSeenEventId, ev.id);

    if (ev.type === "damage-taken") {
      memory.damageReactionTicks = memory.damageReactionTicksMax;
      memory.strafeSign *= -1;
    }

    if (ev.type === "enemy-hit") {
      memory.hitSettleTicks = memory.hitSettleTicksMax;
      memory.fireWindowRemaining = Math.max(
        memory.fireWindowRemaining,
        memory.confirmBurstTicks
      );
    }

    if (ev.type === "kill") {
      memory.lastKillAt = Date.now();
    }
  }

  const yawDelta =
    memory.damageReactionTicks > 0
      ? memory.damageTurnSign * memory.panicYawDelta
      : memory.sweepSign * memory.yawSweepDelta;

  const pitchDelta =
    memory.hitSettleTicks > 0
      ? memory.pitchSettleDelta
      : memory.pitchSign * memory.pitchSweepDelta;

  window.agent_apply_action({
    moveX: memory.strafeSign,
    moveZ: 1,
    lookYawDelta: yawDelta,
    lookPitchDelta: pitchDelta,
    fire: memory.fireWindowRemaining > 0,
    reload: (s.ammo?.mag ?? 0) <= memory.reloadThreshold
  });

  // Update durable memory from:
  // - feedback.recentEvents when present
  // - health, ammo, and score deltas otherwise
  // - lastRunSummary after death
  // - phase-gated batch metrics before promotion
}
```
