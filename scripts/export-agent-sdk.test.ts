import { execFile as execFileCallback } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  PUBLIC_AGENT_CANONICAL_SKILLS_URL,
  PUBLIC_AGENT_COMPANION_REPO_NAME,
  PUBLIC_AGENT_COMPANION_REPO_URL,
} from "../apps/shared/publicAgentContract";
import { exportAgentSdkRepo } from "./lib/agentSdkExport";
import { exportAgentStarterRepo } from "./lib/agentStarterExport";

const execFile = promisify(execFileCallback);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_SOURCE_PATH = path.join(REPO_ROOT, "apps/client/public/skills.md");
const EXPECTED_MANAGED_PATHS = [
  ".github/workflows/public-agent-smoke.yml",
  ".gitignore",
  "README.md",
  "docs/PLAYBOOK.md",
  "docs/TUNING_GUIDE.md",
  "docs/troubleshooting.md",
  "examples/baseline-loop.mjs",
  "examples/no-context-smoke.mjs",
  "examples/self-improving-runner.mjs",
  "package.json",
  "skills.md",
  "src/contract.mjs",
  "src/index.mjs",
  "src/learn/optimizer.mjs",
  "src/learn/storage.mjs",
  "src/policies/adaptive-sweeper.mjs",
].sort();

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await readFile(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function createGitRepo(targetRoot: string, originUrl?: string): Promise<void> {
  await execFile("git", ["init", "--quiet", targetRoot]);
  if (originUrl) {
    await execFile("git", ["-C", targetRoot, "remote", "add", "origin", originUrl]);
  }
}

async function createTempRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "clawd-strike-agent-sdk-export-"));
}

async function readExportSnapshot(targetRoot: string, managedPaths: string[]): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  for (const relativePath of managedPaths) {
    snapshot[relativePath] = await readFile(path.join(targetRoot, relativePath), "utf8");
  }
  return snapshot;
}

test("starter export alias points at the canonical agent SDK exporter", () => {
  assert.equal(exportAgentStarterRepo, exportAgentSdkRepo);
});

