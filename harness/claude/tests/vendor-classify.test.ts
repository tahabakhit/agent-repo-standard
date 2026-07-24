/**
 * Drift guard for the vendored backpressure classifier.
 *
 * harness/pi/src/classify.ts is the single source of truth; vendor/classify.ts
 * is a machine-maintained verbatim mirror that ships inside the packaged plugin
 * root. This test fails the build if the mirror drifts, so the fix
 * (regenerate) is enforced rather than remembered.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CANONICAL = resolve(__dirname, "..", "..", "pi", "src", "classify.ts");
const VENDORED = resolve(__dirname, "..", "vendor", "classify.ts");

test("vendored classify.ts is byte-identical to the canonical Pi source", () => {
  const canonical = readFileSync(CANONICAL, "utf8");
  const vendored = readFileSync(VENDORED, "utf8");
  assert.equal(
    vendored,
    canonical,
    "vendor/classify.ts is out of sync with harness/pi/src/classify.ts — " +
      "regenerate with `node harness/claude/scripts/vendor-classify.mjs`",
  );
});
