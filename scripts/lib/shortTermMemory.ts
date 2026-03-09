import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const STM_FILE_NAME = "short_term_memory.md";
export const STM_LOCK_NAME = `${STM_FILE_NAME}.lock`;
export const STM_TEMP_PREFIX = `${STM_FILE_NAME}.tmp-`;
export const STM_SCHEMA_VERSION = "stm-v2";
export const STM_ALLOWED_TAGS = [
  "map-geometry",
  "map-visual",
  "movement-sim",
  "combat-gameplay",
  "bot-ai",
  "ui-flow",
  "public-contract",
  "perf",
  "tooling",
  "docs",
] as const;
export const STM_ALLOWED_STATUSES = ["active", "blocked", "handoff", "abandoned"] as const;
export const STM_ALLOWED_NOTE_TYPES = [
  "claim",
  "progress",
  "blocker",
  "mistake",
  "lesson",
  "validation",
  "handoff",
  "decision",
] as const;

const TITLE_LINE = "# short_term_memory.md - Clawd Strike Status";
const ACTIVE_SNAPSHOT_HEADING = "## Active Snapshot";
const ACTIVE_SNAPSHOT_START = "<!-- GENERATED START: active-snapshot -->";
const ACTIVE_SNAPSHOT_END = "<!-- GENERATED END: active-snapshot -->";
const SHARED_EPHEMERA_HEADING = "## Shared Ephemera";
const TASK_CARDS_HEADING = "## Task Cards";
const COMPLETED_ROLLUP_HEADING = "## Recent Completed Rollup";
const COMPLETED_ROLLUP_START = "<!-- TOOL-MANAGED START: completed-rollup -->";
const COMPLETED_ROLLUP_END = "<!-- TOOL-MANAGED END: completed-rollup -->";

const MAX_ACTIVE_CARDS = 5;
const MAX_ROLLUP_ENTRIES = 5;
const MAX_SHARED_EPHEMERA = 3;
const MAX_CARD_LIST_ITEMS = 3;
const MAX_RECENT_NOTES = 3;
const MAX_NOTE_MESSAGE_LENGTH = 140;
const MAX_SHARED_EPHEMERA_LENGTH = 140;
const MAX_FILE_BYTES = 8000;
const MAX_NON_EMPTY_LINES = 160;
const MAX_SHOW_ACTIVE_CHARS = 1200;
const MAX_SHOW_ACTIVE_LINES = 12;
const LOCK_STALE_MS = 10 * 60 * 1000;
const SNAPSHOT_TITLE_MAX = 28;
const SNAPSHOT_NEXT_MAX = 28;
const SHOW_EPHEMERA_ITEM_MAX = 48;

const HEADER_DEFAULTS = Object.freeze({
  audience: "human, implementation-agent",
  authority: "status",
  readWhen: "map, visuals, ai, gameplay, ui, public-contract, perf, tooling, docs",
  owns: "repo-wide short-lived coordination state, active task claims, current blockers, recent completed outcomes",
  doNotUseFor: "workflow policy, durable rationale, archive history, product truth already owned by specs/contracts",
  schemaVersion: STM_SCHEMA_VERSION,
  canonicalPlaytestUrl: "http://127.0.0.1:4174/?map=bazaar-map",
  mapApprovalStatus: "NOT APPROVED",
});

type StmTag = typeof STM_ALLOWED_TAGS[number];
type StmStatus = typeof STM_ALLOWED_STATUSES[number];
type StmNoteType = typeof STM_ALLOWED_NOTE_TYPES[number];

export type ShortTermMemoryHeader = {
  audience: string;
  authority: string;
  readWhen: string;
  owns: string;
  doNotUseFor: string;
  schemaVersion: string;
  canonicalPlaytestUrl: string;
  mapApprovalStatus: string;
  lastCompacted: string;
};

export type ShortTermMemoryNote = {
  timestamp: string;
  type: StmNoteType;
  message: string;
};

export type ShortTermMemoryCard = {
  id: string;
  status: StmStatus;
  tag: StmTag;
  title: string;
  owner: string;
  branch: string;
  goal: string;
  doneWhen: string;
  authority: string[];
  files: string[];
  next: string;
  blockers: string[];
  recentNotes: ShortTermMemoryNote[];
  parent?: string;
  collaborators?: string[];
  review?: string;
  context?: string[];
};

export type ShortTermMemoryRollupEntry = {
  id: string;
  tag: StmTag;
  title: string;
  date: string;
  outcome: string;
};

export type ShortTermMemoryDocument = {
  header: ShortTermMemoryHeader;
  sharedEphemera: string[];
  cards: ShortTermMemoryCard[];
  completedRollup: ShortTermMemoryRollupEntry[];
};

type ParsedShortTermMemoryDocument = ShortTermMemoryDocument & {
  rawActiveSnapshot: string[];
  rawCompletedRollup: string[];
};

type ParsedFieldSection = {
  values: string[];
  nextIndex: number;
};

type LockContents = {
  pid: number | null;
  createdAt: string | null;
};

type UpdateOptions = {
  repoRoot: string;
  now?: string;
  force?: boolean;
  staleLockMs?: number;
  onBeforeHashCheck?: (context: { attempt: number; filePath: string }) => Promise<void> | void;
};

type UpdateResult<T> = {
  document: ShortTermMemoryDocument;
  result: T;
  text: string;
};

export type CreateCardInput = {
  title: string;
  tag: StmTag;
  goal: string;
  doneWhen: string;
  authority: string[];
  files: string[];
  next: string;
  owner: string;
  branch: string;
  now: string;
  parent?: string;
  collaborators?: string[];
  review?: string;
  context?: string[];
};

export class ShortTermMemoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShortTermMemoryError";
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeLineEndings(source: string): string {
  return source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function ensureTrailingNewline(source: string): string {
  return source.endsWith("\n") ? source : `${source}\n`;
}

function clipText(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  if (maxLength <= 3) {
    return trimmed.slice(0, maxLength);
  }
  return `${trimmed.slice(0, maxLength - 3)}...`;
}

function trimScalar(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ShortTermMemoryError(`${fieldName} must not be empty.`);
  }
  if (trimmed.includes("\n")) {
    throw new ShortTermMemoryError(`${fieldName} must stay on one line.`);
  }
  return trimmed;
}

function trimOptionalScalar(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function optionalProperty<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : { [key]: value } as Record<K, V>;
}