test("dry-run export succeeds against a separate agent SDK repo checkout", async () => {
  const tempRoot = await createTempRoot();
  try {
    const targetRoot = path.join(tempRoot, PUBLIC_AGENT_COMPANION_REPO_NAME);
    await createGitRepo(targetRoot, `${PUBLIC_AGENT_COMPANION_REPO_URL}.git`);

    const result = await exportAgentSdkRepo({
      repoRoot: REPO_ROOT,
      outDir: targetRoot,
      dryRun: true,
      expectOrigin: PUBLIC_AGENT_COMPANION_REPO_URL,
    });

    assert.equal(result.dryRun, true);
    assert.deepEqual(
      result.managedFiles.map((entry) => entry.path).sort(),
      EXPECTED_MANAGED_PATHS,
    );
    assert.equal(await pathExists(path.join(targetRoot, "skills.md")), false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("bootstraps a missing target path as a separate git repo and exports deterministically", async () => {
  const tempRoot = await createTempRoot();
  try {
    const targetRoot = path.join(tempRoot, PUBLIC_AGENT_COMPANION_REPO_NAME);
    const first = await exportAgentSdkRepo({
      repoRoot: REPO_ROOT,
      outDir: targetRoot,
    });

    assert.equal(await pathExists(path.join(targetRoot, ".git/HEAD")), true);
    assert.deepEqual(
      first.managedFiles.map((entry) => entry.path).sort(),
      EXPECTED_MANAGED_PATHS,
    );

    const firstSnapshot = await readExportSnapshot(targetRoot, [
      first.manifestPath,
      ...first.managedFiles.map((entry) => entry.path),
    ]);

    const second = await exportAgentSdkRepo({
      repoRoot: REPO_ROOT,
      outDir: targetRoot,
    });

    const secondSnapshot = await readExportSnapshot(targetRoot, [
      second.manifestPath,
      ...second.managedFiles.map((entry) => entry.path),
    ]);

    assert.deepEqual(second.managedFiles, first.managedFiles);
    assert.deepEqual(secondSnapshot, firstSnapshot);

    const manifestText = firstSnapshot[first.manifestPath];
    if (typeof manifestText !== "string") {
      throw new Error("Expected manifest snapshot text");
    }
    const manifest = JSON.parse(manifestText);
    assert.equal(manifest.exportVersion, 2);
    assert.equal(manifest.contract.companionRepoName, PUBLIC_AGENT_COMPANION_REPO_NAME);
    assert.equal(manifest.contract.companionRepoUrl, PUBLIC_AGENT_COMPANION_REPO_URL);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("generated SDK modules parse and expose canonical metadata", async () => {
  const tempRoot = await createTempRoot();
  try {
    const targetRoot = path.join(tempRoot, PUBLIC_AGENT_COMPANION_REPO_NAME);
    await exportAgentSdkRepo({
      repoRoot: REPO_ROOT,
      outDir: targetRoot,
    });

    for (const relativePath of [
      "src/contract.mjs",
      "src/index.mjs",
      "src/learn/storage.mjs",
      "src/learn/optimizer.mjs",
      "src/policies/adaptive-sweeper.mjs",
      "examples/no-context-smoke.mjs",
      "examples/baseline-loop.mjs",
      "examples/self-improving-runner.mjs",
    ]) {
      await execFile("node", ["--check", path.join(targetRoot, relativePath)]);
    }

    const contractModule = await import(pathToFileURL(path.join(targetRoot, "src/contract.mjs")).href);
    const optimizerModule = await import(pathToFileURL(path.join(targetRoot, "src/learn/optimizer.mjs")).href);

    assert.equal(contractModule.PUBLIC_AGENT_COMPANION_REPO_NAME, PUBLIC_AGENT_COMPANION_REPO_NAME);
    assert.equal(contractModule.PUBLIC_AGENT_COMPANION_REPO_URL, PUBLIC_AGENT_COMPANION_REPO_URL);
    assert.equal(typeof optimizerModule.compareBatchMetrics, "function");
    assert.equal(typeof optimizerModule.createCandidatePolicyRecord, "function");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("refuses targets nested inside the game repo", async () => {
  const nestedTarget = path.join(REPO_ROOT, "output", "agent-sdk-nested-test");
  await assert.rejects(
    exportAgentSdkRepo({
      repoRoot: REPO_ROOT,
      outDir: nestedTarget,
      dryRun: true,
    }),
    /nested inside the game repo/,
  );
});

test("refuses existing non-git export targets", async () => {
  const tempRoot = await createTempRoot();
  try {
    const targetRoot = path.join(tempRoot, "sdk-no-git");
    await mkdir(targetRoot, { recursive: true });

    await assert.rejects(
      exportAgentSdkRepo({
        repoRoot: REPO_ROOT,
        outDir: targetRoot,
      }),
      /\.git directory/,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("skills mirror preserves the authoritative contract body", async () => {
  const tempRoot = await createTempRoot();
  try {
    const targetRoot = path.join(tempRoot, PUBLIC_AGENT_COMPANION_REPO_NAME);
    const result = await exportAgentSdkRepo({
      repoRoot: REPO_ROOT,
      outDir: targetRoot,
    });

    const sourceSkills = await readFile(SKILLS_SOURCE_PATH, "utf8");
    const mirroredSkills = await readFile(path.join(targetRoot, "skills.md"), "utf8");

    assert.ok(mirroredSkills.startsWith("# skills.md - Clawd Strike Agent Contract Mirror\n"));
    assert.ok(mirroredSkills.includes(`Source of truth: ${PUBLIC_AGENT_CANONICAL_SKILLS_URL}`));
    assert.ok(mirroredSkills.endsWith(`${sourceSkills.trim()}\n`));
    assert.ok(result.managedFiles.some((entry) => entry.path === "skills.md"));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("expect-origin guard rejects mismatched agent SDK repo remotes", async () => {
  const tempRoot = await createTempRoot();
  try {
    const targetRoot = path.join(tempRoot, PUBLIC_AGENT_COMPANION_REPO_NAME);
    await createGitRepo(targetRoot, "git@github.com:someone-else/different-repo.git");

    await assert.rejects(
      exportAgentSdkRepo({
        repoRoot: REPO_ROOT,
        outDir: targetRoot,
        dryRun: true,
        expectOrigin: PUBLIC_AGENT_COMPANION_REPO_URL,
      }),
      /origin mismatch/,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
