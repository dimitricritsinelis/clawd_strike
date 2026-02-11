import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const canonicalRoot = path.join(repoRoot, "apps", "client", "public");
const referenceRoot = path.join(repoRoot, "ref-images");
const assetExt = new Set([".png", ".jpg", ".jpeg", ".svg", ".webp"]);
const ignoredDirs = new Set([".git", "node_modules", "output", "dist", "coverage", ".cache", ".vite"]);

function writeErr(line) {
  process.stderr.write(`${line}\n`);
}

function writeOut(line) {
  process.stdout.write(`${line}\n`);
}

function walk(dir, files) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const rel = path.relative(repoRoot, full);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      if (ignoredDirs.has(entry)) continue;
      walk(full, files);
      continue;
    }
    files.push({ full, rel });
  }
}

function isWithin(root, target) {
  const rel = path.relative(root, target);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function sha1(file) {
  return createHash("sha1").update(readFileSync(file)).digest("hex");
}

const allFiles = [];
walk(repoRoot, allFiles);

const assets = allFiles.filter(({ full }) => assetExt.has(path.extname(full).toLowerCase()));
const nonCanonical = [];
const hashToPaths = new Map();

for (const asset of assets) {
  const inCanonical = isWithin(canonicalRoot, asset.full);
  const inReference = isWithin(referenceRoot, asset.full);
  if (!inCanonical && !inReference) nonCanonical.push(asset.rel);
  if (inReference) continue;

  const hash = sha1(asset.full);
  const list = hashToPaths.get(hash) ?? [];
  list.push(asset.rel);
  hashToPaths.set(hash, list);
}

const duplicateGroups = [];
for (const paths of hashToPaths.values()) {
  if (paths.length > 1) duplicateGroups.push(paths);
}

let hasIssues = false;
if (nonCanonical.length > 0) {
  hasIssues = true;
  writeErr("Non-canonical assets found outside apps/client/public or ref-images:");
  for (const rel of nonCanonical) writeErr(`- ${rel}`);
}

if (duplicateGroups.length > 0) {
  hasIssues = true;
  writeErr("Duplicate runtime asset payloads detected:");
  for (const group of duplicateGroups) {
    writeErr(`- ${group.join(", ")}`);
  }
}

if (hasIssues) {
  process.exit(1);
}

writeOut("Asset audit passed.");
