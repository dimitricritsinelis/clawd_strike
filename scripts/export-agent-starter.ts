import path from "node:path";
import { exportAgentStarterRepo, type ExportAgentStarterOptions } from "./lib/agentStarterExport";

function readFlagValue(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  return argv[index + 1];
}

function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

function parseArgs(argv: string[]): ExportAgentStarterOptions {
  return {
    outDir: readFlagValue(argv, "--out"),
    expectOrigin: readFlagValue(argv, "--expect-origin"),
    dryRun: hasFlag(argv, "--dry-run"),
  };
}

const options = parseArgs(process.argv.slice(2));
const result = await exportAgentStarterRepo(options);

console.log(JSON.stringify({
  dryRun: result.dryRun,
  targetRoot: path.relative(process.cwd(), result.targetRoot) || ".",
  manifestPath: result.manifestPath,
  managedFiles: result.managedFiles,
}, null, 2));
