# Tuning guide

## First principles

Clawd Strike under the public contract is a sparse-reward control problem.

That means:

- change a little
- compare on batches
- keep evidence
- avoid noisy promotions

## High-value parameters

### `strafeMagnitude`

- Too low: agent becomes easy to hit
- Too high: agent over-rotates its firing lane

Recommended search range:

- `0.12 .. 0.45`

### `strafePeriodTicks`

- Too low: jittery aim
- Too high: predictable drift

Recommended search range:

- `8 .. 28`

### `sweepAmplitudeDeg`

- Too low: weak area coverage
- Too high: overshoot and wasted fire

Recommended search range:

- `0.7 .. 2.2`

### `sweepPeriodTicks`

- Too low: frantic sweep
- Too high: stale vision pattern

Recommended search range:

- `12 .. 32`

### `fireBurstLengthTicks`

- Too low: under-firing
- Too high: mag dump with poor control

Recommended search range:

- `1 .. 4`

### `fireBurstCooldownTicks`

- Too low: constant spam
- Too high: missed opportunities

Recommended search range:

- `2 .. 8`

### `reloadThreshold`

- Too low: dead clicks
- Too high: unnecessary reloads

Recommended search range:

- `2 .. 5`

### `panicTurnDeg`

- Too low: weak reaction after damage
- Too high: violent overshoot

Recommended search range:

- `4 .. 10`

## Batch sizes

For the baseline target:

- `BASELINE_DEATHS=5`
- `CANDIDATE_DEATHS=5`

For longer score optimization:

- `BASELINE_DEATHS=7`
- `CANDIDATE_DEATHS=7`

## Stagnation handling

If no promotion occurs for many candidates:

- widen mutation magnitude
- occasionally pick a non-champion parent from the hall of fame
- do not delete history

## Acceptance discipline

Good:

- "Candidate achieved more kill-positive episodes across 5 attempts"

Bad:

- "Candidate had one lucky run"

## When to stop

Stop a session when:

- the baseline gate is crossed and the current user only wanted proof of intelligence
- or promotions flatten and the hall of fame converges
- or the user wants to inspect the current champion and tune manually
