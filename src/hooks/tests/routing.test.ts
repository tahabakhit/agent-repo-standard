import test from "node:test";
import assert from "node:assert/strict";
import { route, catalogLines, ROUTES } from "../../routing.ts";

test("route: clarification intent routes to interview", () => {
  const m = route("the requirements are unclear, help me clarify scope");
  assert.equal(m[0]?.skill, "amanar-interview");
});

test("route: design intent routes to plan", () => {
  const m = route("what architecture and approach should we design here");
  assert.equal(m[0]?.skill, "amanar-plan");
});

test("route: is deterministic — same text, same order", () => {
  const a = route("review and audit this design approach");
  const b = route("review and audit this design approach");
  assert.deepEqual(a, b);
});

test("route: ranks by number of trigger hits", () => {
  const m = route("scaffold a new repo and set up the repo harness");
  assert.equal(m[0]?.skill, "amanar-onboard");
  assert.ok((m[0]?.hits.length ?? 0) >= 2);
});

test("route: no match returns empty", () => {
  assert.deepEqual(route("xyzzy plugh"), []);
});

test("catalogLines: one line per route, explicit-only marked", () => {
  const lines = catalogLines();
  assert.equal(lines.length, ROUTES.length);
  assert.ok(lines.some((l) => l.includes("$amanar-deliver (explicit)")));
  assert.ok(lines.some((l) => l.includes("$amanar-interview —")));
});
