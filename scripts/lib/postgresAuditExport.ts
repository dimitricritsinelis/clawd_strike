import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { Client, type ClientConfig } from "pg";
import * as XLSX from "xlsx";

import {
  normalizePgConnectionString,
  resolvePgConnectionSelection,
} from "../../server/highScoreStoreImpl.js";

type RelationKind = "BASE TABLE" | "VIEW";

type ColumnDefinition = {
  relationName: string;
  columnName: string;
  ordinalPosition: number;
  dataType: string;
  isNullable: boolean;
};

type RelationDefinition = {
  relationName: string;
  relationKind: RelationKind;
  sheetName: string;
  columns: ColumnDefinition[];
  orderByClause: string;
  timestampColumn: string | null;
  purpose: string;
  collectedFields: string;
  logicalRelationships: string;
  retentionCleanup: string;
};

type RelationSummaryQueryRow = {
  row_count: string;
  min_timestamp: Date | string | null;
  max_timestamp: Date | string | null;
};

type RelationSummary = RelationDefinition & {
  rowCount: string;
  minTimestamp: string | null;
  maxTimestamp: string | null;
};

type ExportSheetSummary = {
  relationName: string;
  sheetName: string;
  relationKind: RelationKind;
  rowCount: string;
};

export type ExportPostgresAuditOptions = {
  env: NodeJS.ProcessEnv;
  outPath?: string;
};

export type ExportPostgresAuditResult = {
  outputPath: string;
  connectionEnvKey: string;
  exportedAt: string;
  sheets: ExportSheetSummary[];
};

const DEFAULT_OUTPUT_BASENAME = "clawd-strike-postgres-audit";
const SHEET_NAME_OVERRIDES: Record<string, string> = {
  shared_champion_daily_rollups_v1: "daily_rollups_v1",
};

const RELATION_ORDER = [
  "shared_champion_scores",
  "champion_submissions_log",
  "shared_champion_run_tokens",
  "shared_champion_run_audit",
  "shared_champion_runs",
  "shared_champion_daily_rollups_v1",
  "shared_champion_name_rollups_v1",
] as const;

