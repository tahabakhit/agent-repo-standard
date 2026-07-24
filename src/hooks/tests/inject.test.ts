import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { activeWorkflowContext } from "../../inject.ts";
import { buildPreCompactOutput } from "../preCompact.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "inject-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeContract(objective: string): void {
  mkdirSync(join(root, ".amanar"), { recursive: true });
  writeFileSync(join(root, ".amanar", "workflow.json"), JSON.stringify({ objective }));
}

test("activeWorkflowContext: null when no contract governs the repo", () => {
  assert.equal(activeWorkflowContext(root, () => ""), null);
});

test("activeWorkflowContext: null when the contract is verified and current", () => {
  writeContract("ship it");
  const runner = () => JSON.stringify({ status: "verified", current: true });
  assert.equal(activeWorkflowContext(root, runner), null);
});

test("activeWorkflowContext: summarizes an unmet contract with its problems", () => {
  writeContract("ship the feature");
  const runner = () =>
    JSON.stringify({ status: "implementing", current: false, problems: ["missing receipt: tests"] });
  const ctx = activeWorkflowContext(root, runner);
  assert.ok(ctx !== null);
  assert.ok(ctx.includes("ship the feature"));
  assert.ok(ctx.includes("implementing"));
  assert.ok(ctx.includes("missing receipt: tests"));
  assert.ok(ctx.includes("receipts"));
});

test("buildPreCompactOutput: wraps context as PreCompact additionalContext", () => {
  const out = buildPreCompactOutput("hello");
  assert.ok(out !== null);
  const parsed = JSON.parse(out) as {
    hookSpecificOutput: { hookEventName: string; additionalContext: string };
  };
  assert.equal(parsed.hookSpecificOutput.hookEventName, "PreCompact");
  assert.equal(parsed.hookSpecificOutput.additionalContext, "hello");
});

test("buildPreCompactOutput: null context emits nothing", () => {
  assert.equal(buildPreCompactOutput(null), null);
});
