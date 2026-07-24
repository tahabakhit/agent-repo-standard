/**
 * Guard: every registered controller tool must use a strict object schema.
 *
 * OpenAI/Codex strict function calling rejects a tool whose parameter object
 * lacks additionalProperties:false ("'additionalProperties' is required to be
 * supplied and to be false"). TypeBox omits it by default, so tools must build
 * their parameters via strictObject(), never a bare Type.Object(...). This is a
 * source-level check — the schema itself is built with Pi's bundled typebox at
 * runtime and cannot be exercised in this zero-dep tree.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "..", "controllerTools.ts"),
  "utf8",
);

test("strictObject sets additionalProperties:false", () => {
  assert.match(SRC, /additionalProperties:\s*false/);
});

test("no registerTool uses a bare Type.Object for parameters", () => {
  assert.ok(
    !/parameters:\s*Type\.Object/.test(SRC),
    "tool parameters must use strictObject(), not a bare Type.Object (missing additionalProperties:false breaks Codex strict schemas)",
  );
});

test("every registered tool declares its parameters", () => {
  const tools = SRC.match(/name:\s*"amanar_[a-z_]+"/g) ?? [];
  const params = SRC.match(/parameters:\s*strictObject\(/g) ?? [];
  assert.ok(tools.length >= 4, `expected >=4 controller tools, found ${tools.length}`);
  assert.equal(params.length, tools.length, "each tool must declare a strictObject parameters schema");
});
