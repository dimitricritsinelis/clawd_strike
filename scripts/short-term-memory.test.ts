import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { runShortTermMemoryCli } from "./lib/shortTermMemoryCli.js";
import {
  createTaskCard,
  migrateProgressToShortTermMemory,
  normalizeShortTermMemory,
  parseShortTermMemory,
  renderShortTermMemory,
  updateShortTermMemoryFile,
  validateShortTermMemoryDocument,
  validateShortTermMemorySource,
  type ShortTermMemoryCard,
  type ShortTermMemoryDocument,
} from "./lib/shortTermMemory.js";

const execFile = promisify(execFileCallback);

const FIXTURE_NOW = "2026-03-09T15:42:33Z";
const LEGACY_PROGRESS_FILE = ["progress", "md"].join(".");
const PROGRESS_FIXTURE = `Audience: human, implementation-agent
Authority: status
Read when: map, visuals, ai, gameplay, ui, public-contract, perf, tooling, docs
Owns: current branch state, active change tag, canonical run commands, next tasks, known risks
Do not use for: workflow policy, durable rationale, public contract details, archive history
Last updated: 2026-03-09

# ${LEGACY_PROGRESS_FILE} — Clawd Strike Status

Original prompt: can we make the font on the champion icon bigger, while ensure the current alignment and placement remain the same

## Active Change Tag
- \`ui-flow\`

## Current Status (<=10 lines)
- Branch \`codex/champion-badge-font\` is pushed and PR \`#10\` is open against \`main\`.
- Increased only the loading-screen shared-champion badge font-size variables in \`apps/client/src/styles.css\`; the badge field boxes, offsets, and placement were left unchanged.
- Ready-state badge sizing now uses \`clamp(13px, 1.18vw, 19px)\` for the champion name and \`clamp(15px, 1.34vw, 21px)\` for the score.
- Unavailable, loading, and empty badge states were raised proportionally so fallback typography still matches the same badge layout.
- Visual verification passed on 2026-03-09 with a seeded local \`AGENT DAN / 40\` badge at \`http://127.0.0.1:4175/?map=bazaar-map\`; the larger text stayed centered in the same name and score windows.
- Validation passed on 2026-03-09: \`pnpm typecheck\`, \`pnpm build\`, \`PW_PORT=4175 pnpm test:playwright\`.
- No public selectors, runtime gameplay, or contract surfaces changed.

## Canonical Playtest URL
- \`http://127.0.0.1:4174/?map=bazaar-map\`

## Map Approval Status
- \`NOT APPROVED\`

## How to Run (real commands only)
\`\`\`bash
pnpm typecheck
pnpm build
PW_PORT=4175 pnpm test:playwright
pnpm --filter @clawd-strike/client exec vite --host --port 4175
\`\`\`

## Last Completed Prompt
- Title: Enlarge the loading-screen champion badge font without moving the badge layout
- Changed: champion badge typography variables only; the name and score slots keep their existing anchored boxes.
- Files: \`apps/client/src/styles.css\`, \`${LEGACY_PROGRESS_FILE}\`
- Validation: \`pnpm typecheck\`, \`pnpm build\`, \`PW_PORT=4175 pnpm test:playwright\`

## Next 3 Tasks
1. Wait for review on PR \`#10\`.
2. If the badge needs more presence, continue adjusting only the shared-champion font variables before changing the field boxes.
3. If requested, align the runtime HUD and death-screen champion typography with the loading-screen badge treatment.

## Known Issues / Risks
- Longer champion names will hit ellipsis slightly sooner because the badge width and alignment were intentionally preserved.
`;

async function createTempRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "clawd-strike-stm-"));
}

async function initGitRepo(repoRoot: string, branch = "main"): Promise<void> {
  await execFile("git", ["init", "--initial-branch", branch, repoRoot]);
  await execFile("git", ["-C", repoRoot, "config", "user.name", "Codex"]);
  await execFile("git", ["-C", repoRoot, "config", "user.email", "codex@example.com"]);
}

function createSeedDocument(now = FIXTURE_NOW): ShortTermMemoryDocument {
  return migrateProgressToShortTermMemory(PROGRESS_FIXTURE, { now, agent: "codex" });
}

async function writeDocument(repoRoot: string, document: ShortTermMemoryDocument): Promise<void> {
  await writeFile(path.join(repoRoot, "short_term_memory.md"), renderShortTermMemory(document), "utf8");
}

async function readDocument(repoRoot: string): Promise<ShortTermMemoryDocument> {
  const source = await readFile(path.join(repoRoot, "short_term_memory.md"), "utf8");
  return validateShortTermMemorySource(source);
}

