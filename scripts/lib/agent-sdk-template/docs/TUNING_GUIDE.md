# Tuning Guide

## Controller parameters

- `strafeWidth`: lateral movement amplitude. Larger values explore more but can overexpose the agent.
- `strafePeriodTicks`: how quickly strafe direction oscillates.
- `sweepAmplitudeDeg`: horizontal look sweep size.
- `sweepPeriodTicks`: how quickly the look sweep reverses.
- `burstLengthTicks`: how long the trigger stays down during a burst.
- `burstCooldownTicks`: pause between bursts.
- `reloadThreshold`: magazine threshold that triggers reload.
- `panicTurnDeg`: one-sided turn boost after recent damage.
- `panicHoldTicks`: how many ticks the panic reaction persists.
- `reverseStrafeAfterDamage`: whether to flip strafe direction after taking damage.
- `crouchEveryTicks` and `crouchHoldTicks`: optional crouch cadence.

## Practical guidance

- When the agent cannot get its first kill, bias tuning toward tighter sweeps, safer reload timing, and stronger panic recovery.
- When kill-positive episodes appear but scores plateau, tune burst cadence and sweep timing before widening movement.
- Prefer small deterministic mutations that touch `1-2` parameters at a time.
- Do not treat random thrashing as exploration quality.

## Promotion ladder

Candidate batches are compared lexicographically:

1. more kill-positive episodes
2. more total kills
3. higher best score
4. higher median score
5. higher mean score
6. higher mean survival time
7. higher mean accuracy when mean shot volume is within `±20%`
