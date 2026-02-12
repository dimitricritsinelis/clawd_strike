import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const targets = [
  "apps/client/dist",
  "apps/server/dist",
  "packages/engine/dist",
  "packages/shared/dist",
  "output",
  "apps/client/node_modules/.cache",
  "apps/server/node_modules/.cache",
  "packages/engine/node_modules/.cache",
  "packages/shared/node_modules/.cache"
];

// Keep Vite prebundle cache by default for faster iterative startup.
if (process.env.CLEAN_VITE_CACHE === "1") {
  targets.push("apps/client/node_modules/.vite");
}

for (const rel of targets) {
  const target = path.join(root, rel);
  if (!existsSync(target)) continue;
  rmSync(target, { recursive: true, force: true });
}

process.stdout.write("Generated artifacts cleaned.\n");