function normalizeRepoRelativePath(value: string): string {
  const trimmed = trimScalar(value, "Path");
  const normalized = trimmed.replace(/\\/g, "/").replace(/^\.\//, "");
  if (normalized.startsWith("/")) {
    throw new ShortTermMemoryError(`STM paths must stay repo-relative: ${value}`);
  }
  if (normalized === "." || normalized.startsWith("../")) {
    throw new ShortTermMemoryError(`STM paths must stay inside the repo: ${value}`);
  }
  return normalized;
}

function normalizeFreeformList(values: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const trimmed = trimScalar(value, "List item");
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

function normalizeRepoPathList(values: string[], fieldName: string): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const normalizedPath = normalizeRepoRelativePath(value);
    if (seen.has(normalizedPath)) continue;
    seen.add(normalizedPath);
    normalized.push(normalizedPath);
  }
  if (normalized.length === 0) {
    throw new ShortTermMemoryError(`${fieldName} must contain at least one path.`);
  }
  return normalized;
}

function normalizeCollaborators(values: string[] | undefined, owner: string): string[] | undefined {
  const rawValues = values ?? [];
  const normalized = normalizeFreeformList(rawValues)
    .map((value) => value.toLowerCase())
    .filter((value) => value !== owner.toLowerCase());
  if (normalized.length === 0) {
    return undefined;
  }
  return [...new Set(normalized)].sort((left, right) => left.localeCompare(right));
}

function normalizeBlockers(values: string[]): string[] {
  if (values.length === 1 && values[0]?.trim() === "none") {
    return [];
  }
  return normalizeFreeformList(values);
}

function normalizeNotes(notes: ShortTermMemoryNote[]): ShortTermMemoryNote[] {
  const sorted = [...notes]
    .map((note) => ({
      timestamp: formatIsoTimestamp(note.timestamp),
      type: note.type,
      message: trimScalar(note.message, "Recent Notes message"),
    }))
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
  return sorted;
}

function normalizeRollup(entries: ShortTermMemoryRollupEntry[]): ShortTermMemoryRollupEntry[] {
  return [...entries]
    .map((entry) => ({
      id: trimScalar(entry.id, "Rollup id"),
      tag: entry.tag,
      title: trimScalar(entry.title, "Rollup title"),
      date: trimScalar(entry.date, "Rollup date"),
      outcome: trimScalar(entry.outcome, "Rollup outcome"),
    }))
    .sort((left, right) => {
      const byDate = right.date.localeCompare(left.date);
      if (byDate !== 0) return byDate;
      return right.id.localeCompare(left.id);
    });
}

function normalizeSharedEphemera(values: string[]): string[] {
  const normalized = normalizeFreeformList(values);
  return normalized.sort((left, right) => left.localeCompare(right));
}

function normalizeCard(card: ShortTermMemoryCard): ShortTermMemoryCard {
  const owner = trimScalar(card.owner, "Owner");
  return {
    id: trimScalar(card.id, "Card id"),
    status: card.status,
    tag: card.tag,
    title: trimScalar(card.title, "Card title"),
    owner,
    branch: trimScalar(card.branch, "Branch"),
    goal: trimScalar(card.goal, "Goal"),
    doneWhen: trimScalar(card.doneWhen, "Done when"),
    authority: normalizeRepoPathList(card.authority, "Authority"),
    files: normalizeRepoPathList(card.files, "Files"),
    next: trimScalar(card.next, "Next"),
    blockers: normalizeBlockers(card.blockers),
    recentNotes: normalizeNotes(card.recentNotes),
    ...optionalProperty("parent", trimOptionalScalar(card.parent)),
    ...optionalProperty("collaborators", normalizeCollaborators(card.collaborators, owner)),
    ...optionalProperty("review", trimOptionalScalar(card.review)),
    ...optionalProperty("context", card.context ? normalizeFreeformList(card.context) : undefined),
  };
}

export function formatIsoTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ShortTermMemoryError(`Invalid ISO timestamp: ${String(value)}`);
  }
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function createDefaultHeader(now: string): ShortTermMemoryHeader {
  return {
    ...HEADER_DEFAULTS,
    lastCompacted: formatIsoTimestamp(now),
  };
}

export function createEmptyShortTermMemory(now: string): ShortTermMemoryDocument {
  return {
    header: createDefaultHeader(now),
    sharedEphemera: [],
    cards: [],
    completedRollup: [],
  };
}

function isAllowedTag(value: string): value is StmTag {
  return (STM_ALLOWED_TAGS as readonly string[]).includes(value);
}

function isAllowedStatus(value: string): value is StmStatus {
  return (STM_ALLOWED_STATUSES as readonly string[]).includes(value);
}

function isAllowedNoteType(value: string): value is StmNoteType {
  return (STM_ALLOWED_NOTE_TYPES as readonly string[]).includes(value);
}

function countNonEmptyLines(source: string): number {
  return normalizeLineEndings(source)
    .split("\n")
    .filter((line) => line.trim().length > 0).length;
}

function parseScalarLine(line: string, label: string): string {
  const prefix = `${label}: `;
  if (!line.startsWith(prefix)) {
    throw new ShortTermMemoryError(`Expected "${label}: ..." but found "${line}".`);
  }
  return line.slice(prefix.length);
}

function parseBulletLine(line: string): string {
  if (!line.startsWith("- ")) {
    throw new ShortTermMemoryError(`Expected "- ..." bullet but found "${line}".`);
  }
  return line.slice(2);
}

function parseScalarField(lines: string[], startIndex: number, label: string): { value: string; nextIndex: number } {
  const line = lines[startIndex];
  if (line === undefined) {
    throw new ShortTermMemoryError(`Missing required field ${label}.`);
  }
  return {
    value: parseScalarLine(line, label),
    nextIndex: startIndex + 1,
  };
}

function parseBulletSection(lines: string[], startIndex: number, label: string): ParsedFieldSection {
  const heading = lines[startIndex];
  if (heading !== label) {
    throw new ShortTermMemoryError(`Expected "${label}" but found "${heading ?? "<eof>"}".`);
  }
  const values: string[] = [];
  let index = startIndex + 1;
  while (index < lines.length && lines[index]?.startsWith("- ")) {
    values.push(parseBulletLine(lines[index] ?? ""));
    index += 1;
  }
  if (values.length === 0) {
    throw new ShortTermMemoryError(`${label} must contain at least one bullet.`);
  }
  return { values, nextIndex: index };
}

function parseRecentNotesSection(lines: string[], startIndex: number): { notes: ShortTermMemoryNote[]; nextIndex: number } {
  const section = parseBulletSection(lines, startIndex, "Recent Notes:");
  const notes = section.values.map((value) => {
    const match = /^([^|]+?) \| ([a-z]+) \| (.+)$/.exec(value);
    if (!match) {
      throw new ShortTermMemoryError(`Malformed Recent Notes entry: ${value}`);
    }
    const timestamp = match[1] ?? "";
    const type = match[2] ?? "";
    const message = match[3] ?? "";
    if (!isAllowedNoteType(type)) {
      throw new ShortTermMemoryError(`Invalid note type "${type}".`);
    }
    return {
      timestamp: timestamp.trim(),
      type,
      message: message.trim(),
    };
  });
  return {
    notes,
    nextIndex: section.nextIndex,
  };
}

