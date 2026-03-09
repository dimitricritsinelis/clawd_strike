import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  STM_ALLOWED_NOTE_TYPES,
  STM_ALLOWED_STATUSES,
  STM_ALLOWED_TAGS,
  STM_FILE_NAME,
  ShortTermMemoryError,
  claimTaskCard,
  compactTaskMemory,
  createTaskCard,
  detectAgentSlug,
  detectCurrentBranch,
  finishTaskCard,
  formatIsoTimestamp,
  joinTaskCard,
  loadShortTermMemoryFile,
  noteTaskCard,
  normalizeShortTermMemory,
  renderShowActive,
  renderTaskCard,
  resolveRepoRelativeCliPath,
  replaceTaskCardContext,
  setTaskCardStatus,
  updateShortTermMemoryFile,
  validateShortTermMemorySource,
  type ShortTermMemoryDocument,
  type ShortTermMemoryNote,
} from "./shortTermMemory.js";

type CliIo = {
  stdout: (value: string) => void;
  stderr: (value: string) => void;
};

type GlobalOptions = {
  force: boolean;
  now: string;
  repoRoot: string;
  remaining: string[];
};

function printUsage(io: CliIo): void {
  io.stdout(`Usage:
  pnpm stm -- show active
  pnpm stm -- show card <id>
  pnpm stm -- new --title "<title>" --tag <tag> --goal "<goal>" --done-when "<done when>" --authority <path> [--authority <path>] [--file <path>] [--next "<next>"]
  pnpm stm -- claim <id> [--owner <slug>] [--branch <branch>]
  pnpm stm -- join <id> [--agent <slug>]
  pnpm stm -- note <id> --type <type> --message "<message>"
  pnpm stm -- status <id> --value <status> [--message "<message>"]
  pnpm stm -- context <id> [--item "<context>"]... [--clear]
  pnpm stm -- finish <id> --outcome "<outcome>"
  pnpm stm -- compact
  pnpm stm -- validate

Global options:
  --repo-root <path>  Use a specific repo root instead of the current directory.
  --now <iso>         Override the timestamp used for notes, ids, and compaction.
  --force             Clear a stale STM lock before writing.
`);
}

function takeFlagValue(args: string[], flag: string): string | undefined {
  const directPrefix = `${flag}=`;
  const index = args.findIndex((arg) => arg === flag || arg.startsWith(directPrefix));
  if (index === -1) return undefined;
  const value = args[index]?.startsWith(directPrefix)
    ? args[index]?.slice(directPrefix.length)
    : args[index + 1];
  if (!value) {
    throw new ShortTermMemoryError(`${flag} requires a value.`);
  }
  if (!args[index]?.startsWith(directPrefix)) {
    args.splice(index, 2);
  } else {
    args.splice(index, 1);
  }
  return value;
}

function takeRepeatedFlagValues(args: string[], flag: string): string[] {
  const values: string[] = [];
  while (true) {
    const value = takeFlagValue(args, flag);
    if (value === undefined) {
      return values;
    }
    values.push(value);
  }
}

