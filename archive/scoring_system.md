# Scoring System (Agent Competition) — v2 (Proposed)

This document defines a **deterministic, single-number score** for evaluating agents in Clawd Strike.
It is written to be easy to tune over time without ambiguity.

---

## Goals
- **Deterministic**: same seed + same inputs ⇒ same score.
- **Agent-friendly**: score is machine-readable and emitted via runtime state (`window.render_game_to_text()`).
- **Rewards skill**: kills, headshots, damage output, wave clears.
- **Penalizes inefficiency**: wasted shots, damage taken.
- **Exploit-resistant**: avoid overkill inflation, friendly-fire farming, stalling loops.

## Non-goals (for v2)
- Anti-cheat / secure scoring for public deployment (server authority, replays, attestation).
- Multiplayer/PvP scoring.
- Economy/loadouts/objectives beyond current PvE wave loop.

---

## 1) Episode Definition (what gets scored)

### 1.1 Episode format
- **Format**: fixed-time, multi-wave PvE.
- **Default duration**: `episodeDurationS = 180` seconds (3 minutes).
- **Start**: when gameplay runtime is active and Wave 1 enemies are spawned.
- **End** (first that triggers):
  - **Death**: player HP reaches 0 → episode ends immediately.
  - **Time limit**: `episodeElapsedS >= episodeDurationS`.

### 1.2 Episode mode (recommended URL shape)
Use an explicit agent mode so tuning doesn’t affect human play UX.

Example:
`http://127.0.0.1:5174/?map=bazaar-map&mode=agent&episode=1&episodeDurationS=180&autostart=agent&seed=123`

---

## 2) Metrics (authoritative definitions)

All metrics are totals over the entire episode unless stated otherwise.

### 2.1 Output metrics (rewarded)
- `shotsFired`: number of bullets fired by the player.
- `shotsHitEnemy`: bullets that hit an enemy (enemy AABB re-check confirms hit).
- `damageDealtEffective`: **effective** damage applied to enemies (overkill-clamped; see §3).
- `kills`: enemies killed **by the player** (as defined by effective damage bringing enemy HP to 0).
- `headshotKills`: subset of `kills` where the *killing hit* is a headshot.
- `wavesCleared`: number of waves fully cleared (all enemies dead).

### 2.2 Input metrics (penalized)
- `damageTaken`: total HP lost by the player during the episode.
- `died`: boolean (true if episode ended due to HP reaching 0).

### 2.3 Debug-only / optional (not part of score unless explicitly added)
- `episodeElapsedS`, `episodeDurationS`
- `wavesStarted`
- `accuracyEnemy = shotsHitEnemy / shotsFired` (if `shotsFired > 0`, else undefined)

---

## 3) Effective Damage (anti-overkill rule)

### 3.1 Why
We must prevent score inflation by “overkilling” enemies (e.g., if future weapons do >100 damage).
Score should reflect **how much HP was actually removed**, not raw damage numbers.

### 3.2 Rule
Maintain `enemyHpRemaining[enemyId]` for the current wave, initialized to `100` when the wave starts.

When the player hits an enemy:
- `effective = min(rawDamage, enemyHpRemaining[enemyId])`
- `enemyHpRemaining[enemyId] -= effective`
- Add `effective` to:
  - `damageDealtEffective`
  - score via `POINTS_PER_DAMAGE_HP`

### 3.3 Kill attribution (player-only)
A **player kill** is credited when the player’s hit causes:
- `enemyHpRemaining[enemyId]` to reach `0` (first time in that wave)

This definition makes scoring robust to:
- enemy-vs-enemy interactions (if they exist)
- future hazards / environmental damage
- future co-op or multiple damage sources

### 3.4 Reset timing
Reset `enemyHpRemaining` for all enemies **on wave start**.

---

## 4) Score Formula (single scalar)

### 4.1 Online accumulation
Score is updated incrementally as events happen.

Final score:
```
finalScore = max(0, floor(score))
```

### 4.2 Components (v2 proposed defaults)
| Component | Symbol | Default | Notes |
|---|---:|---:|---|
| Effective damage dealt | `POINTS_PER_DAMAGE_HP` | `+0.01` | +0.01 per HP removed (overkill-clamped) |
| Kill bonus | `KILL_BONUS` | `+0.2` | per player kill |
| Headshot kill bonus | `HEADSHOT_KILL_BONUS` | `+0.25` | additional per headshot kill |
| Wave clear bonus | `WAVE_CLEAR_BONUS` | `+2` | per fully cleared wave |
| Shot penalty | `SHOT_PENALTY` | `-0.02` | per bullet fired (accuracy pressure) |
| Damage taken penalty | `DAMAGE_TAKEN_PENALTY` | `-0.02` | per HP lost (survival pressure) |

### 4.3 Full formula
```
score =
  + POINTS_PER_DAMAGE_HP      * damageDealtEffective
  + KILL_BONUS                * kills
  + HEADSHOT_KILL_BONUS       * headshotKills
  + WAVE_CLEAR_BONUS          * wavesCleared
  + SHOT_PENALTY              * shotsFired
  + DAMAGE_TAKEN_PENALTY      * damageTaken
```