function parseRollupEntries(lines: string[]): ShortTermMemoryRollupEntry[] {
  if (lines.length === 1 && lines[0] === "- none") {
    return [];
  }
  return lines.map((line) => {
    const value = parseBulletLine(line);
    const match = /^(STM-\d{8}-\d{6}-[a-z0-9-]+) \| ([a-z-]+) \| (.+) \| (\d{4}-\d{2}-\d{2}) \| (.+)$/.exec(value);
    if (!match) {
      throw new ShortTermMemoryError(`Malformed completed rollup entry: ${value}`);
    }
    const id = match[1] ?? "";
    const tag = match[2] ?? "";
    const title = match[3] ?? "";
    const date = match[4] ?? "";
    const outcome = match[5] ?? "";
    if (!isAllowedTag(tag)) {
      throw new ShortTermMemoryError(`Invalid rollup tag "${tag}".`);
    }
    return {
      id,
      tag,
      title: title.trim(),
      date,
      outcome: outcome.trim(),
    };
  });
}

function parseGeneratedSection(lines: string[], startIndex: number, startMarker: string, endMarker: string): { values: string[]; nextIndex: number } {
  if (lines[startIndex] !== startMarker) {
    throw new ShortTermMemoryError(`Expected "${startMarker}" but found "${lines[startIndex] ?? "<eof>"}".`);
  }
  const values: string[] = [];
  let index = startIndex + 1;
  while (index < lines.length && lines[index] !== endMarker) {
    values.push(lines[index] ?? "");
    index += 1;
  }
  if (index >= lines.length) {
    throw new ShortTermMemoryError(`Missing generated-section marker "${endMarker}".`);
  }
  return {
    values,
    nextIndex: index + 1,
  };
}

function parseSharedEphemera(lines: string[], startIndex: number): ParsedFieldSection {
  const heading = lines[startIndex];
  if (heading !== SHARED_EPHEMERA_HEADING) {
    throw new ShortTermMemoryError(`Expected "${SHARED_EPHEMERA_HEADING}" but found "${heading ?? "<eof>"}".`);
  }
  const values: string[] = [];
  let index = startIndex + 1;
  while (index < lines.length && lines[index]?.startsWith("- ")) {
    values.push(parseBulletLine(lines[index] ?? ""));
    index += 1;
  }
  if (values.length === 0) {
    throw new ShortTermMemoryError(`${SHARED_EPHEMERA_HEADING} must contain at least one bullet.`);
  }
  return { values, nextIndex: index };
}

function parseCardHeader(line: string): Pick<ShortTermMemoryCard, "id" | "status" | "tag" | "title"> {
  const match = /^### (STM-\d{8}-\d{6}-[a-z0-9-]+) \| ([a-z]+) \| ([a-z-]+) \| (.+)$/.exec(line);
  if (!match) {
    throw new ShortTermMemoryError(`Malformed task card header: ${line}`);
  }
  const id = match[1] ?? "";
  const status = match[2] ?? "";
  const tag = match[3] ?? "";
  const title = match[4] ?? "";
  if (!isAllowedStatus(status)) {
    throw new ShortTermMemoryError(`Invalid card status "${status}".`);
  }
  if (!isAllowedTag(tag)) {
    throw new ShortTermMemoryError(`Invalid card tag "${tag}".`);
  }
  return { id, status, tag, title: title.trim() };
}

function optionalFieldName(line: string): string | null {
  if (line.startsWith("Parent: ")) return "Parent";
  if (line.startsWith("Collaborators: ")) return "Collaborators";
  if (line.startsWith("Review: ")) return "Review";
  if (line === "Context:") return "Context";
  return null;
}

function assertNoMisplacedOptionalField(line: string | undefined, expectedField: string): void {
  if (!line) return;
  const name = optionalFieldName(line);
  if (!name) return;
  throw new ShortTermMemoryError(`${name} must appear before ${expectedField}.`);
}

function parseTaskCard(lines: string[], startIndex: number): { card: ShortTermMemoryCard; nextIndex: number } {
  const header = parseCardHeader(lines[startIndex] ?? "");
  let index = startIndex + 1;

  const ownerField = parseScalarField(lines, index, "Owner");
  index = ownerField.nextIndex;

  const branchField = parseScalarField(lines, index, "Branch");
  index = branchField.nextIndex;

  const goalField = parseScalarField(lines, index, "Goal");
  index = goalField.nextIndex;

  const doneWhenField = parseScalarField(lines, index, "Done when");
  index = doneWhenField.nextIndex;

  const authoritySection = parseBulletSection(lines, index, "Authority:");
  index = authoritySection.nextIndex;

  const filesSection = parseBulletSection(lines, index, "Files:");
  index = filesSection.nextIndex;

  let parent: string | undefined;
  let collaborators: string[] | undefined;
  let review: string | undefined;
  let context: string[] | undefined;

  if (lines[index]?.startsWith("Parent: ")) {
    parent = parseScalarLine(lines[index] ?? "", "Parent");
    index += 1;
  }
  if (lines[index]?.startsWith("Collaborators: ")) {
    collaborators = parseScalarLine(lines[index] ?? "", "Collaborators")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    index += 1;
  }
  if (lines[index]?.startsWith("Review: ")) {
    review = parseScalarLine(lines[index] ?? "", "Review");
    index += 1;
  }
  if (lines[index] === "Context:") {
    const contextSection = parseBulletSection(lines, index, "Context:");
    context = contextSection.values;
    index = contextSection.nextIndex;
  }

  assertNoMisplacedOptionalField(lines[index], "Next");
  const nextSection = parseBulletSection(lines, index, "Next:");
  if (nextSection.values.length !== 1) {
    throw new ShortTermMemoryError("Next must contain exactly one bullet.");
  }
  index = nextSection.nextIndex;

  assertNoMisplacedOptionalField(lines[index], "Blockers");
  const blockersSection = parseBulletSection(lines, index, "Blockers:");
  index = blockersSection.nextIndex;

  assertNoMisplacedOptionalField(lines[index], "Recent Notes");
  const recentNotesSection = parseRecentNotesSection(lines, index);
  index = recentNotesSection.nextIndex;

  while (lines[index] === "") {
    index += 1;
  }

  return {
    card: {
      ...header,
      owner: ownerField.value,
      branch: branchField.value,
      goal: goalField.value,
      doneWhen: doneWhenField.value,
      authority: authoritySection.values,
      files: filesSection.values,
      next: nextSection.values[0] ?? "",
      blockers: blockersSection.values,
      recentNotes: recentNotesSection.notes,
      ...optionalProperty("parent", parent),
      ...optionalProperty("collaborators", collaborators),
      ...optionalProperty("review", review),
      ...optionalProperty("context", context),
    },
    nextIndex: index,
  };
}