async function commitAll(repoRoot: string, message: string): Promise<void> {
  await execFile("git", ["-C", repoRoot, "add", "short_term_memory.md"]);
  await execFile("git", ["-C", repoRoot, "commit", "-m", message]);
}

async function runCli(args: string[], repoRoot: string): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const finalArgs = args.some((arg) => arg === "--repo-root" || arg.startsWith("--repo-root="))
    ? [...args]
    : ["--repo-root", repoRoot, ...args];
  const code = await runShortTermMemoryCli(finalArgs, {
    stdout: (value) => {
      stdout += value;
    },
    stderr: (value) => {
      stderr += value;
    },
  });
  return { code, stdout, stderr };
}

function withExtraCards(document: ShortTermMemoryDocument, count: number, options: { longOwner?: boolean } = {}): ShortTermMemoryDocument {
  let working = normalizeShortTermMemory(document);
  for (let index = 0; index < count; index += 1) {
    const owner = options.longOwner ? `owner-${"x".repeat(64)}-${index}` : `agent-${index}`;
    const parent = working.cards[0]?.id;
    const created = createTaskCard(working, {
      title: `Task ${index} ${"detail ".repeat(6).trim()}`,
      tag: "tooling",
      goal: `Handle task ${index}.`,
      doneWhen: `Task ${index} is complete.`,
      authority: ["AGENTS.md", "README.md", "package.json"],
      files: ["scripts/short-term-memory.ts", "scripts/lib/shortTermMemory.ts", "short_term_memory.md"],
      next: `Move task ${index} forward with the next concrete step.`,
      owner,
      branch: `codex/task-${index}`,
      now: `2026-03-09T15:4${index}:33Z`,
      ...(parent ? { parent } : {}),
      collaborators: ["reviewer", "artist"],
      review: "Needs quick review.",
      context: [
        "First context bullet for the task.",
        "Second context bullet for the task.",
        "Third context bullet for the task.",
      ],
    });
    const cardIndex = created.document.cards.findIndex((entry) => entry.id === created.card.id);
    const seededCard = created.document.cards[cardIndex];
    if (!seededCard) {
      throw new Error("Seeded card missing during fixture construction.");
    }
    seededCard.blockers = ["blocker one", "blocker two", "blocker three"];
    seededCard.recentNotes = [
      { timestamp: `2026-03-09T15:5${index}:33Z`, type: "progress", message: "Latest progress note." },
      { timestamp: `2026-03-09T15:4${index}:33Z`, type: "validation", message: "Validation note." },
      { timestamp: `2026-03-09T15:3${index}:33Z`, type: "claim", message: "Claim note." },
    ];
    working = normalizeShortTermMemory(created.document);
  }
  return working;
}

test("parser and serializer round-trip the canonical STM fixture", () => {
  const document = createSeedDocument();
  const source = renderShortTermMemory(document);
  const parsed = normalizeShortTermMemory(parseShortTermMemory(source));
  assert.equal(renderShortTermMemory(parsed), source);
});

test("migration fixture converts the legacy status-file shape into one active card", () => {
  const document = createSeedDocument();
  assert.equal(document.header.canonicalPlaytestUrl, "http://127.0.0.1:4174/?map=bazaar-map");
  assert.equal(document.header.mapApprovalStatus, "NOT APPROVED");
  assert.equal(document.cards.length, 1);
  const card = document.cards[0] as ShortTermMemoryCard;
  assert.equal(card.tag, "ui-flow");
  assert.equal(card.branch, "codex/champion-badge-font");
  assert.deepEqual(card.context, [
    "Only loading-screen shared-champion badge typography changed.",
    "Placement and alignment stayed unchanged.",
    "Longer names ellipsize sooner because badge width stayed fixed.",
  ]);
  assert.equal(card.next, "Wait for review or make a typography-only adjustment if requested.");
});

