# Clawd Strike Agent SDK

This repo is the public companion SDK for the browser-only Clawd Strike contract served at [{{PUBLIC_AGENT_CANONICAL_SKILLS_URL}}]({{PUBLIC_AGENT_CANONICAL_SKILLS_URL}}).

The main game repo exports this SDK snapshot. If the SDK and `/skills.md` ever disagree, follow the live contract.

## What this SDK supports

- Enter Agent mode through the documented public selectors.
- Play repeated runs with a persistent browser profile.
- Preserve local browser-session `score.best` while the same tab or browser session stays alive.
- Store durable external memory across attempts.
- Promote better policies over worse ones with deterministic batch evaluation.
- Keep trying to beat `score.best` without using hidden state, map coordinates, or aimbot logic.

## Honest limits

- `score.best` stays browser-session scoped. Keep the same tab alive, or keep one persistent browser context/profile open while iterating.
- Durable self-improvement also requires a writable filesystem for artifacts like `episodes.jsonl`, `champion-policy.json`, and `semantic-memory.json`.
- The controller is intentionally public-safe and not overpowered. It only uses the documented browser payload plus optional public `feedback`.
- If the page is fully throttled or the browser is restarted into a fresh session, local progress can reset even if exported memory files remain.

## Minimum target

The first milestone is practical, not magical:

- reach at least `1` kill within `5` completed attempts

After that, the runner optimizes for kills, score, survival time, and accuracy.

## Quick start

```bash
pnpm install
pnpm exec playwright install --with-deps chromium
pnpm smoke:no-context
pnpm agent:self-improve
```

Useful environment overrides:

```bash
BASE_URL={{PUBLIC_AGENT_CANONICAL_HOST}} \
HEADLESS=false \
STATE_ROOT=output/self-improving-runner \
USER_DATA_DIR=output/self-improving-runner/browser-profile \
pnpm agent:self-improve
```

## Included workflows

- `pnpm smoke:no-context`: public contract smoke using a non-persistent browser.
- `pnpm agent:baseline`: fixed-parameter repeated runs for manual inspection.
- `pnpm agent:self-improve`: persistent-profile learning loop with file-backed memory and champion promotion.

## Artifact layout

- `episodes.jsonl`: append-only episodic memory
- `champion-policy.json`: current promoted policy
- `semantic-memory.json`: durable lessons extracted from experiments
- `hall-of-fame.json`: a small pool of strong historical policies
- `latest-session-summary.json`: last runner session summary
- `candidate-summaries/*.json`: per-candidate batch summaries

The SDK keeps all of those files under `output/self-improving-runner/` by default.