export function parseShortTermMemory(source: string): ParsedShortTermMemoryDocument {
  const normalizedSource = ensureTrailingNewline(normalizeLineEndings(source));
  const lines = normalizedSource.split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }

  let index = 0;
  const audience = parseScalarLine(lines[index] ?? "", "Audience");
  index += 1;
  const authority = parseScalarLine(lines[index] ?? "", "Authority");
  index += 1;
  const readWhen = parseScalarLine(lines[index] ?? "", "Read when");
  index += 1;
  const owns = parseScalarLine(lines[index] ?? "", "Owns");
  index += 1;
  const doNotUseFor = parseScalarLine(lines[index] ?? "", "Do not use for");
  index += 1;
  const schemaVersion = parseScalarLine(lines[index] ?? "", "Schema version");
  index += 1;
  const canonicalPlaytestUrl = parseScalarLine(lines[index] ?? "", "Canonical playtest URL");
  index += 1;
  const mapApprovalStatus = parseScalarLine(lines[index] ?? "", "Map approval status");
  index += 1;
  const lastCompacted = parseScalarLine(lines[index] ?? "", "Last compacted");
  index += 1;

  if (lines[index] !== "") {
    throw new ShortTermMemoryError(`Expected a blank line before "${TITLE_LINE}".`);
  }
  index += 1;

  if (lines[index] !== TITLE_LINE) {
    throw new ShortTermMemoryError(`Expected "${TITLE_LINE}" but found "${lines[index] ?? "<eof>"}".`);
  }
  index += 1;

  if (lines[index] !== "") {
    throw new ShortTermMemoryError(`Expected a blank line before "${ACTIVE_SNAPSHOT_HEADING}".`);
  }
  index += 1;

  if (lines[index] !== ACTIVE_SNAPSHOT_HEADING) {
    throw new ShortTermMemoryError(`Expected "${ACTIVE_SNAPSHOT_HEADING}" but found "${lines[index] ?? "<eof>"}".`);
  }
  index += 1;

  const activeSnapshotSection = parseGeneratedSection(lines, index, ACTIVE_SNAPSHOT_START, ACTIVE_SNAPSHOT_END);
  index = activeSnapshotSection.nextIndex;

  if (lines[index] !== "") {
    throw new ShortTermMemoryError(`Expected a blank line before "${SHARED_EPHEMERA_HEADING}".`);
  }
  index += 1;

  const sharedEphemeraSection = parseSharedEphemera(lines, index);
  index = sharedEphemeraSection.nextIndex;

  if (lines[index] !== "") {
    throw new ShortTermMemoryError(`Expected a blank line before "${TASK_CARDS_HEADING}".`);
  }
  index += 1;

  if (lines[index] !== TASK_CARDS_HEADING) {
    throw new ShortTermMemoryError(`Expected "${TASK_CARDS_HEADING}" but found "${lines[index] ?? "<eof>"}".`);
  }
  index += 1;

  if (lines[index] === "") {
    index += 1;
  }

  const cards: ShortTermMemoryCard[] = [];
  while (index < lines.length && lines[index] !== COMPLETED_ROLLUP_HEADING) {
    const line = lines[index];
    if (line === "") {
      index += 1;
      continue;
    }
    if (!line?.startsWith("### ")) {
      throw new ShortTermMemoryError(`Expected a task card header but found "${line}".`);
    }
    const parsedCard = parseTaskCard(lines, index);
    cards.push(parsedCard.card);
    index = parsedCard.nextIndex;
  }

  if (lines[index] !== COMPLETED_ROLLUP_HEADING) {
    throw new ShortTermMemoryError(`Expected "${COMPLETED_ROLLUP_HEADING}" but found "${lines[index] ?? "<eof>"}".`);
  }
  index += 1;

  const completedRollupSection = parseGeneratedSection(lines, index, COMPLETED_ROLLUP_START, COMPLETED_ROLLUP_END);
  index = completedRollupSection.nextIndex;

  if (index !== lines.length) {
    throw new ShortTermMemoryError("Unexpected content after Recent Completed Rollup.");
  }

  return {
    header: {
      audience,
      authority,
      readWhen,
      owns,
      doNotUseFor,
      schemaVersion,
      canonicalPlaytestUrl,
      mapApprovalStatus,
      lastCompacted,
    },
    sharedEphemera: sharedEphemeraSection.values[0] === "none" ? [] : sharedEphemeraSection.values,
    cards,
    completedRollup: parseRollupEntries(completedRollupSection.values),
    rawActiveSnapshot: activeSnapshotSection.values,
    rawCompletedRollup: completedRollupSection.values,
  };
}

function renderHeader(header: ShortTermMemoryHeader): string[] {
  return [
    `Audience: ${header.audience}`,
    `Authority: ${header.authority}`,
    `Read when: ${header.readWhen}`,
    `Owns: ${header.owns}`,
    `Do not use for: ${header.doNotUseFor}`,
    `Schema version: ${header.schemaVersion}`,
    `Canonical playtest URL: ${header.canonicalPlaytestUrl}`,
    `Map approval status: ${header.mapApprovalStatus}`,
    `Last compacted: ${header.lastCompacted}`,
  ];
}

function renderBulletSection(heading: string, values: string[]): string[] {
  return [heading, ...(values.length === 0 ? ["- none"] : values.map((value) => `- ${value}`))];
}

export function renderTaskCard(card: ShortTermMemoryCard): string {
  const lines = [
    `### ${card.id} | ${card.status} | ${card.tag} | ${card.title}`,
    `Owner: ${card.owner}`,
    `Branch: ${card.branch}`,
    `Goal: ${card.goal}`,
    `Done when: ${card.doneWhen}`,
    "Authority:",
    ...card.authority.map((value) => `- ${value}`),
    "Files:",
    ...card.files.map((value) => `- ${value}`),
  ];
  if (card.parent) {
    lines.push(`Parent: ${card.parent}`);
  }
  if (card.collaborators && card.collaborators.length > 0) {
    lines.push(`Collaborators: ${card.collaborators.join(", ")}`);
  }
  if (card.review) {
    lines.push(`Review: ${card.review}`);
  }
  if (card.context && card.context.length > 0) {
    lines.push("Context:");
    for (const value of card.context) {
      lines.push(`- ${value}`);
    }
  }
  lines.push("Next:");
  lines.push(`- ${card.next}`);
  lines.push("Blockers:");
  lines.push(...(card.blockers.length === 0 ? ["- none"] : card.blockers.map((value) => `- ${value}`)));
  lines.push("Recent Notes:");
  lines.push(...card.recentNotes.map((note) => `- ${note.timestamp} | ${note.type} | ${note.message}`));
  return `${lines.join("\n")}\n`;
}