### 4.4 Worked example
Assume in a 180s episode:
- `wavesCleared = 2` (18 kills total)
- `kills = 18`
- `headshotKills = 10`
- `damageDealtEffective = 18 * 100 = 1800`
- `shotsFired = 120`
- `damageTaken = 40`

Score:
- Damage: `1800 * 0.01 = 18`
- Kills: `18 * 0.2 = 3.6`
- HS kills: `10 * 0.25 = 2.5`
- Waves: `2 * 2 = 4`
- Shots: `120 * -0.02 = -2.4`
- Damage taken: `40 * -0.02 = -0.8`

Total: `18 + 3.6 + 2.5 + 4 - 2.4 - 0.8 = 24.9`
Final: `max(0, floor(24.9)) = 24`

---

## 5) Event-to-score Mapping (algorithm)

### On bullet fired
- `shotsFired += 1`
- `score += SHOT_PENALTY`

### On enemy hit (confirmed)
- `shotsHitEnemy += 1`
- Compute `effectiveDamage` per §3
- `damageDealtEffective += effectiveDamage`
- `score += POINTS_PER_DAMAGE_HP * effectiveDamage`
- If this hit makes enemy HP reach 0:
  - `kills += 1`
  - `score += KILL_BONUS`
  - If this hit is headshot:
    - `headshotKills += 1`
    - `score += HEADSHOT_KILL_BONUS`

### On wave cleared
- `wavesCleared += 1`
- `score += WAVE_CLEAR_BONUS`

### On player damage taken
- `damageTaken += deltaHp`
- `score += DAMAGE_TAKEN_PENALTY * deltaHp`

### On episode end
- Freeze score and counters (no further changes)
- `done = true`
- `reason = "death" | "time_limit"`

---

## 6) Tie-breakers (optional but recommended for leaderboards)
If you need deterministic ordering beyond `finalScore`:
1) `wavesCleared` (desc)
2) `finalScore` (desc)
3) `kills` (desc)
4) `damageTaken` (asc)
5) `shotsFired` (asc)

---

## 7) Output Contract (what agents read)

Agents and evaluation harnesses should treat scoring as a structured payload emitted via:
- `window.render_game_to_text()`

Recommended payload shape:
```json
{
  "score": {
    "scoringVersion": "v2",
    "enabled": true,
    "done": false,
    "reason": null,
    "episodeElapsedS": 12.4,
    "episodeDurationS": 180,
    "finalScore": 0,
    "breakdown": {
      "shotsFired": 0,
      "shotsHitEnemy": 0,
      "kills": 0,
      "headshotKills": 0,
      "damageDealtEffective": 0,
      "damageTaken": 0,
      "wavesCleared": 0
    }
  }
}
```

Stop condition for automated evaluation:
- poll until `score.done === true`, then record `score.finalScore` (and optionally the breakdown).

---

## 8) Anti-exploit rules (MUST keep true)
- **Overkill clamp**: damage is scored as `effectiveDamage`, not raw damage.
- **Player-only kill credit**: kills are credited only when the player reduces enemy HP to 0 (per-wave HP tracking).
- **No friendly-fire farming (agent mode)**: enemies must not target/kill each other in scored episodes.
- **Episode ends on death**: prevents “respawn to reposition” strategies and simplifies evaluation.
- **Simulation-time based**: episode clock uses simulation `dt` so `advanceTime()` remains valid.

---

## 9) Tuning Guide (how to update scoring safely)

### 9.1 What each constant does
- `SHOT_PENALTY` (more negative) ⇒ stronger accuracy pressure.
- `DAMAGE_TAKEN_PENALTY` (more negative) ⇒ stronger survival pressure.
- `WAVE_CLEAR_BONUS` (bigger) ⇒ stronger “play fast / push waves” incentive.
- `HEADSHOT_KILL_BONUS` (bigger) ⇒ stronger precision incentive.
- `KILL_BONUS` (bigger) ⇒ shifts reward from pure DPS to finishing targets.

### 9.2 Tuning ranges (starting guidance)
- `SHOT_PENALTY`: `-0.01` to `-0.04`
- `DAMAGE_TAKEN_PENALTY`: `-0.01` to `-0.05` (use higher magnitude only if you want “no-hit” play to dominate)
- `WAVE_CLEAR_BONUS`: `+1` to `+4`
- `HEADSHOT_KILL_BONUS`: `+0.1` to `+0.5`
- `KILL_BONUS`: `+0.1` to `+0.4`

### 9.3 Versioning rules (important)
- Any change to:
  - score formula
  - constants
  - episode definition / termination rules
  - kill attribution rules  
  requires bumping:
- `scoringVersion: "v3"`, `"v4"`, ...

Never compare scores across versions on the same leaderboard unless you explicitly normalize.

---

## 10) Future extensions (not in v2, but compatible)
- Objective points (capture/hold zones, item pickup, escort).
- “Style” bonuses (kill streaks, multi-kills) — careful: can be exploitable.
- Movement constraints/bonuses (time spent moving, coverage) — only if gameplay needs it.
- Ammo economy / reload management — only if ammo becomes a meaningful resource.
