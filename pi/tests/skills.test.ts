/**
 * Tests for skill path resolution in the Pi extension.
 *
 * Verifies that the directory extension.ts registers via resources_discover
 * exists on disk and contains the expected amanar-* skills. The path is
 * computed here the same way extension.ts does — relative to pi/ — so the test
 * stays in sync.
 *
 * Pure filesystem tests — no Pi runtime required. Avoids importing extension.ts
 * directly because its transitive imports use extensions the type-stripped test
 * runner resolves differently.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, statSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Mirror the path logic in extension.ts (pi/extension.ts → ../skills).
const PI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_DIR = resolve(PI_DIR, "..", "skills");

const EXPECTED_SKILLS = [
  "amanar-adversarial-review",
  "amanar-author-skill",
  "amanar-deliver",
  "amanar-interview",
  "amanar-onboard",
  "amanar-plan",
  "amanar-remember",
];

test("SKILLS_DIR: resolves to an existing directory", () => {
  assert.ok(existsSync(SKILLS_DIR), `skills dir not found: ${SKILLS_DIR}`);
  assert.ok(statSync(SKILLS_DIR).isDirectory());
});

for (const skill of EXPECTED_SKILLS) {
  test(`SKILLS_DIR: contains ${skill}`, () => {
    const entries = readdirSync(SKILLS_DIR);
    assert.ok(
      entries.includes(skill),
      `expected ${skill} in ${SKILLS_DIR}, found: ${entries.join(", ")}`,
    );
  });
}

test("every skill has a SKILL.md", () => {
  for (const skill of EXPECTED_SKILLS) {
    const skillMd = join(SKILLS_DIR, skill, "SKILL.md");
    assert.ok(existsSync(skillMd), `missing SKILL.md: ${skillMd}`);
  }
});