function renderRollup(entries: ShortTermMemoryRollupEntry[]): string[] {
  return entries.length === 0
    ? ["- none"]
    : entries.map((entry) => `- ${entry.id} | ${entry.tag} | ${entry.title} | ${entry.date} | ${entry.outcome}`);
}

function buildActiveSnapshotLines(document: ShortTermMemoryDocument): string[] {
  const snapshotCards = document.cards
    .filter((card) => card.status === "active" || card.status === "blocked" || card.status === "handoff")
    .sort((left, right) => left.id.localeCompare(right.id));
  if (snapshotCards.length === 0) {
    return ["- none"];
  }
  return snapshotCards.map((card) => {
    const title = clipText(card.title, SNAPSHOT_TITLE_MAX);
    const next = clipText(card.next, SNAPSHOT_NEXT_MAX);
    return `- ${card.id} | ${card.status} | ${card.owner} | ${card.tag} | ${title} | next: ${next}`;
  });
}

export function normalizeShortTermMemory(document: ShortTermMemoryDocument): ShortTermMemoryDocument {
  const normalizedCards = [...document.cards]
    .map((card) => normalizeCard(card))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    header: {
      audience: trimScalar(document.header.audience, "Audience"),
      authority: trimScalar(document.header.authority, "Authority"),
      readWhen: trimScalar(document.header.readWhen, "Read when"),
      owns: trimScalar(document.header.owns, "Owns"),
      doNotUseFor: trimScalar(document.header.doNotUseFor, "Do not use for"),
      schemaVersion: trimScalar(document.header.schemaVersion, "Schema version"),
      canonicalPlaytestUrl: trimScalar(document.header.canonicalPlaytestUrl, "Canonical playtest URL"),
      mapApprovalStatus: trimScalar(document.header.mapApprovalStatus, "Map approval status"),
      lastCompacted: formatIsoTimestamp(document.header.lastCompacted),
    },
    sharedEphemera: normalizeSharedEphemera(document.sharedEphemera),
    cards: normalizedCards,
    completedRollup: normalizeRollup(document.completedRollup),
  };
}

export function compactShortTermMemory(document: ShortTermMemoryDocument, now: string): ShortTermMemoryDocument {
  const normalized = normalizeShortTermMemory(document);
  return {
    ...normalized,
    header: {
      ...normalized.header,
      lastCompacted: formatIsoTimestamp(now),
    },
    sharedEphemera: normalized.sharedEphemera.slice(0, MAX_SHARED_EPHEMERA),
    completedRollup: normalized.completedRollup.slice(0, MAX_ROLLUP_ENTRIES),
  };
}

export function renderShortTermMemory(document: ShortTermMemoryDocument): string {
  const normalized = normalizeShortTermMemory(document);
  const lines = [
    ...renderHeader(normalized.header),
    "",
    TITLE_LINE,
    "",
    ACTIVE_SNAPSHOT_HEADING,
    ACTIVE_SNAPSHOT_START,
    ...buildActiveSnapshotLines(normalized),
    ACTIVE_SNAPSHOT_END,
    "",
    ...renderBulletSection(SHARED_EPHEMERA_HEADING, normalized.sharedEphemera),
    "",
    TASK_CARDS_HEADING,
  ];

  if (normalized.cards.length > 0) {
    lines.push("");
    normalized.cards.forEach((card, index) => {
      if (index > 0) {
        lines.push("");
      }
      lines.push(...renderTaskCard(card).trimEnd().split("\n"));
    });
    lines.push("");
  } else {
    lines.push("");
  }

  lines.push(COMPLETED_ROLLUP_HEADING);
  lines.push(COMPLETED_ROLLUP_START);
  lines.push(...renderRollup(normalized.completedRollup));
  lines.push(COMPLETED_ROLLUP_END);
  return `${lines.join("\n")}\n`;
}

export function renderShowActive(document: ShortTermMemoryDocument): string {
  const normalized = normalizeShortTermMemory(document);
  const metaLineOne = `Audience: ${normalized.header.audience} | Authority: ${normalized.header.authority} | Read when: ${normalized.header.readWhen} | Schema: ${normalized.header.schemaVersion}`;
  const metaLineTwo = `Owns: ${normalized.header.owns} | Do not use for: ${normalized.header.doNotUseFor} | Canonical playtest URL: ${normalized.header.canonicalPlaytestUrl} | Map approval status: ${normalized.header.mapApprovalStatus} | Last compacted: ${normalized.header.lastCompacted}`;
  const sharedEphemera = normalized.sharedEphemera.length === 0
    ? "Shared Ephemera: none"
    : `Shared Ephemera: ${normalized.sharedEphemera.map((value) => clipText(value, SHOW_EPHEMERA_ITEM_MAX)).join(" || ")}`;
  const lines = [
    metaLineOne,
    metaLineTwo,
    sharedEphemera,
    "Active Snapshot:",
    ...buildActiveSnapshotLines(normalized),
  ];
  return `${lines.join("\n")}\n`;
}

function validateHeader(header: ShortTermMemoryHeader): void {
  if (header.schemaVersion !== STM_SCHEMA_VERSION) {
    throw new ShortTermMemoryError(`Schema version must be ${STM_SCHEMA_VERSION}.`);
  }
  formatIsoTimestamp(header.lastCompacted);
}

