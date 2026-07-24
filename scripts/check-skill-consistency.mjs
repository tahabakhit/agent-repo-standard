#!/usr/bin/env node
/**
 * check-skill-consistency.mjs
 *
 * Scans every skill directory under workflow/skills/* and harness/skills/*
 * and asserts:
 *
 *   1. SKILL.md exists.
 *   2. SKILL.md has `name` frontmatter that matches the directory name.
 *   3. SKILL.md has a non-empty `description` frontmatter.
 *   4. Invocation consistency: `disable-model-invocation: true` in SKILL.md
 *      iff `allow_implicit_invocation: false` in agents/openai.yaml
 *      (and the inverse: no disable-model-invocation iff allow_implicit_invocation: true).
 *
 * Exits 0 when all checks pass; exits 1 with a clear message on first drift.
 *
 * Usage:
 *   node scripts/check-skill-consistency.mjs
 *
 * Node stdlib only — no extra deps.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const SKILL_ROOTS = [
  join(REPO_ROOT, "workflow", "skills"),
  join(REPO_ROOT, "harness", "skills"),
];

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Extract the YAML frontmatter block (between the first pair of ---
 * delimiters) from a markdown file. Returns empty string if none found.
 */
function parseFrontmatter(text) {
  if (!text.startsWith("---")) return "";
  const end = text.indexOf("---", 3);
  if (end === -1) return "";
  return text.slice(3, end);
}

/**
 * Return the value of a simple scalar frontmatter key, or null if absent.
 * Only handles `key: value` (no multi-line blocks).
 */
function fmGet(frontmatter, key) {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match ? match[1].trim() : null;
}

/**
 * Return true if a frontmatter key is set to `true` (bare boolean).
 */
function fmBool(frontmatter, key) {
  return new RegExp(`^${key}:\\s*true\\s*$`, "m").test(frontmatter);
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

// ── check a single skill directory ────────────────────────────────────────

function checkSkill(skillDir, skillName) {
  const skillMdPath = join(skillDir, "SKILL.md");
  if (!existsSync(skillMdPath)) {
    fail(`${skillName}: missing SKILL.md (${skillMdPath})`);
  }

  const skillText = readFileSync(skillMdPath, "utf8");
  const frontmatter = parseFrontmatter(skillText);

  if (!frontmatter) {
    fail(`${skillName}: SKILL.md has no YAML frontmatter`);
  }

  // 1. name must be present and match directory
  const nameValue = fmGet(frontmatter, "name");
  if (!nameValue) {
    fail(`${skillName}: SKILL.md missing 'name' frontmatter field`);
  }
  if (nameValue !== skillName) {
    fail(
      `${skillName}: SKILL.md name mismatch — frontmatter 'name: ${nameValue}' does not match directory '${skillName}'`,
    );
  }

  // 2. description must be present and non-empty
  const description = fmGet(frontmatter, "description");
  if (!description) {
    fail(`${skillName}: SKILL.md missing 'description' frontmatter field`);
  }

  // 3. invocation consistency
  const openaiYamlPath = join(skillDir, "agents", "openai.yaml");
  if (!existsSync(openaiYamlPath)) {
    // No openai.yaml — skip invocation consistency check
    return;
  }

  const openaiText = readFileSync(openaiYamlPath, "utf8");
  const hasDisable = fmBool(frontmatter, "disable-model-invocation");
  const hasImplicitFalse = /allow_implicit_invocation:\s*false/.test(openaiText);
  const hasImplicitTrue = /allow_implicit_invocation:\s*true/.test(openaiText);

  if (hasDisable && !hasImplicitFalse) {
    fail(
      `${skillName}: SKILL.md has disable-model-invocation: true but agents/openai.yaml is missing allow_implicit_invocation: false`,
    );
  }
  if (!hasDisable && hasImplicitFalse) {
    fail(
      `${skillName}: agents/openai.yaml has allow_implicit_invocation: false but SKILL.md is missing disable-model-invocation: true`,
    );
  }
  if (!hasDisable && !hasImplicitTrue) {
    fail(
      `${skillName}: ${skillName} is model-invocable (no disable-model-invocation) but agents/openai.yaml is missing allow_implicit_invocation: true`,
    );
  }
  if (hasDisable && hasImplicitTrue) {
    fail(
      `${skillName}: SKILL.md has disable-model-invocation: true but agents/openai.yaml has allow_implicit_invocation: true — these are contradictory`,
    );
  }
}

// ── main ──────────────────────────────────────────────────────────────────

let total = 0;

for (const root of SKILL_ROOTS) {
  if (!existsSync(root)) {
    fail(`skill root not found: ${root}`);
  }

  const entries = readdirSync(root, { withFileTypes: true }).filter(
    (e) => e.isDirectory(),
  );

  for (const entry of entries) {
    const skillName = entry.name;
    const skillDir = join(root, skillName);
    checkSkill(skillDir, skillName);
    total++;
  }
}

console.log(
  `PASS: ${total} skill(s) checked across workflow/skills and harness/skills — all consistent`,
);
