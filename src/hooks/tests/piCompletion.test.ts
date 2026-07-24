import test from "node:test";
import assert from "node:assert/strict";
import { decidePiSettle, PI_CONTINUE_REASON, PI_NUDGE_CAP } from "../piCompletion.ts";

const contractYes = { hasContract: () => true };
const contractNo = { hasContract: () => false };

test("decidePiSettle: no contract → reset, no continuation", () => {
  const d = decidePiSettle("/repo", { nudges: 0 }, { ...contractNo, verified: () => false });
  assert.equal(d.action, "reset");
  assert.equal(d.reason, undefined);
});

test("decidePiSettle: verified → reset, no continuation", () => {
  const d = decidePiSettle("/repo", { nudges: 0 }, { ...contractYes, verified: () => true });
  assert.equal(d.action, "reset");
});

test("decidePiSettle: unverified under the cap → continue with the evidence demand", () => {
  const d = decidePiSettle("/repo", { nudges: 0 }, { ...contractYes, verified: () => false });
  assert.equal(d.action, "continue");
  assert.equal(d.reason, PI_CONTINUE_REASON);
  assert.ok(d.reason?.includes("verify"));
});

test("decidePiSettle: unverified at the cap → stand down (bounded, no loop)", () => {
  const d = decidePiSettle(
    "/repo",
    { nudges: PI_NUDGE_CAP },
    { ...contractYes, verified: () => false },
  );
  assert.equal(d.action, "stand-down");
  assert.equal(d.reason, undefined);
});

test("decidePiSettle: a higher cap allows more continuations before standing down", () => {
  const deps = { ...contractYes, verified: () => false };
  assert.equal(decidePiSettle("/repo", { nudges: 1 }, deps, 3).action, "continue");
  assert.equal(decidePiSettle("/repo", { nudges: 3 }, deps, 3).action, "stand-down");
});
