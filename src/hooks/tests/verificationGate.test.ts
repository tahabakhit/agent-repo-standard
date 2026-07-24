import test from "node:test";
import assert from "node:assert/strict";
import {
  outwardActionKind,
  parseVerified,
  gateOutwardAction,
} from "../verificationGate.ts";

// ── outwardActionKind ──────────────────────────────────────────────────────

test("outwardActionKind: git push is push", () => {
  assert.equal(outwardActionKind("git push origin main"), "push");
});

test("outwardActionKind: npm/yarn/pnpm publish is publish", () => {
  assert.equal(outwardActionKind("npm publish"), "publish");
  assert.equal(outwardActionKind("yarn publish --access public"), "publish");
  assert.equal(outwardActionKind("pnpm publish"), "publish");
});

test("outwardActionKind: gh release create is publish", () => {
  assert.equal(outwardActionKind("gh release create v1.0.0"), "publish");
});

test("outwardActionKind: ordinary commands are not outward", () => {
  assert.equal(outwardActionKind("npm run build"), null);
  assert.equal(outwardActionKind("git commit -m x"), null);
  assert.equal(outwardActionKind("npm install"), null);
});

// ── parseVerified ──────────────────────────────────────────────────────────

test("parseVerified: verified + current is true", () => {
  assert.equal(parseVerified(JSON.stringify({ status: "verified", current: true })), true);
});

test("parseVerified: unmet or stale is false", () => {
  assert.equal(parseVerified(JSON.stringify({ status: "verified", current: false })), false);
  assert.equal(parseVerified(JSON.stringify({ status: "implementing", current: true })), false);
});

test("parseVerified: garbage is false (fail-closed)", () => {
  assert.equal(parseVerified("not json"), false);
  assert.equal(parseVerified(""), false);
});

// ── gateOutwardAction ──────────────────────────────────────────────────────

test("gateOutwardAction: non-outward command is never blocked", () => {
  const g = gateOutwardAction("npm run build", "/repo", {
    hasContract: () => true,
    verified: () => false,
  });
  assert.equal(g.block, false);
});

test("gateOutwardAction: outward with no contract defers to the floor", () => {
  const g = gateOutwardAction("npm publish", "/repo", {
    hasContract: () => false,
    verified: () => false,
  });
  assert.equal(g.block, false);
});

test("gateOutwardAction: outward with unverified contract is blocked", () => {
  const g = gateOutwardAction("npm publish", "/repo", {
    hasContract: () => true,
    verified: () => false,
  });
  assert.equal(g.block, true);
  assert.ok(g.reason?.includes("not verified"));
});

test("gateOutwardAction: outward with verified contract is permitted", () => {
  const g = gateOutwardAction("npm publish", "/repo", {
    hasContract: () => true,
    verified: () => true,
  });
  assert.equal(g.block, false);
});
