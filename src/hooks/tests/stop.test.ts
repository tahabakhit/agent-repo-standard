import test from "node:test";
import assert from "node:assert/strict";
import { decideStop, buildStopOutput } from "../stop.ts";

const contractYes = { hasContract: () => true };
const contractNo = { hasContract: () => false };

test("decideStop: no contract → allow stop", () => {
  const d = decideStop({}, "/repo", { ...contractNo, verified: () => false });
  assert.equal(d.block, false);
});

test("decideStop: contract unverified → block stop", () => {
  const d = decideStop({}, "/repo", { ...contractYes, verified: () => false });
  assert.equal(d.block, true);
  assert.ok(d.reason?.includes("not verified"));
});

test("decideStop: contract verified → allow stop", () => {
  const d = decideStop({}, "/repo", { ...contractYes, verified: () => true });
  assert.equal(d.block, false);
});

test("decideStop: stop_hook_active guards against an infinite loop", () => {
  const d = decideStop({ stop_hook_active: true }, "/repo", {
    ...contractYes,
    verified: () => false,
  });
  assert.equal(d.block, false);
});

test("buildStopOutput: block produces decision:block JSON", () => {
  const out = buildStopOutput({ block: true, reason: "r" });
  assert.ok(out !== null);
  const parsed = JSON.parse(out) as { decision: string; reason: string };
  assert.equal(parsed.decision, "block");
  assert.equal(parsed.reason, "r");
});

test("buildStopOutput: allow returns null", () => {
  assert.equal(buildStopOutput({ block: false }), null);
});
