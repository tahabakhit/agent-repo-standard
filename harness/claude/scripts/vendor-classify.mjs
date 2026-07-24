#!/usr/bin/env node
/**
 * vendor-classify.mjs
 *
 * Copies the canonical backpressure classifier
 * (harness/pi/src/classify.ts) verbatim into the Claude Code plugin root at
 * harness/claude/vendor/classify.ts.
 *
 * Why: Claude Code packages only the plugin root (marketplace source
 * "./harness/claude"). A code import cannot reach the sibling harness/pi/
 * tree, so the classifier must physically live under the plugin root or the
 * PreToolUse hook fails with ERR_MODULE_NOT_FOUND once installed. The Pi
 * source stays the single source of truth; this file is a machine-maintained
 * mirror, and tests/vendor-classify.test.ts fails the build if it drifts.
 *
 * Usage (from repo root):
 *   node harness/claude/scripts/vendor-classify.mjs
 *
 * Idempotent. Exits non-zero on any error.
 */

import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PLUGIN_ROOT = resolve(__dirname, ".."); // harness/claude/
const CANONICAL = resolve(__dirname, "..", "..", "pi", "src", "classify.ts"); // harness/pi/src/classify.ts
const VENDOR_DIR = join(PLUGIN_ROOT, "vendor"); // harness/claude/vendor/
const DEST = join(VENDOR_DIR, "classify.ts");

if (!existsSync(CANONICAL)) {
  console.error(`canonical classifier not found: ${CANONICAL}`);
  process.exit(1);
}

mkdirSync(VENDOR_DIR, { recursive: true });
copyFileSync(CANONICAL, DEST);
console.log(`vendored ${CANONICAL} -> ${DEST}`);
