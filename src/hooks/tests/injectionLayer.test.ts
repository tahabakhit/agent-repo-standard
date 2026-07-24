import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  essenceDirective,
  buildTurnInjection,
  sessionCatalog,
  bootstrapPointer,
  buildPiInjection,
} from "../../inject.ts";
import { buildSessionContext, buildSessionStartOutput } from "../sessionStart.ts";
import {
  essenceToggleFromPrompt,
  resolveEssenceState,
  buildUserPromptOutput,
} from "../userPromptSubmit.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "s7-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ── essence directive + toggle ─────────────────────────────────────────────

test("essenceDirective is standalone and non-empty", () => {
  const d = essenceDirective();
  assert.ok(d.includes("essence"));
  assert.ok(d.includes("verbatim"));
});

test("essenceToggleFromPrompt detects off and on", () => {
  assert.equal(essenceToggleFromPrompt("please stop essence now"), "off");
  assert.equal(essenceToggleFromPrompt("switch to normal mode"), "off");
  assert.equal(essenceToggleFromPrompt("essence mode please"), "on");
  assert.equal(essenceToggleFromPrompt("just build the thing"), null);
});

test("resolveEssenceState: default on, off persists, on re-enables (injected store)", () => {
  const store: Record<string, boolean> = {};
  const deps = {
    isOff: (m: string) => store[m] === true,
    setOff: (m: string, off: boolean) => {
      store[m] = off;
    },
  };
  assert.equal(resolveEssenceState("s1", "hello", deps), true);
  assert.equal(resolveEssenceState("s1", "stop essence", deps), false);
  assert.equal(resolveEssenceState("s1", "next prompt", deps), false); // stays off
  assert.equal(resolveEssenceState("s1", "essence mode", deps), true);
  assert.equal(resolveEssenceState("s1", "next prompt", deps), true); // stays on
});

// ── turn injection ─────────────────────────────────────────────────────────

test("buildTurnInjection: essence on, no contract → essence only", () => {
  const out = buildTurnInjection(root, { essenceOn: true, statusRunner: () => "" });
  assert.ok(out !== null);
  assert.ok(out.includes("essence"));
});

test("buildTurnInjection: essence off, no contract → null", () => {
  const out = buildTurnInjection(root, { essenceOn: false, statusRunner: () => "" });
  assert.equal(out, null);
});

test("buildTurnInjection: includes workflow context when a contract is unmet", () => {
  mkdirSync(join(root, ".amanar"), { recursive: true });
  writeFileSync(join(root, ".amanar", "workflow.json"), JSON.stringify({ objective: "do X" }));
  const out = buildTurnInjection(root, {
    essenceOn: true,
    statusRunner: () => JSON.stringify({ status: "implementing", current: false, problems: [] }),
  });
  assert.ok(out !== null);
  assert.ok(out.includes("do X"));
  assert.ok(out.includes("essence"));
});

test("buildUserPromptOutput wraps as UserPromptSubmit additionalContext", () => {
  const out = buildUserPromptOutput("ctx");
  assert.ok(out !== null);
  const parsed = JSON.parse(out) as {
    hookSpecificOutput: { hookEventName: string; additionalContext: string };
  };
  assert.equal(parsed.hookSpecificOutput.hookEventName, "UserPromptSubmit");
});

// ── session start ──────────────────────────────────────────────────────────

test("sessionCatalog lists the skills", () => {
  const c = sessionCatalog();
  assert.ok(c.includes("amanar-interview"));
  assert.ok(c.includes("amanar-onboard"));
});

test("buildSessionContext: no .amanar → catalog plus onboarding nudge", () => {
  const c = buildSessionContext(root, {});
  assert.ok(c !== null && c.includes("amanar-onboard"));
  assert.ok(c.includes("No .amanar/"));
});

test("buildSessionContext: with .amanar → catalog, no onboarding nudge", () => {
  mkdirSync(join(root, ".amanar"), { recursive: true });
  const c = buildSessionContext(root, {});
  assert.ok(c !== null);
  assert.ok(!c.includes("No .amanar/"));
});

test("buildSessionContext: appends native-tools hint when a harness is detected", () => {
  const c = buildSessionContext(root, { AMANAR_HARNESS: "claude", AMANAR_HARNESS_VERSION: "2.3.0" });
  assert.ok(c !== null && c.includes("[amanar:native]"));
  assert.ok(c.includes("workflows"));
});

test("buildSessionStartOutput wraps as SessionStart additionalContext", () => {
  const out = buildSessionStartOutput("hi");
  assert.ok(out !== null);
  const parsed = JSON.parse(out) as { hookSpecificOutput: { hookEventName: string } };
  assert.equal(parsed.hookSpecificOutput.hookEventName, "SessionStart");
});

// ── Pi before_agent_start injection (buildPiInjection) ─────────────────────

test("bootstrapPointer names the amanar skill prefix", () => {
  assert.ok(bootstrapPointer().includes("$amanar-"));
});

test("buildPiInjection: first turn carries bootstrap + catalog + onboarding nudge", () => {
  const out = buildPiInjection(root, { firstTurn: true, essenceOn: true, statusRunner: () => "" });
  assert.ok(out !== null);
  assert.ok(out.includes("[amanar:bootstrap]"));
  assert.ok(out.includes("amanar-interview")); // from the catalog
  assert.ok(out.includes("No .amanar/")); // onboarding nudge (no contract here)
  assert.ok(out.includes("essence")); // per-turn directive
});

test("buildPiInjection: later turns drop first-turn orientation, keep per-turn", () => {
  const out = buildPiInjection(root, { firstTurn: false, essenceOn: true, statusRunner: () => "" });
  assert.ok(out !== null);
  assert.ok(!out.includes("[amanar:bootstrap]"));
  assert.ok(!out.includes("amanar-interview"));
  assert.ok(out.includes("essence"));
});

test("buildPiInjection: later turn, essence off, no contract → null", () => {
  const out = buildPiInjection(root, { firstTurn: false, essenceOn: false, statusRunner: () => "" });
  assert.equal(out, null);
});

test("buildPiInjection: first turn always injects even with essence off", () => {
  const out = buildPiInjection(root, { firstTurn: true, essenceOn: false, statusRunner: () => "" });
  assert.ok(out !== null);
  assert.ok(out.includes("[amanar:bootstrap]"));
});

test("buildPiInjection: with a contract, .amanar present → no onboarding nudge, workflow context shown", () => {
  mkdirSync(join(root, ".amanar"), { recursive: true });
  writeFileSync(join(root, ".amanar", "workflow.json"), JSON.stringify({ objective: "ship Y" }));
  const out = buildPiInjection(root, {
    firstTurn: true,
    essenceOn: true,
    statusRunner: () => JSON.stringify({ status: "implementing", current: false, problems: [] }),
  });
  assert.ok(out !== null);
  assert.ok(!out.includes("No .amanar/"));
  assert.ok(out.includes("ship Y"));
});

test("buildPiInjection: firstTurnExtras are appended on the first turn", () => {
  const out = buildPiInjection(root, {
    firstTurn: true,
    essenceOn: true,
    statusRunner: () => "",
    firstTurnExtras: ["[amanar:native] hint line", null, ""],
  });
  assert.ok(out !== null);
  assert.ok(out.includes("[amanar:native] hint line"));
});
