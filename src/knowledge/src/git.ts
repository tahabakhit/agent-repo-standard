/**
 * Git helpers: store-targeted only.
 * Exact port of kb.py git logic.
 */

import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { warn } from "./util.ts";

// ---------------------------------------------------------------------------
// Test seams (set in tests to avoid real subprocess calls)
// Exported as properties of a plain object so tests can assign to them.
// ---------------------------------------------------------------------------

export const gitSeams: {
  whichImpl: ((bin: string) => string | null) | null;
  spawnSyncGitleaksImpl:
    | ((store: string) => Pick<SpawnSyncReturns<string>, "status" | "stdout" | "stderr">)
    | null;
} = {
  whichImpl: null,
  spawnSyncGitleaksImpl: null,
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function defaultWhich(bin: string): string | null {
  const PATH = process.env["PATH"] ?? "";
  const dirs = PATH.split(path.delimiter);
  for (const dir of dirs) {
    const full = path.join(dir, bin);
    try {
      fs.accessSync(full, fs.constants.X_OK);
      return full;
    } catch {
      // not found in this dir
    }
  }
  return null;
}

function git(
  args: string[],
  cwd: string,
): { returncode: number; stdout: string; stderr: string } {
  const result = spawnSync("git", args, { cwd, encoding: "utf-8" });
  return {
    returncode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export function ensureGitRepo(store: string): void {
  const result = git(["rev-parse", "--git-dir"], store);
  if (result.returncode !== 0) {
    git(["init", "-q"], store);
    git(["config", "user.email", "kb@amanar.local"], store);
    git(["config", "user.name", "kb"], store);
  }
}

export function gitCommitStore(
  store: string,
  message: string,
  paths: string[],
): boolean {
  ensureGitRepo(store);
  const relPaths = paths
    .filter((p) => fs.existsSync(p))
    .map((p) => path.relative(store, p));
  if (relPaths.length === 0) return false;
  git(["add", ...relPaths], store);
  const result = git(["commit", "-m", message], store);
  if (result.returncode !== 0) {
    if (!(result.stdout + result.stderr).includes("nothing to commit")) {
      warn(`git commit: ${result.stderr.trim()}`);
      return false;
    }
  }
  return true;
}

export function runGitleaksCheck(store: string): string[] {
  const whichFn = gitSeams.whichImpl ?? defaultWhich;
  if (whichFn("gitleaks") === null) return [];

  let status: number | null;
  let stdout: string;
  let stderr: string;

  if (gitSeams.spawnSyncGitleaksImpl !== null) {
    const r = gitSeams.spawnSyncGitleaksImpl(store);
    status = r.status;
    stdout = r.stdout ?? "";
    stderr = r.stderr ?? "";
  } else {
    const r = spawnSync("gitleaks", ["detect", "--no-git", "--source", store], {
      encoding: "utf-8",
    });
    status = r.status;
    stdout = r.stdout ?? "";
    stderr = r.stderr ?? "";
  }

  if ((status ?? 0) === 0) return [];
  const output = (stdout + stderr).trim();
  const lines = output.split("\n").filter((l) => l.trim());
  return lines.length > 0
    ? lines.map((l) => `gitleaks: ${l}`)
    : ["gitleaks: secrets detected (no detail)"];
}
