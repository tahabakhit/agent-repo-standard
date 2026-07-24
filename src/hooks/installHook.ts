import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  copyFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Install or remove the backpressure pre-commit hook in one repository.
 * Per-repo and reversible: writes only `<root>/.git/hooks/pre-commit`, never
 * global git config. A pre-existing foreign hook is backed up on install;
 * `--remove` deletes the hook only when it is ours (marker match).
 *
 * The installed hook is a thin shim that defers to `amanar hook pre-commit`,
 * so the gate logic stays single-source in src/hooks/preCommit.ts.
 * Ported from harness/backpressure/install.py (Python).
 */

const MARKER = "# amanar-backpressure-hook";

function hookBody(): string {
  const amanarBin = resolve(fileURLToPath(new URL("../../bin/amanar", import.meta.url)));
  return `#!/bin/sh\n${MARKER}\nexec node ${JSON.stringify(amanarBin)} hook pre-commit\n`;
}

export function installPreCommit(opts: { root?: string; remove?: boolean }): void {
  const root = resolve(opts.root ?? ".");
  const gitDir = join(root, ".git");
  if (!existsSync(gitDir) || !statSync(gitDir).isDirectory()) {
    process.stderr.write("install error: not a git repository\n");
    process.exit(1);
  }
  const hooks = join(gitDir, "hooks");
  mkdirSync(hooks, { recursive: true });
  const dest = join(hooks, "pre-commit");
  const ours = hookBody();

  if (opts.remove) {
    if (existsSync(dest) && readFileSync(dest, "utf8").includes(MARKER)) {
      rmSync(dest);
      console.log(`removed ${dest}`);
    } else {
      console.log("no amanar backpressure hook to remove");
    }
    return;
  }

  if (existsSync(dest) && !readFileSync(dest, "utf8").includes(MARKER)) {
    const backup = join(hooks, "pre-commit.pre-amanar");
    copyFileSync(dest, backup);
    console.log(`backed up existing hook to ${backup}`);
  }
  writeFileSync(dest, ours);
  chmodSync(dest, 0o755);
  console.log(`installed ${dest}`);
}
