import test from "node:test";
import assert from "node:assert/strict";
import { protectedSpans, verifyPreserved } from "../essenceDoc.ts";

test("protectedSpans extracts fenced code, inline code, and URLs", () => {
  const doc = "See `run()` at https://x.example/y\n\n```\ncode block\n```\n";
  const kinds = protectedSpans(doc).map((s) => s.kind).sort();
  assert.deepEqual(kinds, ["fenced-code", "inline-code", "url"]);
});

test("verifyPreserved passes when all protected spans survive a prose trim", () => {
  const before = "This paragraph, which is honestly quite wordy, calls `foo(bar)` — see https://a.example/z.";
  const after = "Calls `foo(bar)` — see https://a.example/z.";
  assert.deepEqual(verifyPreserved(before, after), { ok: true, missing: [] });
});

test("verifyPreserved flags an altered code span", () => {
  const before = "Run `npm test` now.";
  const after = "Run `npm run test` now.";
  const r = verifyPreserved(before, after);
  assert.equal(r.ok, false);
  assert.equal(r.missing[0]?.text, "`npm test`");
});

test("verifyPreserved flags a dropped URL", () => {
  const before = "Docs: https://example.com/guide and text.";
  const after = "Docs and text.";
  const r = verifyPreserved(before, after);
  assert.equal(r.ok, false);
  assert.equal(r.missing[0]?.kind, "url");
});

test("verifyPreserved requires each duplicate occurrence to survive", () => {
  const before = "`x` then `x` again.";
  const after = "`x` only once.";
  const r = verifyPreserved(before, after);
  assert.equal(r.ok, false);
  assert.equal(r.missing.length, 1);
});
