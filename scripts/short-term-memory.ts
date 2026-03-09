import { runShortTermMemoryCli } from "./lib/shortTermMemoryCli.js";

process.exitCode = await runShortTermMemoryCli(process.argv.slice(2));