function validateCard(card: ShortTermMemoryCard): void {
  if (!/^STM-\d{8}-\d{6}-[a-z0-9-]+$/.test(card.id)) {
    throw new ShortTermMemoryError(`Invalid card id "${card.id}".`);
  }
  if (!isAllowedStatus(card.status)) {
    throw new ShortTermMemoryError(`Invalid card status "${card.status}".`);
  }
  if (!isAllowedTag(card.tag)) {
    throw new ShortTermMemoryError(`Invalid card tag "${card.tag}".`);
  }
  if (card.authority.length > MAX_CARD_LIST_ITEMS) {
    throw new ShortTermMemoryError(`Authority must contain at most ${MAX_CARD_LIST_ITEMS} paths.`);
  }
  if (card.files.length > MAX_CARD_LIST_ITEMS) {
    throw new ShortTermMemoryError(`Files must contain at most ${MAX_CARD_LIST_ITEMS} paths.`);
  }
  if (card.blockers.length > MAX_CARD_LIST_ITEMS) {
    throw new ShortTermMemoryError(`Blockers must contain at most ${MAX_CARD_LIST_ITEMS} bullets.`);
  }
  if (card.context && card.context.length > MAX_CARD_LIST_ITEMS) {
    throw new ShortTermMemoryError(`Context must contain at most ${MAX_CARD_LIST_ITEMS} bullets.`);
  }
  if (card.recentNotes.length > MAX_RECENT_NOTES) {
    throw new ShortTermMemoryError(`Recent Notes must contain at most ${MAX_RECENT_NOTES} entries.`);
  }
  if (card.recentNotes.length === 0) {
    throw new ShortTermMemoryError("Recent Notes must contain at least one entry.");
  }
  for (const note of card.recentNotes) {
    formatIsoTimestamp(note.timestamp);
    if (!isAllowedNoteType(note.type)) {
      throw new ShortTermMemoryError(`Invalid note type "${note.type}".`);
    }
    if (note.message.length > MAX_NOTE_MESSAGE_LENGTH) {
      throw new ShortTermMemoryError(`Recent note messages must stay within ${MAX_NOTE_MESSAGE_LENGTH} characters.`);
    }
  }
  for (let index = 1; index < card.recentNotes.length; index += 1) {
    const previous = card.recentNotes[index - 1];
    const current = card.recentNotes[index];
    if ((previous?.timestamp ?? "") < (current?.timestamp ?? "")) {
      throw new ShortTermMemoryError(`Recent Notes for ${card.id} must stay newest first.`);
    }
  }
}

function validateRollup(entries: ShortTermMemoryRollupEntry[]): void {
  if (entries.length > MAX_ROLLUP_ENTRIES) {
    throw new ShortTermMemoryError(`Recent Completed Rollup must contain at most ${MAX_ROLLUP_ENTRIES} entries.`);
  }
  const seen = new Set<string>();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) continue;
    if (seen.has(entry.id)) {
      throw new ShortTermMemoryError(`Duplicate rollup id "${entry.id}".`);
    }
    seen.add(entry.id);
    if (!isAllowedTag(entry.tag)) {
      throw new ShortTermMemoryError(`Invalid rollup tag "${entry.tag}".`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
      throw new ShortTermMemoryError(`Invalid rollup date "${entry.date}".`);
    }
    if (index > 0) {
      const previous = entries[index - 1];
      if ((previous?.date ?? "") < entry.date || ((previous?.date ?? "") === entry.date && (previous?.id ?? "") < entry.id)) {
        throw new ShortTermMemoryError("Recent Completed Rollup must stay newest first.");
      }
    }
  }
}

export function validateShortTermMemoryDocument(document: ShortTermMemoryDocument): { text: string; showActive: string } {
  const normalized = normalizeShortTermMemory(document);
  validateHeader(normalized.header);

  if (normalized.sharedEphemera.length > MAX_SHARED_EPHEMERA) {
    throw new ShortTermMemoryError(`Shared Ephemera must contain at most ${MAX_SHARED_EPHEMERA} bullets.`);
  }
  for (const value of normalized.sharedEphemera) {
    if (value.length > MAX_SHARED_EPHEMERA_LENGTH) {
      throw new ShortTermMemoryError(`Shared Ephemera bullets must stay within ${MAX_SHARED_EPHEMERA_LENGTH} characters.`);
    }
  }

  if (normalized.cards.length > MAX_ACTIVE_CARDS) {
    throw new ShortTermMemoryError(`Task Cards must contain at most ${MAX_ACTIVE_CARDS} active cards.`);
  }
  const seenIds = new Set<string>();
  for (const card of normalized.cards) {
    if (seenIds.has(card.id)) {
      throw new ShortTermMemoryError(`Duplicate card id "${card.id}".`);
    }
    seenIds.add(card.id);
    validateCard(card);
  }

  validateRollup(normalized.completedRollup);

  const text = renderShortTermMemory(normalized);
  if (Buffer.byteLength(text, "utf8") > MAX_FILE_BYTES) {
    throw new ShortTermMemoryError(`${STM_FILE_NAME} must stay within ${MAX_FILE_BYTES} bytes.`);
  }
  if (countNonEmptyLines(text) > MAX_NON_EMPTY_LINES) {
    throw new ShortTermMemoryError(`${STM_FILE_NAME} must stay within ${MAX_NON_EMPTY_LINES} non-empty lines.`);
  }

  const showActive = renderShowActive(normalized);
  if (showActive.length > MAX_SHOW_ACTIVE_CHARS) {
    throw new ShortTermMemoryError(`show active output must stay within ${MAX_SHOW_ACTIVE_CHARS} characters.`);
  }
  if (countNonEmptyLines(showActive) > MAX_SHOW_ACTIVE_LINES) {
    throw new ShortTermMemoryError(`show active output must stay within ${MAX_SHOW_ACTIVE_LINES} non-empty lines.`);
  }

  return { text, showActive };
}

export function validateShortTermMemorySource(source: string): ShortTermMemoryDocument {
  const parsed = parseShortTermMemory(source);
  const normalized = normalizeShortTermMemory(parsed);
  validateShortTermMemoryDocument(normalized);
  const rendered = renderShortTermMemory(normalized);
  const canonicalSource = ensureTrailingNewline(normalizeLineEndings(source));
  if (rendered !== canonicalSource) {
    throw new ShortTermMemoryError(`${STM_FILE_NAME} is not in canonical form. Run "pnpm stm -- compact".`);
  }
  return normalized;
}

function readLockContents(raw: string): LockContents {
  const normalized = normalizeLineEndings(raw);
  const pidMatch = /^pid=(\d+)$/m.exec(normalized);
  const createdAtMatch = /^createdAt=(.+)$/m.exec(normalized);
  return {
    pid: pidMatch ? Number(pidMatch[1]) : null,
    createdAt: createdAtMatch?.[1]?.trim() ?? null,
  };
}

async function acquireLock(lockPath: string, now: string, force: boolean, staleLockMs: number): Promise<void> {
  const lockPayload = `pid=${process.pid}\ncreatedAt=${formatIsoTimestamp(now)}\n`;
  try {
    const handle = await open(lockPath, "wx");
    await handle.writeFile(lockPayload, "utf8");
    await handle.close();
    return;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") {
      throw error;
    }
  }

  const existingRaw = await readFile(lockPath, "utf8").catch(() => "");
  const existing = readLockContents(existingRaw);
  const createdAt = existing.createdAt ? Date.parse(existing.createdAt) : Number.NaN;
  const isStale = Number.isFinite(createdAt) && Date.parse(formatIsoTimestamp(now)) - createdAt > staleLockMs;
  if (!force && !isStale) {
    const holder = existing.pid ? `pid ${existing.pid}` : "unknown holder";
    const since = existing.createdAt ? ` from ${existing.createdAt}` : "";
    throw new ShortTermMemoryError(`STM lock is held by ${holder}${since}. Retry or use --force after confirming it is stale.`);
  }

  await unlink(lockPath).catch(() => undefined);
  const handle = await open(lockPath, "wx");
  await handle.writeFile(lockPayload, "utf8");
  await handle.close();
}

