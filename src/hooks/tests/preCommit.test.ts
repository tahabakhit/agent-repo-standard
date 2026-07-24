import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runPreCommit } from "../preCommit.ts";
import { installPreCommit } from "../installHook.ts";

const PASS_CONTRACT =
  '{"checks":[{"id":"ok","command":"true","expectedExit":0,"outputContains":[],"timeoutSeconds":10}]}';
const FAIL_CONTRACT =
  '{"checks":[{"id":"bad","command":"false","expectedExit":0,"outputContains":[],"timeoutSeconds":10}]}';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "bp-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
  git("init", "-q");
  git("config", "user.email", "bp@example.invalid");
  git("config", "user.name", "BP");
  writeFileSync(join(root, "keep.txt"), "content\n");
  git("add", "-A");
  git("commit", "-qm", "init");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function stage(name: string, content: string): void {
  writeFileSync(join(root, name), content);
  execFileSync("git", ["add", name], { cwd: root });
}

function writeContract(body: string): void {
  mkdirSync(join(root, ".amanar"), { recursive: true });
  writeFileSync(join(root, ".amanar", "workflow.json"), body);
}

function capture(fn: () => number): { code: number; err: string } {
  const orig = process.stderr.write.bind(process.stderr);
  let err = "";
  (process.stderr as { write: unknown }).write = (chunk: unknown) => {
    err += String(chunk);
    return true;
  };
  try {
    return { code: fn(), err };
  } finally {
    (process.stderr as { write: unknown }).write = orig;
  }
}

test("clean tree without contract passes", () => {
  assert.equal(runPreCommit(root), 0);
});

test("passing contract checks pass", () => {
  writeContract(PASS_CONTRACT);
  assert.equal(runPreCommit(root), 0);
});

test("failing contract check blocks", () => {
  writeContract(FAIL_CONTRACT);
  const { code, err } = capture(() => runPreCommit(root));
  assert.equal(code, 1);
  assert.match(err, /check bad failed/);
});

test("staged whitespace blocks", () => {
  stage("bad.txt", "trailing space \n");
  const { code, err } = capture(() => runPreCommit(root));
  assert.equal(code, 1);
  assert.match(err, /whitespace/);
});

test("install and remove roundtrip", () => {
  installPreCommit({ root });
  const dest = join(root, ".git", "hooks", "pre-commit");
  assert.ok(existsSync(dest));
  assert.match(readFileSync(dest, "utf8"), /amanar-backpressure-hook/);
  installPreCommit({ root, remove: true });
  assert.ok(!existsSync(dest));
});

test("install backs up existing hook", () => {
  const hooks = join(root, ".git", "hooks");
  mkdirSync(hooks, { recursive: true });
  writeFileSync(join(hooks, "pre-commit"), "#!/bin/sh\necho other\n");
  installPreCommit({ root });
  assert.ok(existsSync(join(hooks, "pre-commit.pre-amanar")));
  assert.match(readFileSync(join(hooks, "pre-commit"), "utf8"), /amanar-backpressure-hook/);
});