const RELATION_METADATA: Record<string, Omit<RelationDefinition, "relationName" | "relationKind" | "sheetName" | "columns">> = {
  shared_champion_scores: {
    orderByClause: 'ORDER BY "board_key" ASC',
    timestampColumn: "updated_at",
    purpose: "Current shared champion snapshot for each board key.",
    collectedFields: "Board key, champion score, holder name, holder control mode, last updated timestamp.",
    logicalRelationships: "Current champion row for the best run on a board. Correlates to shared_champion_runs by holder name/mode and score, but no foreign key is enforced.",
    retentionCleanup: "No automated cleanup. Row is overwritten only when a higher score is accepted.",
  },
  champion_submissions_log: {
    orderByClause: 'ORDER BY "submitted_at" DESC, "id" DESC',
    timestampColumn: "submitted_at",
    purpose: "Direct-write submission rate-limit log.",
    collectedFields: "Submission id, client IP fingerprint, submission timestamp.",
    logicalRelationships: "Used only for direct shared champion write throttling. No foreign keys.",
    retentionCleanup: "Rows older than 24 hours are deleted by runtime cleanup queries.",
  },
  shared_champion_run_tokens: {
    orderByClause: 'ORDER BY "issued_at" DESC, "run_id" DESC',
    timestampColumn: "issued_at",
    purpose: "Issued shared champion run tokens and claim state.",
    collectedFields: "Run id, token hash, player name, control mode, map id, issue/expiry/claim timestamps, created/claim IP fingerprints, created/claim user-agent fingerprints.",
    logicalRelationships: "Run id logically links run-start, run-finish audit events, and final shared_champion_runs rows. No foreign keys are enforced.",
    retentionCleanup: "Rows older than 7 days past expiry are deleted by runtime cleanup queries.",
  },
  shared_champion_run_audit: {
    orderByClause: 'ORDER BY "created_at" DESC, "id" DESC',
    timestampColumn: "created_at",
    purpose: "Accepted and rejected shared champion run workflow audit trail.",
    collectedFields: "Audit id, event type, outcome, optional run id, IP fingerprint, user-agent fingerprint, rejection reason, arbitrary JSON payload, created timestamp.",
    logicalRelationships: "Run id logically links audit rows to shared_champion_run_tokens and shared_champion_runs. Payload content varies by event/outcome. No foreign keys are enforced.",
    retentionCleanup: "Rows older than 30 days are deleted by runtime cleanup queries.",
  },
  shared_champion_runs: {
    orderByClause: 'ORDER BY "created_at" DESC, "run_id" DESC',
    timestampColumn: "created_at",
    purpose: "Validated run history used for admin stats and champion derivation.",
    collectedFields: "Run id, player name/name key, control mode, map id, ruleset, start/end timing, elapsed time, score, kills, headshots, shots fired/hit, accuracy, waves cleared/reached, death cause, champion-updated flag, build id, client IP fingerprint, user-agent fingerprint, created timestamp.",
    logicalRelationships: "Finalized run record for a claimed run token. Correlates to shared_champion_scores and audit rows by run attributes and run id, but no foreign keys are enforced.",
    retentionCleanup: "No automated cleanup. Rows remain as durable run history.",
  },
  shared_champion_daily_rollups_v1: {
    orderByClause: 'ORDER BY "day" DESC',
    timestampColumn: "day",
    purpose: "Derived daily aggregate view over shared_champion_runs.",
    collectedFields: "UTC day, total runs, champion updates, unique player names, human runs, agent runs, best score, average score, average accuracy.",
    logicalRelationships: "View computed from shared_champion_runs grouped by UTC day. No physical storage beyond the view definition.",
    retentionCleanup: "Derived view only. Cleanup follows whatever remains in shared_champion_runs.",
  },
  shared_champion_name_rollups_v1: {
    orderByClause: 'ORDER BY "best_score" DESC NULLS LAST, "latest_run_at" DESC NULLS LAST, "player_name_key" ASC',
    timestampColumn: "latest_run_at",
    purpose: "Derived per-player aggregate view over shared_champion_runs.",
    collectedFields: "Player name key, representative player name, total runs, champion updates, human runs, agent runs, best score, average score, average accuracy, latest run timestamp.",
    logicalRelationships: "View computed from shared_champion_runs grouped by player_name_key. No physical storage beyond the view definition.",
    retentionCleanup: "Derived view only. Cleanup follows whatever remains in shared_champion_runs.",
  },
};

function defaultOutputPath(): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return path.resolve(process.cwd(), "..", `${DEFAULT_OUTPUT_BASENAME}-${stamp}.xlsx`);
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function buildFallbackSheetName(relationName: string): string {
  const digest = createHash("sha1").update(relationName).digest("hex").slice(0, 6);
  return `${relationName.slice(0, 24)}_${digest}`;
}

export function getSheetNameForRelation(relationName: string): string {
  const overridden = SHEET_NAME_OVERRIDES[relationName];
  if (overridden) {
    return overridden;
  }
  if (relationName.length <= 31) {
    return relationName;
  }
  return buildFallbackSheetName(relationName).slice(0, 31);
}

export function serializeWorkbookCell(value: unknown): string | number | boolean {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  return JSON.stringify(value);
}

function resolveSslConfig(connectionString: string): ClientConfig["ssl"] {
  try {
    const parsedUrl = new URL(connectionString);
    const sslMode = parsedUrl.searchParams.get("sslmode")?.trim().toLowerCase();
    const isLocalHost = parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1";
    if (sslMode === "disable" || isLocalHost) {
      return undefined;
    }
    return { rejectUnauthorized: true };
  } catch {
    return { rejectUnauthorized: true };
  }
}

function compareRelations(a: string, b: string): number {
  const aIndex = RELATION_ORDER.indexOf(a as typeof RELATION_ORDER[number]);
  const bIndex = RELATION_ORDER.indexOf(b as typeof RELATION_ORDER[number]);
  if (aIndex !== -1 || bIndex !== -1) {
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  }
  return a.localeCompare(b);
}