function takeBooleanFlag(args: string[], flag: string): boolean {
  const index = args.indexOf(flag);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

function parseGlobalOptions(argv: readonly string[]): GlobalOptions {
  const args = argv.filter((arg) => arg !== "--");
  const remaining = [...args];
  const repoRoot = path.resolve(takeFlagValue(remaining, "--repo-root") ?? process.cwd());
  const now = formatIsoTimestamp(takeFlagValue(remaining, "--now") ?? new Date());
  const force = takeBooleanFlag(remaining, "--force");
  return {
    force,
    now,
    repoRoot,
    remaining,
  };
}

function requireCommand(args: string[]): string {
  const command = args.shift();
  if (!command) {
    throw new ShortTermMemoryError("Missing STM command.");
  }
  return command;
}

function requirePositional(args: string[], label: string): string {
  const value = args.shift();
  if (!value) {
    throw new ShortTermMemoryError(`Missing ${label}.`);
  }
  return value;
}

function ensureNoExtraArgs(args: string[]): void {
  if (args.length > 0) {
    throw new ShortTermMemoryError(`Unexpected arguments: ${args.join(" ")}`);
  }
}

function requireTag(value: string | undefined): (typeof STM_ALLOWED_TAGS)[number] {
  if (!value) {
    throw new ShortTermMemoryError("Missing --tag.");
  }
  if (!(STM_ALLOWED_TAGS as readonly string[]).includes(value)) {
    throw new ShortTermMemoryError(`Invalid tag "${value}". Allowed tags: ${STM_ALLOWED_TAGS.join(", ")}.`);
  }
  return value as (typeof STM_ALLOWED_TAGS)[number];
}

function requireStatus(value: string | undefined): (typeof STM_ALLOWED_STATUSES)[number] {
  if (!value) {
    throw new ShortTermMemoryError("Missing --value.");
  }
  if (!(STM_ALLOWED_STATUSES as readonly string[]).includes(value)) {
    throw new ShortTermMemoryError(`Invalid status "${value}". Allowed statuses: ${STM_ALLOWED_STATUSES.join(", ")}.`);
  }
  return value as (typeof STM_ALLOWED_STATUSES)[number];
}

function requireNoteType(value: string | undefined): ShortTermMemoryNote["type"] {
  if (!value) {
    throw new ShortTermMemoryError("Missing --type.");
  }
  if (!(STM_ALLOWED_NOTE_TYPES as readonly string[]).includes(value)) {
    throw new ShortTermMemoryError(`Invalid note type "${value}". Allowed note types: ${STM_ALLOWED_NOTE_TYPES.join(", ")}.`);
  }
  return value as ShortTermMemoryNote["type"];
}

function defaultStatusMessage(status: (typeof STM_ALLOWED_STATUSES)[number]): string {
  if (status === "blocked") {
    return "Blocked pending the next unblocker.";
  }
  if (status === "handoff") {
    return "Ready for handoff.";
  }
  if (status === "abandoned") {
    return "Task abandoned.";
  }
  return "Status set to active.";
}

async function readDocument(repoRoot: string): Promise<ShortTermMemoryDocument> {
  return loadShortTermMemoryFile(repoRoot);
}

async function runShowCommand(args: string[], repoRoot: string, io: CliIo): Promise<void> {
  const subcommand = requirePositional(args, "show target");
  if (subcommand === "active") {
    ensureNoExtraArgs(args);
    io.stdout(renderShowActive(await readDocument(repoRoot)));
    return;
  }
  if (subcommand === "card") {
    const id = requirePositional(args, "task card id");
    ensureNoExtraArgs(args);
    const document = await readDocument(repoRoot);
    const card = document.cards.find((entry) => entry.id === id);
    if (!card) {
      throw new ShortTermMemoryError(`Unknown task card "${id}".`);
    }
    io.stdout(renderTaskCard(card));
    return;
  }
  throw new ShortTermMemoryError(`Unknown show target "${subcommand}".`);
}

async function runNewCommand(args: string[], options: GlobalOptions, io: CliIo): Promise<void> {
  const title = takeFlagValue(args, "--title");
  const tag = requireTag(takeFlagValue(args, "--tag"));
  const goal = takeFlagValue(args, "--goal");
  const doneWhen = takeFlagValue(args, "--done-when");
  const authority = takeRepeatedFlagValues(args, "--authority");
  const files = takeRepeatedFlagValues(args, "--file");
  const context = takeRepeatedFlagValues(args, "--context");
  const collaborators = takeRepeatedFlagValues(args, "--collaborator");
  const next = takeFlagValue(args, "--next") ?? "Start implementation.";
  const owner = takeFlagValue(args, "--owner") ?? detectAgentSlug();
  const branch = takeFlagValue(args, "--branch") ?? detectCurrentBranch(options.repoRoot);
  const parent = takeFlagValue(args, "--parent");
  const review = takeFlagValue(args, "--review");
  ensureNoExtraArgs(args);

  if (!title || !goal || !doneWhen || authority.length === 0) {
    throw new ShortTermMemoryError("new requires --title, --tag, --goal, --done-when, and at least one --authority.");
  }

  const resolvedAuthority = authority.map((value) => resolveRepoRelativeCliPath(options.repoRoot, value));
  const resolvedFiles = files.map((value) => resolveRepoRelativeCliPath(options.repoRoot, value));

  const result = await updateShortTermMemoryFile(options, (document) => {
    const created = createTaskCard(document, {
      title,
      tag,
      goal,
      doneWhen,
      authority: resolvedAuthority,
      files: resolvedFiles,
      next,
      owner,
      branch,
      now: options.now,
      ...(parent ? { parent } : {}),
      ...(collaborators.length > 0 ? { collaborators } : {}),
      ...(review ? { review } : {}),
      ...(context.length > 0 ? { context } : {}),
    });
    return {
      document: normalizeShortTermMemory(created.document),
      result: created.card.id,
    };
  });

  const card = result.document.cards.find((entry) => entry.id === result.result);
  if (!card) {
    throw new ShortTermMemoryError(`Created card "${result.result}" is missing after write.`);
  }
  io.stdout(renderTaskCard(card));
}

async function runClaimCommand(args: string[], options: GlobalOptions, io: CliIo): Promise<void> {
  const id = requirePositional(args, "task card id");
  const owner = takeFlagValue(args, "--owner") ?? detectAgentSlug();
  const branch = takeFlagValue(args, "--branch");
  ensureNoExtraArgs(args);

  const result = await updateShortTermMemoryFile(options, (document) => {
    const claimed = claimTaskCard(document, id, {
      owner,
      now: options.now,
      ...(branch ? { branch } : {}),
    });
    return {
      document: normalizeShortTermMemory(claimed.document),
      result: claimed.card.id,
    };
  });
  const card = result.document.cards.find((entry) => entry.id === result.result);
  if (!card) {
    throw new ShortTermMemoryError(`Claimed card "${result.result}" is missing after write.`);
  }
  io.stdout(renderTaskCard(card));
}

async function runJoinCommand(args: string[], options: GlobalOptions, io: CliIo): Promise<void> {
  const id = requirePositional(args, "task card id");
  const agent = takeFlagValue(args, "--agent") ?? detectAgentSlug();
  ensureNoExtraArgs(args);

  const result = await updateShortTermMemoryFile(options, (document) => {
    const joined = joinTaskCard(document, id, agent);
    return {
      document: normalizeShortTermMemory(joined.document),
      result: joined.card.id,
    };
  });
  const card = result.document.cards.find((entry) => entry.id === result.result);
  if (!card) {
    throw new ShortTermMemoryError(`Joined card "${result.result}" is missing after write.`);
  }
  io.stdout(renderTaskCard(card));
}

async function runNoteCommand(args: string[], options: GlobalOptions, io: CliIo): Promise<void> {
  const id = requirePositional(args, "task card id");
  const type = requireNoteType(takeFlagValue(args, "--type"));
  const message = takeFlagValue(args, "--message");
  ensureNoExtraArgs(args);
  if (!message) {
    throw new ShortTermMemoryError("note requires --message.");
  }

  const result = await updateShortTermMemoryFile(options, (document) => {
    const noted = noteTaskCard(document, id, {
      timestamp: options.now,
      type,
      message,
    });
    return {
      document: normalizeShortTermMemory(noted.document),
      result: noted.card.id,
    };
  });
  const card = result.document.cards.find((entry) => entry.id === result.result);
  if (!card) {
    throw new ShortTermMemoryError(`Noted card "${result.result}" is missing after write.`);
  }
  io.stdout(renderTaskCard(card));
}

async function runStatusCommand(args: string[], options: GlobalOptions, io: CliIo): Promise<void> {
  const id = requirePositional(args, "task card id");
  const status = requireStatus(takeFlagValue(args, "--value"));
  const message = takeFlagValue(args, "--message") ?? defaultStatusMessage(status);
  ensureNoExtraArgs(args);

  const result = await updateShortTermMemoryFile(options, (document) => {
    const updated = setTaskCardStatus(document, id, {
      status,
      now: options.now,
      message,
    });
    return {
      document: normalizeShortTermMemory(updated.document),
      result: updated.card.id,
    };
  });
  const card = result.document.cards.find((entry) => entry.id === result.result);
  if (!card) {
    throw new ShortTermMemoryError(`Updated card "${result.result}" is missing after write.`);
  }
  io.stdout(renderTaskCard(card));
}

async function runContextCommand(args: string[], options: GlobalOptions, io: CliIo): Promise<void> {
  const id = requirePositional(args, "task card id");
  const clear = takeBooleanFlag(args, "--clear");
  const items = takeRepeatedFlagValues(args, "--item");
  ensureNoExtraArgs(args);
  if (clear && items.length > 0) {
    throw new ShortTermMemoryError("context accepts either --clear or --item values, not both.");
  }

  const result = await updateShortTermMemoryFile(options, (document) => {
    const updated = replaceTaskCardContext(document, id, clear ? [] : items);
    return {
      document: normalizeShortTermMemory(updated.document),
      result: updated.card.id,
    };
  });
  const card = result.document.cards.find((entry) => entry.id === result.result);
  if (!card) {
    throw new ShortTermMemoryError(`Updated card "${result.result}" is missing after write.`);
  }
  io.stdout(renderTaskCard(card));
}

async function runFinishCommand(args: string[], options: GlobalOptions, io: CliIo): Promise<void> {
  const id = requirePositional(args, "task card id");
  const outcome = takeFlagValue(args, "--outcome");
  ensureNoExtraArgs(args);
  if (!outcome) {
    throw new ShortTermMemoryError("finish requires --outcome.");
  }

  const result = await updateShortTermMemoryFile(options, (document) => {
    const finished = finishTaskCard(document, id, {
      outcome,
      now: options.now,
    });
    return {
      document: finished.document,
      result: finished.rollup,
    };
  });
  io.stdout(`- ${result.result.id} | ${result.result.tag} | ${result.result.title} | ${result.result.date} | ${result.result.outcome}\n`);
}

async function runCompactCommand(args: string[], options: GlobalOptions, io: CliIo): Promise<void> {
  ensureNoExtraArgs(args);
  const result = await updateShortTermMemoryFile(options, (document) => ({
    document: compactTaskMemory(document, options.now),
    result: "ok",
  }));
  io.stdout(renderShowActive(result.document));
}

async function runValidateCommand(args: string[], repoRoot: string, io: CliIo): Promise<void> {
  ensureNoExtraArgs(args);
  const source = await readFile(path.join(repoRoot, STM_FILE_NAME), "utf8");
  validateShortTermMemorySource(source);
  io.stdout(`${STM_FILE_NAME} OK\n`);
}

export async function runShortTermMemoryCli(
  argv: readonly string[],
  io: CliIo = {
    stdout: (value) => process.stdout.write(value),
    stderr: (value) => process.stderr.write(value),
  },
): Promise<number> {
  try {
    const options = parseGlobalOptions(argv);
    if (takeBooleanFlag(options.remaining, "--help") || takeBooleanFlag(options.remaining, "-h")) {
      printUsage(io);
      return 0;
    }
    const command = requireCommand(options.remaining);
    if (command === "show") {
      await runShowCommand(options.remaining, options.repoRoot, io);
      return 0;
    }
    if (command === "new") {
      await runNewCommand(options.remaining, options, io);
      return 0;
    }
    if (command === "claim") {
      await runClaimCommand(options.remaining, options, io);
      return 0;
    }
    if (command === "join") {
      await runJoinCommand(options.remaining, options, io);
      return 0;
    }
    if (command === "note") {
      await runNoteCommand(options.remaining, options, io);
      return 0;
    }
    if (command === "status") {
      await runStatusCommand(options.remaining, options, io);
      return 0;
    }
    if (command === "context") {
      await runContextCommand(options.remaining, options, io);
      return 0;
    }
    if (command === "finish") {
      await runFinishCommand(options.remaining, options, io);
      return 0;
    }
    if (command === "compact") {
      await runCompactCommand(options.remaining, options, io);
      return 0;
    }
    if (command === "validate") {
      await runValidateCommand(options.remaining, options.repoRoot, io);
      return 0;
    }
    throw new ShortTermMemoryError(`Unknown STM command "${command}".`);
  } catch (error) {
    if (error instanceof ShortTermMemoryError) {
      io.stderr(`[stm] ${error.message}\n`);
      return 1;
    }
    const message = error instanceof Error ? error.message : "Unknown failure";
    io.stderr(`[stm] ${message}\n`);
    return 1;
  }
}
