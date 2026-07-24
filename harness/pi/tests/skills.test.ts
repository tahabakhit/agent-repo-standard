/**
 * Tests for skill path resolution in the Pi extension.
 *
 * Verifies that the directories extension.ts will register via
 * resources_discover actually exist on disk and contain the expected
 * amanar-* skills. Paths are computed here the same way extension.ts
 * does — relative to the src/ directory — so the test stays in sync.
 *
 * Pure filesystem tests — no Pi runtime required.
 * Avoids importing extension.ts directly because its transitive imports
 * use .js suffixes (TypeScript NodeNext convention) that the type-stripped
 * test runner cannot resolve to .ts sources.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, statSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Mirror the path logic in extension.ts (relative to src/, same as __dirname there)
const SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");

const WORKFLOW_SKILLS_DIR = resolve(SRC_DIR, "..", "..", "..", "workflow", "skills");
const HARNESS_SKILLS_DIR = resolve(SRC_DIR, "..", "..", "skills");

// ── directory existence ────────────────────────────────────────────────────

test("WORKFLOW_SKILLS_DIR: resolves to an existing directory", () => {
  assert.ok(
    existsSync(WORKFLOW_SKILLS_DIR),
    `workflow skills dir not found: ${WORKFLOW_SKILLS_DIR}`,
  );
  assert.ok(statSync(WORKFLOW_SKILLS_DIR).isDirectory());
});

test("HARNESS_SKILLS_DIR: resolves to an existing directory", () => {
  assert.ok(
    existsSync(HARNESS_SKILLS_DIR),
    `harness skills dir not found: ${HARNESS_SKILLS_DIR}`,
  );
  assert.ok(statSync(HARNESS_SKILLS_DIR).isDirectory());
});

// ── expected skills present ────────────────────────────────────────────────

const EXPECTED_WORKFLOW_SKILLS = [
  "amanar-assure",
  "amanar-design",
  "amanar-inquire",
  "amanar-remember",
  "amanar-workflow",
  "amanar-writing-skills",
];

const EXPECTED_HARNESS_SKILLS = ["amanar-scaffold"];

for (const skill of EXPECTED_WORKFLOW_SKILLS) {
  test(`WORKFLOW_SKILLS_DIR: contains ${skill}`, () => {
    const entries = readdirSync(WORKFLOW_SKILLS_DIR);
    assert.ok(
      entries.includes(skill),
      `expected ${skill} in ${WORKFLOW_SKILLS_DIR}, found: ${entries.join(", ")}`,
    );
  });
}

for (const skill of EXPECTED_HARNESS_SKILLS) {
  test(`HARNESS_SKILLS_DIR: contains ${skill}`, () => {
    const entries = readdirSync(HARNESS_SKILLS_DIR);
    assert.ok(
      entries.includes(skill),
      `expected ${skill} in ${HARNESS_SKILLS_DIR}, found: ${entries.join(", ")}`,
    );
  });
}

// ── each skill dir has a SKILL.md ─────────────────────────────────────────

test("every workflow skill has a SKILL.md", () => {
  for (const skill of EXPECTED_WORKFLOW_SKILLS) {
    const skillMd = join(WORKFLOW_SKILLS_DIR, skill, "SKILL.md");
    assert.ok(existsSync(skillMd), `missing SKILL.md: ${skillMd}`);
  }
});

test("every harness skill has a SKILL.md", () => {
  for (const skill of EXPECTED_HARNESS_SKILLS) {
    const skillMd = join(HARNESS_SKILLS_DIR, skill, "SKILL.md");
    assert.ok(existsSync(skillMd), `missing SKILL.md: ${skillMd}`);
  }
});

// ── path agreement: WORKFLOW_SKILLS_DIR and HARNESS_SKILLS_DIR are distinct ─

test("workflow and harness skill dirs are distinct paths", () => {
  assert.notEqual(
    WORKFLOW_SKILLS_DIR,
    HARNESS_SKILLS_DIR,
    "WORKFLOW_SKILLS_DIR and HARNESS_SKILLS_DIR must be different paths",
  );
});
