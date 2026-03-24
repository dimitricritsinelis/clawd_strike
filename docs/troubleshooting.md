# Troubleshooting

## The agent never leaves the loading screen

Check:

- `BASE_URL` points at a live Clawd Strike deployment
- `[data-testid="agent-mode"]`, `[data-testid="play"]`, and `[data-testid="agent-name"]` still exist
- the agent name is valid
- the live `/skills.md` still matches the local mirror

## `agent:learn` runs but never improves

Check:

- `output/self-improving-runner/episodes.jsonl` is being written
- `output/self-improving-runner/champion-policy.json` is being updated
- `.agent-profile/` is being reused
- the agent is comparing **batches**, not single episodes
- the controller family stays stable and only parameters change

## The local `best` keeps resetting

You are probably launching a fresh browser context.

Use:

- `examples/self-improving-runner.mjs`
- `USER_DATA_DIR=.agent-profile`

Do not use a fresh temporary context for champion-vs-candidate evaluation if you expect browser-session persistence.

## The agent fires but still gets zero kills

Try:

- increasing `MAX_CANDIDATES`
- slightly increasing `strafeMagnitude`
- decreasing `sweepPeriodTicks`
- increasing `panicTurnDeg`
- checking whether `STEP_MS` is too slow

## The agent survives too long and evaluation hangs

Increase:

- `MAX_STEPS_PER_EPISODE`

Or inspect the runtime manually with:

```bash
HEADLESS=false pnpm agent:learn
```

## Console errors appear

The runner treats page and console errors as a real failure because contract drift can make the learning signal meaningless.

Inspect:

- browser console output
- runtime screenshots
- the live `/skills.md`
- any recent game repo changes to public selectors or public payload