function createWorksheet(headers: string[], rows: Array<Record<string, string | number | boolean>>): XLSX.WorkSheet {
  if (rows.length === 0) {
    return XLSX.utils.aoa_to_sheet([headers]);
  }
  return XLSX.utils.json_to_sheet(rows, {
    header: headers,
    skipHeader: false,
  });
}

function describeColumns(columns: ColumnDefinition[]): string {
  return columns
    .map((column) => `${column.columnName} ${column.dataType}${column.isNullable ? " NULL" : " NOT NULL"}`)
    .join("; ");
}

function summaryRowFromRelation(summary: RelationSummary, exportedAt: string, connectionEnvKey: string): Record<string, string> {
  return {
    exported_at: exportedAt,
    connection_env_key: connectionEnvKey,
    relation_name: summary.relationName,
    sheet_name: summary.sheetName,
    relation_kind: summary.relationKind,
    purpose: summary.purpose,
    collected_fields: summary.collectedFields,
    logical_relationships: summary.logicalRelationships,
    retention_cleanup: summary.retentionCleanup,
    row_count: summary.rowCount,
    timestamp_column: summary.timestampColumn ?? "",
    min_timestamp: summary.minTimestamp ?? "",
    max_timestamp: summary.maxTimestamp ?? "",
    column_schema: describeColumns(summary.columns),
  };
}

function summaryHeaders(): string[] {
  return [
    "exported_at",
    "connection_env_key",
    "relation_name",
    "sheet_name",
    "relation_kind",
    "purpose",
    "collected_fields",
    "logical_relationships",
    "retention_cleanup",
    "row_count",
    "timestamp_column",
    "min_timestamp",
    "max_timestamp",
    "column_schema",
  ];
}

async function discoverRelations(client: Client): Promise<Map<string, RelationDefinition>> {
  const relationsResult = await client.query<{
    table_name: string;
    table_type: RelationKind;
  }>(`
    SELECT table_name, table_type
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type IN ('BASE TABLE', 'VIEW')
    ORDER BY table_name ASC;
  `);

  const columnsResult = await client.query<{
    table_name: string;
    column_name: string;
    ordinal_position: number;
    data_type: string;
    is_nullable: "YES" | "NO";
  }>(`
    SELECT
      table_name,
      column_name,
      ordinal_position,
      data_type,
      is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name ASC, ordinal_position ASC;
  `);

  const columnsByRelation = new Map<string, ColumnDefinition[]>();
  for (const row of columnsResult.rows) {
    const columns = columnsByRelation.get(row.table_name) ?? [];
    columns.push({
      relationName: row.table_name,
      columnName: row.column_name,
      ordinalPosition: row.ordinal_position,
      dataType: row.data_type,
      isNullable: row.is_nullable === "YES",
    });
    columnsByRelation.set(row.table_name, columns);
  }

  const relations = new Map<string, RelationDefinition>();
  for (const row of relationsResult.rows) {
    const metadata = RELATION_METADATA[row.table_name] ?? {
      orderByClause: "",
      timestampColumn: null,
      purpose: "No repo-owned audit metadata is defined for this relation.",
      collectedFields: "See column_schema for the live relation columns discovered from information_schema.",
      logicalRelationships: "No repo-owned relationship description is defined for this relation.",
      retentionCleanup: "No repo-owned retention note is defined for this relation.",
    };
    relations.set(row.table_name, {
      relationName: row.table_name,
      relationKind: row.table_type,
      sheetName: getSheetNameForRelation(row.table_name),
      columns: columnsByRelation.get(row.table_name) ?? [],
      ...metadata,
    });
  }

  return new Map(
    [...relations.entries()].sort(([left], [right]) => compareRelations(left, right)),
  );
}

function buildRelationSelectList(columns: ColumnDefinition[]): string {
  return columns
    .map((column) => {
      const quotedName = quoteIdentifier(column.columnName);
      if (column.dataType === "json" || column.dataType === "jsonb") {
        return `${quotedName}::text AS ${quotedName}`;
      }
      return quotedName;
    })
    .join(", ");
}

