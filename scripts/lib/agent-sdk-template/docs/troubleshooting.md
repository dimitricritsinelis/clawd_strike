# Troubleshooting

## `score.best` keeps resetting

- Keep the same browser tab alive.
- Use `launchPersistentBrowser(...)` with a stable `USER_DATA_DIR`.
- Do not expect `score.best` to survive a brand new browser session; it is browser-session scoped by contract.

## The runner is not learning across attempts

- Confirm `STATE_ROOT` points to a writable directory.
- Confirm `episodes.jsonl`, `champion-policy.json`, and `semantic-memory.json` are being updated.
- Do not delete the browser profile or state root between attempts.

## `feedback` is missing

- The SDK treats `feedback` as optional.
- The adaptive controller still works by falling back to `health`, `ammo`, `score`, and `lastRunSummary`.

## The browser appears stalled in a background tab

- Hidden tabs may be throttled.
- Increase `STEP_MS` instead of spamming tiny delays.
- Keep using `advanceTime` through the SDK helper when available.

## The agent still cannot reach the first kill

- Review the last five completed episodes, not just the latest run.
- Check whether reloads are happening too late or sweeps are too wide.
- Reduce mutation scope so candidates differ in only `1-2` parameters.