async function releaseLock(lockPath: string): Promise<void> {
  await unlink(lockPath).catch(() => undefined);
}

export async function loadShortTermMemoryFile(repoRoot: string): Promise<ShortTermMemoryDocument> {
  const filePath = path.join(repoRoot, STM_FILE_NAME);
  const source = await readFile(filePath, "utf8");
  return normalizeShortTermMemory(parseShortTermMemory(source));
}

export async function updateShortTermMemoryFile<T>(
  options: UpdateOptions,
  mutator: (document: ShortTermMemoryDocument, context: { attempt: number; now: string; repoRoot: string }) => Promise<{ document: ShortTermMemoryDocument; result: T }> | { document: ShortTermMemoryDocument; result: T },
): Promise<UpdateResult<T>> {
  const repoRoot = options.repoRoot;
  const now = formatIsoTimestamp(options.now ?? new Date());
  const filePath = path.join(repoRoot, STM_FILE_NAME);
  const lockPath = path.join(repoRoot, STM_LOCK_NAME);
  await acquireLock(lockPath, now, options.force ?? false, options.staleLockMs ?? LOCK_STALE_MS);

  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const currentSource = await readFile(filePath, "utf8");
      const baseSource = ensureTrailingNewline(normalizeLineEndings(currentSource));
      const baseHash = sha256(baseSource);
      const baseDocument = normalizeShortTermMemory(parseShortTermMemory(baseSource));
      const mutation = await mutator(structuredClone(baseDocument), { attempt, now, repoRoot });
      const validation = validateShortTermMemoryDocument(mutation.document);

      await options.onBeforeHashCheck?.({ attempt, filePath });

      const latestSource = ensureTrailingNewline(normalizeLineEndings(await readFile(filePath, "utf8")));
      if (sha256(latestSource) !== baseHash) {
        if (attempt === 0) {
          continue;
        }
        throw new ShortTermMemoryError(`${STM_FILE_NAME} changed during write. Retry the command.`);
      }

      const tempPath = path.join(repoRoot, `${STM_TEMP_PREFIX}${process.pid}-${Date.now()}`);
      await writeFile(tempPath, validation.text, "utf8");
      await rename(tempPath, filePath);
      return {
        document: normalizeShortTermMemory(mutation.document),
        result: mutation.result,
        text: validation.text,
      };
    }
  } finally {
    await releaseLock(lockPath);
  }

  throw new ShortTermMemoryError(`Failed to update ${STM_FILE_NAME}.`);
}

function sanitizeAgentSlug(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "codex";
}

export function detectAgentSlug(): string {
  return sanitizeAgentSlug(
    process.env.STM_AGENT
      ?? process.env.CODEX_AGENT_SLUG
      ?? process.env.CLAUDE_AGENT
      ?? "codex",
  );
}