async function queryRelationSummary(client: Client, relation: RelationDefinition): Promise<RelationSummary> {
  const qualifiedName = `${quoteIdentifier("public")}.${quoteIdentifier(relation.relationName)}`;
  if (!relation.timestampColumn) {
    const result = await client.query<{ row_count: string }>(`
      SELECT COUNT(*)::BIGINT AS row_count
      FROM ${qualifiedName};
    `);
    return {
      ...relation,
      rowCount: result.rows[0]?.row_count ?? "0",
      minTimestamp: null,
      maxTimestamp: null,
    };
  }

  const result = await client.query<RelationSummaryQueryRow>(`
    SELECT
      COUNT(*)::BIGINT AS row_count,
      MIN(${quoteIdentifier(relation.timestampColumn)}) AS min_timestamp,
      MAX(${quoteIdentifier(relation.timestampColumn)}) AS max_timestamp
    FROM ${qualifiedName};
  `);

  const row = result.rows[0];
  return {
    ...relation,
    rowCount: row?.row_count ?? "0",
    minTimestamp: row ? String(serializeWorkbookCell(row.min_timestamp)) || null : null,
    maxTimestamp: row ? String(serializeWorkbookCell(row.max_timestamp)) || null : null,
  };
}

async function queryRelationRows(
  client: Client,
  relation: RelationDefinition,
): Promise<Array<Record<string, string | number | boolean>>> {
  const qualifiedName = `${quoteIdentifier("public")}.${quoteIdentifier(relation.relationName)}`;
  const selectList = buildRelationSelectList(relation.columns);
  const orderByClause = relation.orderByClause.length > 0 ? ` ${relation.orderByClause}` : "";
  const result = await client.query<Record<string, unknown>>(`
    SELECT ${selectList}
    FROM ${qualifiedName}${orderByClause};
  `);

  return result.rows.map((row) => {
    const serialized: Record<string, string | number | boolean> = {};
    for (const column of relation.columns) {
      serialized[column.columnName] = serializeWorkbookCell(row[column.columnName]);
    }
    return serialized;
  });
}

export async function exportPostgresAudit(options: ExportPostgresAuditOptions): Promise<ExportPostgresAuditResult> {
  const env = options.env;
  const connection = resolvePgConnectionSelection("read", env);
  const normalizedConnection = normalizePgConnectionString(connection.connectionString).connectionString;
  const client = new Client({
    connectionString: normalizedConnection,
    ssl: resolveSslConfig(normalizedConnection),
  });
  const workbook = XLSX.utils.book_new();
  const outputPath = path.resolve(options.outPath ?? defaultOutputPath());
  const exportedAt = new Date().toISOString();

  try {
    await client.connect();
    await client.query("BEGIN READ ONLY;");

    const relations = await discoverRelations(client);
    const summaries: RelationSummary[] = [];
    const sheetSummaries: ExportSheetSummary[] = [];

    for (const relation of relations.values()) {
      const summary = await queryRelationSummary(client, relation);
      const rows = await queryRelationRows(client, relation);
      const headers = relation.columns.map((column) => column.columnName);
      const worksheet = createWorksheet(headers, rows);
      XLSX.utils.book_append_sheet(workbook, worksheet, relation.sheetName);

      summaries.push(summary);
      sheetSummaries.push({
        relationName: relation.relationName,
        sheetName: relation.sheetName,
        relationKind: relation.relationKind,
        rowCount: summary.rowCount,
      });
    }

    const summarySheetRows = summaries.map((summary) =>
      summaryRowFromRelation(summary, exportedAt, connection.envKey)
    );
    const summarySheet = createWorksheet(summaryHeaders(), summarySheetRows);
    XLSX.utils.book_append_sheet(workbook, summarySheet, "audit_summary");
    workbook.SheetNames = [
      "audit_summary",
      ...workbook.SheetNames.filter((sheetName) => sheetName !== "audit_summary"),
    ];

    await client.query("COMMIT;");
    await mkdir(path.dirname(outputPath), { recursive: true });
    XLSX.writeFile(workbook, outputPath, {
      compression: true,
    });

    return {
      outputPath,
      connectionEnvKey: connection.envKey,
      exportedAt,
      sheets: [
        {
          relationName: "audit_summary",
          sheetName: "audit_summary",
          relationKind: "VIEW",
          rowCount: String(summarySheetRows.length),
        },
        ...sheetSummaries,
      ],
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}
