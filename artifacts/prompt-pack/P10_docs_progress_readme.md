<!-- Save as: /Users/dimitri/Desktop/ClawdStrike_v2/artifacts/prompt-pack/P10_docs_progress_readme.md -->

**Title:** Documentation sync (progress.md + README) for bazaar-map MVP

**Read first:**
- `/Users/dimitri/Desktop/ClawdStrike_v2/AGENTS.md`
- `/Users/dimitri/Desktop/ClawdStrike_v2/progress.md`
- Root README:
  - `/Users/dimitri/Desktop/ClawdStrike_v2/README.md`
- Client scripts (to ensure commands are real):
  - `/Users/dimitri/Desktop/ClawdStrike_v2/package.json`
  - `/Users/dimitri/Desktop/ClawdStrike_v2/apps/client/package.json`

**Goal (1 sentence):** Update `progress.md` and `README.md` so they accurately reflect the restored runtime, canonical URL, real commands, and current MVP map status.

**Non-goals:**
- Do NOT add additional process docs beyond these updates.
- Do NOT paste logs or transcripts into progress.md.

**Implementation plan (file-specific, numbered):**
1) Dependencies: should be last to reduce churn; ok anytime if kept small.
2) Update `/Users/dimitri/Desktop/ClawdStrike_v2/progress.md` to match AGENTS.md structure and current reality:

   Must include:
   - Canonical playtest URL (single URL):
     - `http://127.0.0.1:5174/?map=bazaar-map&shot=compare`
   - Map approval status line
   - Real commands only:
     - `pnpm dev`
     - `pnpm typecheck`
     - `pnpm build`
   - Current status ≤ 10 lines
   - Last completed prompt (summary + files touched)
   - Next 3 tasks
   - Known issues / risks (short bullets)
3) Update `/Users/dimitri/Desktop/ClawdStrike_v2/README.md`:
   - Replace “Loading Screen Only” messaging once runtime exists
   - Add:
     - how to run
     - canonical URL (same as progress.md)
     - brief statement of MVP scope (blockout map traversal)

**Acceptance checks (observable):**
- ✅ map loads via canonical URL (link in docs is correct)
- ✅ movement + collision still works (or is newly added) (docs do not lie)
- ✅ entire map remains traversable (docs reflect current state)
- ✅ blockout colors/readability improved (docs reflect current state)
- ✅ determinism preserved (docs mention seed/shot behavior if implemented)
- ✅ progress.md stays short and structured (no noise)

**Validation (commands that exist):**
```bash
pnpm typecheck
pnpm build
```

Screenshots (exactly 2):
- `artifacts/screenshots/P10/before.png`
- `artifacts/screenshots/P10/after.png`

Reset & Open:
```bash
pnpm dev
```
Open:
- `http://127.0.0.1:5174/?map=bazaar-map&shot=compare`

Progress update (required):
- Update `progress.md` (this is the deliverable for this prompt).