test("show active and show card print the compact read path", async () => {
  const repoRoot = await createTempRoot();
  try {
    await initGitRepo(repoRoot);
    await writeDocument(repoRoot, createSeedDocument());

    const active = await runCli(["show", "active"], repoRoot);
    assert.equal(active.code, 0);
    assert.match(active.stdout, /Shared Ephemera: none/);
    assert.match(active.stdout, /Active Snapshot:/);
    assert.doesNotMatch(active.stdout, /## Task Cards/);

    const cardId = (await readDocument(repoRoot)).cards[0]?.id;
    assert.ok(cardId);
    const showCard = await runCli(["show", "card", cardId], repoRoot);
    assert.equal(showCard.code, 0);
    assert.match(showCard.stdout, new RegExp(`^### ${cardId} \\| active \\| ui-flow`, "m"));
    assert.doesNotMatch(showCard.stdout, /## Active Snapshot/);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("CLI lifecycle covers new, claim, join, note, status, context, finish, compact, and validate", async () => {
  const repoRoot = await createTempRoot();
  try {
    await initGitRepo(repoRoot);
    await writeDocument(repoRoot, createSeedDocument());

    const created = await runCli([
      "--now",
      "2026-03-09T16:00:00Z",
      "new",
      "--title",
      "Implement STM CLI",
      "--tag",
      "tooling",
      "--goal",
      "Ship the single-file STM helper.",
      "--done-when",
      "The CLI and docs land together.",
      "--authority",
      "AGENTS.md",
      "--authority",
      "README.md",
      "--file",
      "scripts/short-term-memory.ts",
      "--next",
      "Finish the parser and safe-write flow.",
      "--context",
      "Current task is the STM rollout.",
    ], repoRoot);
    assert.equal(created.code, 0);
    const createdId = /^### (STM-[^ ]+)/m.exec(created.stdout)?.[1];
    assert.ok(createdId);

    const claimed = await runCli(["--now", "2026-03-09T16:01:00Z", "claim", createdId, "--owner", "review-bot"], repoRoot);
    assert.equal(claimed.code, 0);
    assert.match(claimed.stdout, /Owner: review-bot/);

    const joined = await runCli(["join", createdId, "--agent", "artist"], repoRoot);
    assert.equal(joined.code, 0);
    assert.match(joined.stdout, /Collaborators: artist/);

    const noted = await runCli([
      "--now",
      "2026-03-09T16:02:00Z",
      "note",
      createdId,
      "--type",
      "progress",
      "--message",
      "Parser round-trips are passing.",
    ], repoRoot);
    assert.equal(noted.code, 0);
    assert.match(noted.stdout, /Parser round-trips are passing\./);

    const blocked = await runCli([
      "--now",
      "2026-03-09T16:03:00Z",
      "status",
      createdId,
      "--value",
      "blocked",
      "--message",
      "Waiting on docs signoff.",
    ], repoRoot);
    assert.equal(blocked.code, 0);
    assert.match(blocked.stdout, /\| blocked \| tooling \|/);

    const context = await runCli([
      "context",
      createdId,
      "--item",
      "Context item one.",
      "--item",
      "Context item two.",
    ], repoRoot);
    assert.equal(context.code, 0);
    assert.match(context.stdout, /Context:\n- Context item one\.\n- Context item two\./);

    const compacted = await runCli(["--now", "2026-03-09T16:04:00Z", "compact"], repoRoot);
    assert.equal(compacted.code, 0);
    assert.match(compacted.stdout, /Active Snapshot:/);

    const validated = await runCli(["validate"], repoRoot);
    assert.equal(validated.code, 0);
    assert.equal(validated.stdout.trim(), "short_term_memory.md OK");

    const finished = await runCli([
      "--now",
      "2026-03-09T16:05:00Z",
      "finish",
      createdId,
      "--outcome",
      "CLI shipped with parser, validator, and docs wiring.",
    ], repoRoot);
    assert.equal(finished.code, 0);
    assert.match(finished.stdout, new RegExp(`^- ${createdId} \\| tooling \\| Implement STM CLI \\| 2026-03-09 \\| CLI shipped`, "m"));

    const document = await readDocument(repoRoot);
    assert.equal(document.cards.some((card) => card.id === createdId), false);
    assert.equal(document.completedRollup[0]?.id, createdId);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("validate rejects duplicate ids, invalid enums, missing fields, bad optional placement, and malformed generated sections", () => {
  const source = renderShortTermMemory(createSeedDocument());
  const cardBlock = source.match(/### STM-[\s\S]+?(?=\n## Recent Completed Rollup)/)?.[0];
  assert.ok(cardBlock);

  const duplicateIdSource = source.replace("\n## Recent Completed Rollup", `\n\n${cardBlock}\n## Recent Completed Rollup`);
  assert.throws(() => validateShortTermMemorySource(duplicateIdSource), /Duplicate card id/);

  const invalidStatusSource = source.replace(/^### (STM-[^ ]+) \| active \|/m, "### $1 | done |");
  assert.throws(() => validateShortTermMemorySource(invalidStatusSource), /Invalid card status/);

  const invalidTagSource = source.replace(/^### (STM-[^ ]+) \| active \| ui-flow \|/m, "### $1 | active | wrong-tag |");
  assert.throws(() => validateShortTermMemorySource(invalidTagSource), /Invalid card tag/);

  const invalidNoteTypeSource = source.replace(/^\- ([^|]+) \| claim \|/m, "- $1 | bogus |");
  assert.throws(() => validateShortTermMemorySource(invalidNoteTypeSource), /Invalid note type/);

  const missingOwnerSource = source.replace(/^Owner: .+\n/m, "");
  assert.throws(() => validateShortTermMemorySource(missingOwnerSource), /Expected "Owner: \.\.\."/);

  const misplacedOptionalSource = source.replace(/Context:\n([\s\S]+?)\nNext:/m, "Next:\n- Wait for review.\nContext:\n$1\nBlockers:");
  assert.throws(() => validateShortTermMemorySource(misplacedOptionalSource), /Context must appear before Blockers/);

  const malformedGeneratedSource = source.replace("<!-- GENERATED END: active-snapshot -->", "<!-- GENERATED END: broken -->");
  assert.throws(() => validateShortTermMemorySource(malformedGeneratedSource), /Missing generated-section marker/);
});

test("validate rejects budget failures for cards, rollup, notes, file size, non-empty lines, and show active output", () => {
  const base = createSeedDocument();

  const tooManyCards = withExtraCards(base, 5);
  assert.throws(() => validateShortTermMemoryDocument(tooManyCards), /at most 5 active cards/);

  const rollupOverflow = normalizeShortTermMemory({
    ...base,
    completedRollup: Array.from({ length: 6 }, (_, index) => ({
      id: `STM-20260309-17000${index}-codex`,
      tag: "tooling",
      title: `Rollup ${index}`,
      date: "2026-03-09",
      outcome: `Outcome ${index}`,
    })),
  });
  assert.throws(() => validateShortTermMemoryDocument(rollupOverflow), /at most 5 entries/);

  const noteOverflow = normalizeShortTermMemory({
    ...base,
    cards: base.cards.map((card, index) => (index === 0 ? {
      ...card,
      recentNotes: [
        { timestamp: "2026-03-09T16:04:00Z", type: "progress", message: "one" },
        { timestamp: "2026-03-09T16:03:00Z", type: "progress", message: "two" },
        { timestamp: "2026-03-09T16:02:00Z", type: "progress", message: "three" },
        { timestamp: "2026-03-09T16:01:00Z", type: "progress", message: "four" },
      ],
    } : card)),
  });
  assert.throws(() => validateShortTermMemoryDocument(noteOverflow), /at most 3 entries/);

  const fileTooLarge = normalizeShortTermMemory({
    ...base,
    cards: base.cards.map((card, index) => (index === 0 ? {
      ...card,
      goal: "x".repeat(8100),
    } : card)),
  });
  assert.throws(() => validateShortTermMemoryDocument(fileTooLarge), /8000 bytes/);

  const lineOverflow = withExtraCards(base, 4);
  lineOverflow.sharedEphemera = ["one", "two", "three"];
  lineOverflow.completedRollup = Array.from({ length: 5 }, (_, index) => ({
    id: `STM-20260309-17100${index}-codex`,
    tag: "tooling",
    title: `Completed ${index}`,
    date: "2026-03-09",
    outcome: `Outcome ${index}`,
  }));
  assert.throws(() => validateShortTermMemoryDocument(lineOverflow), /160 non-empty lines/);

  let showOverflow = normalizeShortTermMemory(base);
  for (let index = 0; index < 4; index += 1) {
    const created = createTaskCard(showOverflow, {
      title: `Overflow task ${index}`,
      tag: "tooling",
      goal: `Goal ${index}.`,
      doneWhen: `Done ${index}.`,
      authority: ["AGENTS.md"],
      files: ["scripts/short-term-memory.ts"],
      next: `Next step ${index}.`,
      owner: `owner-${"x".repeat(140)}-${index}`,
      branch: `codex/show-overflow-${index}`,
      now: `2026-03-09T19:0${index}:00Z`,
    });
    showOverflow = normalizeShortTermMemory(created.document);
  }
  showOverflow.sharedEphemera = [
    "a".repeat(140),
    "b".repeat(140),
    "c".repeat(140),
  ];
  assert.throws(() => validateShortTermMemoryDocument(showOverflow), /show active output must stay within 1200 characters/);
});

test("compact prunes shared ephemera and rollup deterministically", async () => {
  const repoRoot = await createTempRoot();
  try {
    await initGitRepo(repoRoot);
    const base = createSeedDocument();
    const noisy = normalizeShortTermMemory({
      ...base,
      sharedEphemera: ["z item", "a item", "m item", "drop me"],
      completedRollup: Array.from({ length: 6 }, (_, index) => ({
        id: `STM-20260309-17200${index}-codex`,
        tag: "tooling",
        title: `Rollup ${index}`,
        date: `2026-03-0${(index % 5) + 1}`,
        outcome: `Outcome ${index}`,
      })),
    });
    await writeFile(path.join(repoRoot, "short_term_memory.md"), renderShortTermMemory(noisy), "utf8");

    const compacted = await runCli(["--now", "2026-03-09T17:30:00Z", "compact"], repoRoot);
    assert.equal(compacted.code, 0);

    const document = await readDocument(repoRoot);
    assert.deepEqual(document.sharedEphemera, ["a item", "drop me", "m item"]);
    assert.equal(document.completedRollup.length, 5);
    assert.equal(document.header.lastCompacted, "2026-03-09T17:30:00Z");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("same-worktree stale-write detection retries once and preserves the external update", async () => {
  const repoRoot = await createTempRoot();
  try {
    await initGitRepo(repoRoot);
    await writeDocument(repoRoot, createSeedDocument());

    let attempts = 0;
    const result = await updateShortTermMemoryFile({
      repoRoot,
      now: "2026-03-09T18:00:00Z",
      onBeforeHashCheck: async ({ attempt, filePath }) => {
        if (attempt !== 0) return;
        const raw = await readFile(filePath, "utf8");
        const external = normalizeShortTermMemory(parseShortTermMemory(raw));
        external.sharedEphemera = ["external update"];
        await writeFile(filePath, renderShortTermMemory(external), "utf8");
      },
    }, (document) => {
      attempts += 1;
      const created = createTaskCard(document, {
        title: "Retry safe write",
        tag: "tooling",
        goal: "Retry after a stale hash.",
        doneWhen: "The write succeeds on the second attempt.",
        authority: ["AGENTS.md"],
        files: ["scripts/short-term-memory.ts"],
        next: "Confirm the second write keeps both changes.",
        owner: "codex",
        branch: "codex/retry-safe-write",
        now: "2026-03-09T18:00:00Z",
      });
      return {
        document: created.document,
        result: created.card.id,
      };
    });

    assert.equal(attempts, 2);
    const document = await readDocument(repoRoot);
    assert.deepEqual(document.sharedEphemera, ["external update"]);
    assert.equal(document.cards.some((card) => card.id === result.result), true);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("merge smoke keeps parallel independent task cards after a git worktree merge", async () => {
  const repoRoot = await createTempRoot();
  const worktreeA = path.join(repoRoot, "worktree-a");
  const worktreeB = path.join(repoRoot, "worktree-b");
  try {
    await initGitRepo(repoRoot);
    await writeDocument(repoRoot, createSeedDocument());
    await commitAll(repoRoot, "seed stm");

    await execFile("git", ["-C", repoRoot, "branch", "codex/worktree-a"]);
    await execFile("git", ["-C", repoRoot, "branch", "codex/worktree-b"]);
    await mkdir(worktreeA, { recursive: true });
    await mkdir(worktreeB, { recursive: true });
    await execFile("git", ["-C", repoRoot, "worktree", "add", worktreeA, "codex/worktree-a"]);
    await execFile("git", ["-C", repoRoot, "worktree", "add", worktreeB, "codex/worktree-b"]);

    const addA = await runCli([
      "--repo-root",
      worktreeA,
      "--now",
      "2026-03-09T15:40:00Z",
      "new",
      "--title",
      "Branch A card",
      "--tag",
      "tooling",
      "--goal",
      "Add branch A coordination.",
      "--done-when",
      "Branch A state is tracked.",
      "--authority",
      "AGENTS.md",
      "--next",
      "Land the branch A work.",
    ], repoRoot);
    assert.equal(addA.code, 0);
    await commitAll(worktreeA, "add branch a card");

    const addB = await runCli([
      "--repo-root",
      worktreeB,
      "--now",
      "2026-03-09T18:11:00Z",
      "new",
      "--title",
      "Branch B card",
      "--tag",
      "tooling",
      "--goal",
      "Add branch B coordination.",
      "--done-when",
      "Branch B state is tracked.",
      "--authority",
      "README.md",
      "--next",
      "Land the branch B work.",
    ], repoRoot);
    assert.equal(addB.code, 0);
    await commitAll(worktreeB, "add branch b card");

    await execFile("git", ["-C", worktreeA, "merge", "--no-edit", "codex/worktree-b"]);
    const merged = await readDocument(worktreeA);
    assert.equal(merged.cards.some((card) => card.title === "Branch A card"), true);
    assert.equal(merged.cards.some((card) => card.title === "Branch B card"), true);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});
