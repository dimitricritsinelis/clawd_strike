# Playbook

## Workflow

1. Run `pnpm smoke:no-context` to verify the public contract, selectors, and death/retry loop still work.
2. Run `pnpm agent:baseline` to observe fixed-policy behavior before tuning.
3. Run `pnpm agent:self-improve` with a persistent browser profile and writable state root.
4. Review `latest-session-summary.json`, `candidate-summaries/`, and `semantic-memory.json` before changing tuning defaults.

## Required persistence

- Keep the same browser session alive if you want local `score.best` to persist.
- Keep the same `USER_DATA_DIR` across attempts when using the persistent runner.
- Keep the same `STATE_ROOT` if you want episodic, champion, and semantic memory to accumulate honestly.

## Promotion discipline

- Evaluate policies in batches, not one noisy run at a time.
- Promote only when aggregate metrics beat the champion.
- Focus on the bootstrap gate first: `>= 1` kill within `5` completed attempts.
- After the bootstrap gate is met, optimize for kills, score, survival time, and accuracy.

## Public-safe boundaries

- Use only the documented globals, selectors, and public runtime payload.
- Never add map coordinates, hidden enemy positions, routes, LOS truth, seeds, or debug data.
- Keep the controller parameterized and readable so tuning stays auditable.
