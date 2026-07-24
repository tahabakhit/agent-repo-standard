import test from "node:test";
import assert from "node:assert/strict";
import { runTask } from "../runner.ts";
import { accuracy, summarize } from "../metrics.ts";
import { runMutationSuite } from "../mutation.ts";
import type { EvalCase } from "../types.ts";

// ── runner framework ───────────────────────────────────────────────────────

test("runTask scores each case through solver and scorer", async () => {
  const dataset: EvalCase[] = [
    { id: "a", suite: "t", want: 2 },
    { id: "b", suite: "t", want: 3 },
  ];
  const result = await runTask({
    suite: "t",
    dataset,
    solver: (c) => ({ case: c, output: (c.want as number) * 2 }),
    scorer: (s) => ({ caseId: s.case.id, pass: s.output === 4, reason: "" }),
  });
  assert.equal(result.passed, 1);
  assert.equal(result.failed, 1);
});

test("runTask turns a thrown solver into a failed score, not a crash", async () => {
  const result = await runTask({
    suite: "t",
    dataset: [{ id: "x", suite: "t" }],
    solver: () => {
      throw new Error("boom");
    },
    scorer: (s) => ({ caseId: s.case.id, pass: true, reason: "" }),
  });
  assert.equal(result.failed, 1);
  assert.ok(result.scores[0].reason.includes("boom"));
});

// ── metrics ────────────────────────────────────────────────────────────────

test("accuracy and summarize aggregate across suites", () => {
  const scores = [
    { caseId: "1", pass: true, reason: "" },
    { caseId: "2", pass: false, reason: "" },
  ];
  assert.equal(accuracy(scores), 0.5);
  const s = summarize([{ suite: "t", scores, passed: 1, failed: 1 }]);
  assert.equal(s.total, 2);
  assert.equal(s.passed, 1);
});

// ── the differentiator: verify-gate mutation testing ───────────────────────

test("mutation suite: every seeded mutant is blocked and the control passes", () => {
  const scores = runMutationSuite();
  const byId = Object.fromEntries(scores.map((s) => [s.caseId, s]));
  assert.equal(byId["mutant-tampered-test"].pass, true, byId["mutant-tampered-test"].reason);
  assert.equal(byId["mutant-placeholder"].pass, true, byId["mutant-placeholder"].reason);
  assert.equal(byId["mutant-unmet-world-state"].pass, true, byId["mutant-unmet-world-state"].reason);
  assert.equal(byId["control-clean-verified"].pass, true, byId["control-clean-verified"].reason);
});
