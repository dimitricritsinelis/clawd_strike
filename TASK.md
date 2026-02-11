# TASK.md — How to Prompt Codex + Run/Review Work

## How to write a task prompt (use this template)
**Title:** (one feature / bugfix only)

**Goal (1–2 lines):**
What the player should be able to do / what should change.

**Scope:**
- In scope: …
- Out of scope: … (explicitly exclude extras)

**Acceptance criteria (bullet list):**
- ✅ …
- ✅ …
- ✅ …

**Files / areas (if known):**
- `apps/client/...`
- `apps/server/...`
- `packages/shared/...`

**Constraints:**
- Keep server authoritative.
- No new deps unless justified.
- Performance: no per-frame allocations; reuse objects.

**How to test (manual):**
- Steps in the browser (exact clicks/keys).
- Expected results.

**How to test (automated):**
- Commands to run.

---

## Level of detail to give Codex
- Prefer **concrete acceptance criteria** over prose.
- Specify **exact UI/controls** (keys, mouse).
- Specify **network behavior** (client prediction vs server authority).
- Include **file targets** when you can; otherwise ask Codex to propose them first.

---

## Local dev + automatic checks
### Install
```bash
pnpm i
```

### Run locally (two options)
**Option A (recommended):**
```bash
pnpm dev
```

**Option B:**
```bash
pnpm dev:server
pnpm dev:client
```

### Automated tests (run before pushing)
```bash
pnpm test
pnpm lint
pnpm typecheck
```

---

## Manual testing (browser)
1. Start: `pnpm dev`
2. Open: `http://localhost:5173` (client)
3. Confirm:
   - Pointer lock engages on click
   - WASD moves, mouse looks
   - Shoot registers hits
   - Respawn works
   - Basic HUD updates (health/ammo/score if applicable)
4. Multiplayer sanity:
   - Open a **second tab/window** to the same URL
   - Ensure both clients can join the same room and see updates

---

## Git workflow (GitHub + Codex Review)
### Create a branch
```bash
git checkout -b feat/<short-name>
```

### Commit (small, descriptive)
```bash
git add -A
git commit -m "feat: <short description>"
```

### Push
```bash
git push -u origin feat/<short-name>
```

### Open PR
- Mark as **Draft** until checks are green.
- Include:
  - What changed
  - How to test (manual steps)
  - Commands run (`pnpm test/lint/typecheck`)

### Trigger Codex Review
- Convert PR to **Ready for review**, or
- In PR comments, request review explicitly (example):
  - `@codex review`
  - `@codex review for performance + netcode correctness`

### Merge rule
- CI green
- Codex Review addressed (or explicitly acknowledged)
- One human pass on gameplay feel regressions

---

## Parallelization rule (avoid conflicts)
Run parallel Codex tasks only when they touch **different folders**:
- Lane A: `apps/client/*`
- Lane B: `apps/server/*`
- Lane C: `packages/shared/*` (coordinate carefully)

If two tasks must touch the same files, do them sequentially.
