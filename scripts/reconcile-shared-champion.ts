import fs from "node:fs";
import path from "node:path";

import { reconcileSharedChampionStorage } from "../server/highScoreStoreImpl.js";

type CliOptions = {
  envFile: string | null;
  json: boolean;
};

function printUsage(): void {
  console.log(`Usage:
  pnpm reconcile:shared-champion -- [--env-file .env.production.local] [--json]

Options:
  --env-file <path>  Load environment variables from a local env file before reconciling.
  --json             Print the reconcile report as JSON.
`);
}

function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    envFile: null,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (arg === "--") continue;

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
    if (arg === "--json") {
      options.json = true;
      continue;
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

  const report = await reconcileSharedChampionStorage({ env });
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("Shared champion reconcile report");
  console.log(`inserted runs: ${report.insertedRuns}`);
  console.log(`skipped existing runs: ${report.skippedExistingRuns}`);
  console.log(`orphaned accepted finishes: ${report.orphanedAcceptedFinishes}`);
  console.log(`malformed accepted finishes: ${report.malformedAcceptedFinishes}`);
  if (report.insertedRunIds.length > 0) {
    console.log(`inserted run ids: ${report.insertedRunIds.join(", ")}`);
  }
  if (report.orphanedRunIds.length > 0) {
    console.log(`orphaned run ids: ${report.orphanedRunIds.join(", ")}`);
  }
  if (report.malformedRunIds.length > 0) {
    console.log(`malformed run ids: ${report.malformedRunIds.join(", ")}`);
  }
  if (report.championDrift) {
    console.log(`champion drift: ${report.championDrift.hasDrift ? "YES" : "no"}`);
    if (report.championDrift.hasDrift) {
      console.log(
        `champion row: ${report.championDrift.championHolderName} `
        + `(${report.championDrift.championHolderMode}) `
        + `${report.championDrift.championScoreHalfPoints}`,
      );
      console.log(
        `best run: ${report.championDrift.bestRunHolderName} `
        + `(${report.championDrift.bestRunHolderMode}) `
        + `${report.championDrift.bestRunScoreHalfPoints} `
        + `[${report.championDrift.bestRunId}]`,
      );
    }
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? `[reconcile:shared-champion] ${error.message}`
      : "[reconcile:shared-champion] failed",
  );
  process.exitCode = 1;
});
