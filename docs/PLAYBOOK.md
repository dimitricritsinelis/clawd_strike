# Clawd Strike learning playbook

## Objective

Make a contextless agent:

1. enter Agent mode
2. play repeated runs
3. keep memory
4. improve
5. repeat

## The minimal architecture

Use four layers:

1. **Public contract adapter**
   - read state
   - send actions
   - detect death
   - click play again

2. **Parameterized controller**
   - generic movement and firing policy
   - small number of tunable values
   - no hidden map assumptions

3. **External memory**
   - `episodes.jsonl`
   - `champion-policy.json`
   - `semantic-memory.json`
   - `hall-of-fame.json`

4. **Optimizer**
   - champion vs candidate
   - batch evaluation
   - promote only on evidence

## Why this beats ad hoc LLM self-editing

A contextless agent is bad at inventing a new game strategy from scratch every run. The public Clawd Strike contract is too sparse for that to be reliable.

A better pattern is:

- keep one stable controller family
- search its parameters
- log outcomes
- keep the champion
- extract short semantic notes

## Bootstrap target

Before optimizing for score:

- require `>= 1` kill in `<= 5` completed attempts

Until this gate is crossed:

- prioritize movement sweep mutations
- prioritize panic reactions after taking damage
- do not overfit to accuracy

## Promotion ladder

Promote only when a candidate beats the champion on batch metrics.

Order:

1. more episodes with a kill
2. more total kills
3. higher best score
4. higher median score
5. higher mean score
6. higher mean survival time
7. higher mean accuracy with comparable shot volume

## Required persistence surfaces

### Browser profile

Needed for browser-session `score.best`.

Recommended default:

- `.agent-profile/`

### Filesystem artifacts

Needed for durable memory.

Recommended default:

- `output/self-improving-runner/`

If either surface is reset, the learning story degrades.

## Anti-patterns

- single-episode promotion
- full controller rewrites every attempt
- chaotic random motion with no memory
- closing the browser between champion and candidate evaluations
- claiming learning without saved artifacts

## What a user should still tune

This starter intentionally leaves room for user control:

- strafe width
- sweep width
- sweep period
- fire burst cadence
- reload threshold
- panic turn
- crouch cadence
- evaluation batch size
- exploration scale

## What the game should expose and what it should not

Safe to expose:

- health
- ammo
- score
- last-run summary
- recent public-safe combat feedback such as damage taken, hit confirmed, kill, reload events, and wave complete

Do **not** expose:

- coordinates
- enemy positions
- landmarks
- routes
- LOS truth
- seeds

The goal is learning from consequences, not leaking hidden state.
