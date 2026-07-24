import test from "node:test";
import assert from "node:assert/strict";
import {
  compareVersions,
  availableNativeTools,
  planNative,
  detectHarness,
  detectVersion,
  nativeToolsHint,
} from "../../nativeTools.ts";

// ── version compare ────────────────────────────────────────────────────────

test("compareVersions orders semver-ish strings", () => {
  assert.equal(compareVersions("2.1.0", "2.0.9"), 1);
  assert.equal(compareVersions("1.0", "1.0.0"), 0);
  assert.equal(compareVersions("1.9.0", "2.0.0"), -1);
});

// ── version-gated availability ─────────────────────────────────────────────

test("availableNativeTools excludes version-gated caps when version unknown", () => {
  const caps = availableNativeTools("claude");
  const mechs = caps.map((c) => c.mechanism);
  assert.ok(mechs.includes("plan-mode")); // ungated
  assert.ok(!mechs.includes("workflows")); // gated, version unknown → excluded
});

test("availableNativeTools includes a gated cap once the version meets the min", () => {
  const mechs = availableNativeTools("claude", "2.3.0").map((c) => c.mechanism);
  assert.ok(mechs.includes("workflows"));
});

test("availableNativeTools excludes a gated cap below the min version", () => {
  const mechs = availableNativeTools("claude", "1.5.0").map((c) => c.mechanism);
  assert.ok(!mechs.includes("workflows"));
});

// ── intent → native plan with degradation ──────────────────────────────────

test("planNative chooses the top available mechanism for an intent", () => {
  const p = planNative("plan", "claude", "2.3.0");
  assert.equal(p.chosen, "plan-mode");
  assert.ok(p.floor.includes("amanar-plan"));
});

test("planNative degrades to the floor when no native mechanism is available", () => {
  // pi has no plan mechanism in the ladder → chosen null, floor present.
  const p = planNative("plan", "pi");
  assert.equal(p.chosen, null);
  assert.ok(p.floor.length > 0);
});

test("planNative parallelize prefers workflows when available, else subagents", () => {
  assert.equal(planNative("parallelize", "claude", "2.3.0").chosen, "workflows");
  assert.equal(planNative("parallelize", "claude", "1.0.0").chosen, "subagents");
});

test("planNative research falls to mcp when deep-research is absent", () => {
  assert.equal(planNative("research", "codex").chosen, "mcp");
});

// ── detection ──────────────────────────────────────────────────────────────

test("detectHarness reads the explicit override first", () => {
  assert.equal(detectHarness({ AMANAR_HARNESS: "codex" }), "codex");
});

test("detectHarness infers claude from env markers", () => {
  assert.equal(detectHarness({ CLAUDECODE: "1" }), "claude");
});

test("detectHarness returns null when unknown", () => {
  assert.equal(detectHarness({}), null);
});

test("detectVersion reads the explicit override", () => {
  assert.equal(detectVersion({ AMANAR_HARNESS_VERSION: "2.1.0" }), "2.1.0");
  assert.equal(detectVersion({}), undefined);
});

// ── hint ───────────────────────────────────────────────────────────────────

test("nativeToolsHint lists available mechanisms; null when harness unknown", () => {
  assert.equal(nativeToolsHint(null), null);
  const hint = nativeToolsHint("claude", "2.3.0");
  assert.ok(hint !== null && hint.includes("workflows"));
  assert.ok(hint.includes("prefer these"));
});