export function detectCurrentBranch(repoRoot: string): string {
  try {
    const value = execFileSync("git", ["branch", "--show-current"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return value.length > 0 ? value : "detached-head";
  } catch {
    return "unknown-branch";
  }
}

export function resolveRepoRelativeCliPath(repoRoot: string, value: string): string {
  const trimmed = trimScalar(value, "Path");
  if (!path.isAbsolute(trimmed)) {
    return normalizeRepoRelativePath(trimmed);
  }
  const relativePath = path.relative(repoRoot, trimmed).replace(/\\/g, "/");
  return normalizeRepoRelativePath(relativePath);
}

export function createCardId(now: string, agent: string, existingIds: Iterable<string>): string {
  const seen = new Set(existingIds);
  const baseDate = new Date(now);
  if (Number.isNaN(baseDate.getTime())) {
    throw new ShortTermMemoryError(`Invalid timestamp for card id generation: ${now}`);
  }
  const slug = sanitizeAgentSlug(agent);
  for (let offset = 0; offset < 600; offset += 1) {
    const nextDate = new Date(baseDate.getTime() + offset * 1000);
    const iso = formatIsoTimestamp(nextDate);
    const compactTimestamp = iso.slice(0, 19).replace(/[-:T]/g, "");
    const id = `STM-${compactTimestamp.slice(0, 8)}-${compactTimestamp.slice(8)}-${slug}`;
    if (!seen.has(id)) {
      return id;
    }
  }
  throw new ShortTermMemoryError("Unable to generate a unique STM id within 10 minutes of the requested timestamp.");
}

export function appendRecentNote(card: ShortTermMemoryCard, note: ShortTermMemoryNote): ShortTermMemoryCard {
  const notes = normalizeNotes([note, ...card.recentNotes]).slice(0, MAX_RECENT_NOTES);
  return {
    ...card,
    recentNotes: notes,
  };
}

export function createTaskCard(document: ShortTermMemoryDocument, input: CreateCardInput): { document: ShortTermMemoryDocument; card: ShortTermMemoryCard } {
  const owner = sanitizeAgentSlug(input.owner);
  const id = createCardId(input.now, owner, document.cards.map((card) => card.id));
  const authority = normalizeRepoPathList(input.authority, "Authority");
  const files = input.files.length > 0
    ? normalizeRepoPathList(input.files, "Files")
    : authority.slice(0, 1);
  const card = normalizeCard({
    id,
    status: "active",
    tag: input.tag,
    title: input.title,
    owner,
    branch: input.branch,
    goal: input.goal,
    doneWhen: input.doneWhen,
    authority,
    files,
    next: input.next,
    blockers: [],
    recentNotes: [{
      timestamp: formatIsoTimestamp(input.now),
      type: "claim",
      message: "Claimed task.",
    }],
    ...optionalProperty("parent", input.parent),
    ...optionalProperty("collaborators", input.collaborators),
    ...optionalProperty("review", input.review),
    ...optionalProperty("context", input.context),
  });
  return {
    document: normalizeShortTermMemory({
      ...document,
      cards: [...document.cards, card],
    }),
    card,
  };
}

export function findTaskCard(document: ShortTermMemoryDocument, id: string): ShortTermMemoryCard {
  const card = document.cards.find((entry) => entry.id === id);
  if (!card) {
    throw new ShortTermMemoryError(`Unknown task card "${id}".`);
  }
  return card;
}

function updateTaskCard(document: ShortTermMemoryDocument, updatedCard: ShortTermMemoryCard): ShortTermMemoryDocument {
  return normalizeShortTermMemory({
    ...document,
    cards: document.cards.map((card) => (card.id === updatedCard.id ? updatedCard : card)),
  });
}

export function claimTaskCard(
  document: ShortTermMemoryDocument,
  id: string,
  options: { owner: string; now: string; branch?: string },
): { document: ShortTermMemoryDocument; card: ShortTermMemoryCard } {
  const current = findTaskCard(document, id);
  const owner = sanitizeAgentSlug(options.owner);
  const message = current.owner === owner ? "Claimed task." : `Transferred owner from ${current.owner} to ${owner}.`;
  const updated = appendRecentNote({
    ...current,
    owner,
    branch: options.branch ? trimScalar(options.branch, "Branch") : current.branch,
  }, {
    timestamp: formatIsoTimestamp(options.now),
    type: "claim",
    message: clipText(message, MAX_NOTE_MESSAGE_LENGTH),
  });
  return {
    document: updateTaskCard(document, updated),
    card: updated,
  };
}

export function joinTaskCard(
  document: ShortTermMemoryDocument,
  id: string,
  collaborator: string,
): { document: ShortTermMemoryDocument; card: ShortTermMemoryCard } {
  const current = findTaskCard(document, id);
  const updated = normalizeCard({
    ...current,
    collaborators: [...(current.collaborators ?? []), sanitizeAgentSlug(collaborator)],
  });
  return {
    document: updateTaskCard(document, updated),
    card: updated,
  };
}

export function noteTaskCard(
  document: ShortTermMemoryDocument,
  id: string,
  note: ShortTermMemoryNote,
): { document: ShortTermMemoryDocument; card: ShortTermMemoryCard } {
  const current = findTaskCard(document, id);
  const updated = appendRecentNote(current, {
    timestamp: formatIsoTimestamp(note.timestamp),
    type: note.type,
    message: clipText(trimScalar(note.message, "Note message"), MAX_NOTE_MESSAGE_LENGTH),
  });
  return {
    document: updateTaskCard(document, updated),
    card: updated,
  };
}

function statusNoteForChange(status: StmStatus, message: string): ShortTermMemoryNote {
  const normalizedMessage = clipText(trimScalar(message, "Status note"), MAX_NOTE_MESSAGE_LENGTH);
  if (status === "blocked") {
    return { timestamp: "", type: "blocker", message: normalizedMessage };
  }
  if (status === "handoff") {
    return { timestamp: "", type: "handoff", message: normalizedMessage };
  }
  if (status === "abandoned") {
    return { timestamp: "", type: "decision", message: normalizedMessage };
  }
  return { timestamp: "", type: "progress", message: normalizedMessage };
}

export function setTaskCardStatus(
  document: ShortTermMemoryDocument,
  id: string,
  options: { status: StmStatus; now: string; message: string },
): { document: ShortTermMemoryDocument; card: ShortTermMemoryCard } {
  const current = findTaskCard(document, id);
  const note = statusNoteForChange(options.status, options.message);
  const updated = appendRecentNote({
    ...current,
    status: options.status,
  }, {
    ...note,
    timestamp: formatIsoTimestamp(options.now),
  });
  return {
    document: updateTaskCard(document, updated),
    card: updated,
  };
}

export function replaceTaskCardContext(
  document: ShortTermMemoryDocument,
  id: string,
  context: string[],
): { document: ShortTermMemoryDocument; card: ShortTermMemoryCard } {
  const current = findTaskCard(document, id);
  const updated = normalizeCard({
    ...current,
    ...optionalProperty("context", context.length === 0 ? undefined : context),
  });
  return {
    document: updateTaskCard(document, updated),
    card: updated,
  };
}

export function finishTaskCard(
  document: ShortTermMemoryDocument,
  id: string,
  options: { outcome: string; now: string },
): { document: ShortTermMemoryDocument; rollup: ShortTermMemoryRollupEntry } {
  const current = findTaskCard(document, id);
  const normalizedOutcome = trimScalar(options.outcome, "Finish outcome");
  if (normalizedOutcome.includes("\n")) {
    throw new ShortTermMemoryError("Finish outcome must stay on one line.");
  }
  const rollup: ShortTermMemoryRollupEntry = {
    id: current.id,
    tag: current.tag,
    title: current.title,
    date: formatIsoTimestamp(options.now).slice(0, 10),
    outcome: normalizedOutcome,
  };
  const nextDocument = compactShortTermMemory({
    ...document,
    cards: document.cards.filter((card) => card.id !== current.id),
    completedRollup: [rollup, ...document.completedRollup],
  }, options.now);
  return {
    document: nextDocument,
    rollup,
  };
}

export function compactTaskMemory(document: ShortTermMemoryDocument, now: string): ShortTermMemoryDocument {
  return compactShortTermMemory(document, now);
}

export function migrateProgressToShortTermMemory(
  progressSource: string,
  options: { now: string; agent?: string } = { now: formatIsoTimestamp(new Date()) },
): ShortTermMemoryDocument {
  const canonicalPlaytestUrl = /## Canonical Playtest URL\s+- `([^`]+)`/m.exec(progressSource)?.[1]?.trim()
    ?? HEADER_DEFAULTS.canonicalPlaytestUrl;
  const mapApprovalStatus = /## Map Approval Status\s+- `([^`]+)`/m.exec(progressSource)?.[1]?.trim()
    ?? HEADER_DEFAULTS.mapApprovalStatus;
  const activeTag = /## Active Change Tag\s+- `([^`]+)`/m.exec(progressSource)?.[1]?.trim() ?? "ui-flow";
  if (!isAllowedTag(activeTag)) {
    throw new ShortTermMemoryError(`Cannot migrate invalid active tag "${activeTag}".`);
  }
  const branch = /Branch `([^`]+)`/.exec(progressSource)?.[1]?.trim() ?? "codex/champion-badge-font";
  const owner = sanitizeAgentSlug(options.agent ?? "codex");
  const now = formatIsoTimestamp(options.now);
  const document = createEmptyShortTermMemory(now);
  document.header.canonicalPlaytestUrl = canonicalPlaytestUrl;
  document.header.mapApprovalStatus = mapApprovalStatus;

  const created = createTaskCard(document, {
    title: "Loading-screen champion badge typography",
    tag: activeTag,
    goal: "Keep the loading-screen shared-champion badge typography update ready for review or typography-only follow-up.",
    doneWhen: "Review lands or any requested typography-only adjustment is applied without moving badge placement or alignment.",
    authority: ["apps/client/src/styles.css"],
    files: ["apps/client/src/styles.css"],
    next: "Wait for review or make a typography-only adjustment if requested.",
    owner,
    branch,
    now,
    context: [
      "Only loading-screen shared-champion badge typography changed.",
      "Placement and alignment stayed unchanged.",
      "Longer names ellipsize sooner because badge width stayed fixed.",
    ],
  });
  return compactShortTermMemory(created.document, now);
}
