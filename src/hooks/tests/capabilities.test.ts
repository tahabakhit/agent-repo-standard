import test from "node:test";
import assert from "node:assert/strict";
import { capable, capabilitiesFor, asHarness } from "../../capabilities.ts";

test("claude has both the pre-gate and the completion gate", () => {
  assert.equal(capable("claude", "preToolUseDeny"), true);
  assert.equal(capable("claude", "completionGate"), true);
});

test("pi has a pre-gate and injection but no completion gate", () => {
  assert.equal(capable("pi", "preToolUseDeny"), true);
  assert.equal(capable("pi", "reinjection"), true);
  assert.equal(capable("pi", "completionGate"), false);
});

test("codex has only the shell pre-gate; no completion gate or injection", () => {
  assert.equal(capable("codex", "preToolUseDeny"), true);
  assert.equal(capable("codex", "completionGate"), false);
  assert.equal(capable("codex", "reinjection"), false);
});

test("the runner-holds-done floor is present on every harness", () => {
  for (const h of ["claude", "pi", "codex"] as const) {
    assert.equal(capable(h, "runnerHoldsDone"), true);
  }
});

test("capabilitiesFor accepts an optional version without changing today's defaults", () => {
  assert.deepEqual(capabilitiesFor("pi"), capabilitiesFor("pi", "1.2.3"));
});

test("asHarness recognizes known harnesses only", () => {
  assert.equal(asHarness("claude"), "claude");
  assert.equal(asHarness("pi"), "pi");
  assert.equal(asHarness("codex"), "codex");
  assert.equal(asHarness("hermes"), null);
  assert.equal(asHarness(undefined), null);
});
