import fs from "node:fs";
import path from "node:path";

import { exportPostgresAudit } from "./lib/postgresAuditExport.js";

type CliOptions = {
  envFile: string | null;
  outPath: string | null;
};

function printUsage(): void {
  console.log(`Usage:
  pnpm export:postgres-audit -- [--env-file .env.production.local] [--out /Users/dimitri/Desktop/clawd-strike-postgres-audit-2026-03-08.xlsx]

Options:
  --env-file <path>  Load environment variables from a local env file before exporting.
  --out <path>       Workbook output path. Defaults to a dated Desktop-adjacent .xlsx path.
`);
}

function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    envFile: null,
    outPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg || arg === "--") continue;

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
    if (arg === "--env-file") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("--env-file requires a path.");
      }
      options.envFile = next;
      index += 1;
      continue;
    }
    if (arg.startsWith("--env-file=")) {
      options.envFile = arg.slice("--env-file=".length);
      continue;
    }
    if (arg === "--out") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("--out requires a path.");
      }
      options.outPath = next;
      index += 1;
      continue;
    }
    if (arg.startsWith("--out=")) {
      options.outPath = arg.slice("--out=".length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function loadEnvFile(filePath: string, env: NodeJS.ProcessEnv): void {
  const absolutePath = path.resolve(filePath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).replace(/^"(.*)"$/, "$1");
    env[key] = value;
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const env = {
    ...process.env,
  } as NodeJS.ProcessEnv;

  if (options.envFile) {
    loadEnvFile(options.envFile, env);
  }

  const result = await exportPostgresAudit({
    env,
    ...(options.outPath ? { outPath: options.outPath } : {}),
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? `[export:postgres-audit] ${error.message}`
      : "[export:postgres-audit] failed",
  );
  process.exitCode = 1;
});
