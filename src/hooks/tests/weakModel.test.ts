import test from "node:test";
import assert from "node:assert/strict";
import { forceTool, restrictTools, fewShotMessages, planThenExecute } from "../../weakModel.ts";
import { disabledEvaluator, commandEvaluator, parseVerdict } from "../../evaluator.ts";

// ── weak-model helpers ─────────────────────────────────────────────────────

test("forceTool builds an Anthropic-style forced tool_choice", () => {
  assert.deepEqual(forceTool("run_check"), { type: "tool", name: "run_check" });
});

test("restrictTools keeps only the allow-listed tools, in order", () => {
  const tools = [{ name: "a" }, { name: "b" }, { name: "c" }];
  assert.deepEqual(restrictTools(tools, ["c", "a"]), [{ name: "a" }, { name: "c" }]);
});

test("fewShotMessages alternates user/assistant", () => {
  const msgs = fewShotMessages([{ input: "i", output: "o" }]);
  assert.deepEqual(msgs, [
    { role: "user", content: "i" },
    { role: "assistant", content: "o" },
  ]);
});

test("planThenExecute freezes a copy of the steps", () => {
  const steps = ["one", "two"];
  const env = planThenExecute("plan", steps);
  steps.push("three");
  assert.deepEqual(env.steps, ["one", "two"]);
});

// ── evaluator ──────────────────────────────────────────────────────────────

test("disabledEvaluator always passes without judging", () => {
  assert.deepEqual(disabledEvaluator.judge("anything"), { pass: true, reason: "evaluator disabled" });
});

test("parseVerdict reads a strict PASS/FAIL verdict", () => {
  assert.deepEqual(parseVerdict("PASS: looks clean"), { pass: true, reason: "looks clean" });
  assert.equal(parseVerdict("FAIL - secret found").pass, false);
});

test("parseVerdict is fail-closed on garbage", () => {
  assert.equal(parseVerdict("maybe ok?").pass, false);
});

test("commandEvaluator parses the injected judge output", () => {
  const ev = commandEvaluator(() => "FAIL: placeholder detected");
  const v = ev.judge("is this real?");
  assert.equal(v.pass, false);
  assert.ok(v.reason.includes("placeholder"));
});

test("commandEvaluator is fail-closed when the judge throws", () => {
  const ev = commandEvaluator(() => {
    throw new Error("network down");
  });
  assert.equal(ev.judge("x").pass, false);
});

test("commandEvaluator is fail-closed on empty judge output", () => {
  const ev = commandEvaluator(() => "");
  assert.equal(ev.judge("x").pass, false);
});
