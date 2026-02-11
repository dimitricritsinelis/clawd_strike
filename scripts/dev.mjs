import { spawn } from "node:child_process";

function spawnPnpm(args) {
  return spawn("pnpm", args, { stdio: "inherit" });
}

const server = spawnPnpm(["dev:server"]);
const client = spawnPnpm(["dev:client"]);

const children = [server, client];

function shutdown(signal) {
  for (const child of children) {
    if (child.exitCode === null) child.kill(signal);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

const exitCodes = [];
for (const child of children) {
  child.on("exit", (code) => {
    exitCodes.push(code ?? 0);
    if (exitCodes.length === children.length) {
      const worst = exitCodes.some((c) => c !== 0) ? 1 : 0;
      process.exit(worst);
    }
  });
}
