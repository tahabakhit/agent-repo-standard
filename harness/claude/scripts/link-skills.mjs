#!/usr/bin/env node
/**
 * link-skills.mjs
 *
 * Creates relative symlinks from harness/claude/skills/ to every amanar-*
 * skill directory in the kit, so the Claude Code plugin serves all skills
 * without duplicating files.
 *
 * Claude Code requires skills/ to live under the plugin root — plugin.json
 * has no path-array field for external skill locations. Symlinks are the
 * no-duplication solution.
 *
 * Usage (from repo root):
 *   node harness/claude/scripts/link-skills.mjs
 *
 * Idempotent: existing symlinks are removed and re-created on each run.
 * Exits non-zero on any error.
 */

import { readdirSync, symlinkSync, rmSync, mkdirSync, existsSync, lstatSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Absolute paths
const PLUGIN_ROOT = resolve(__dirname, "..");                          // harness/claude/
const SKILLS_DEST = join(PLUGIN_ROOT, "skills");                      // harness/claude/skills/
const WORKFLOW_SKILLS_SRC = resolve(__dirname, "..", "..", "..", "workflow", "skills");  // workflow/skills/
const HARNESS_SKILLS_SRC = resolve(__dirname, "..", "..", "skills");  // harness/skills/

mkdirSync(SKILLS_DEST, { recursive: true });

/**
 * Collect (name -> absoluteSourcePath) for every amanar-* dir in a source dir.
 */
function collectSkills(srcDir) {
  if (!existsSync(srcDir)) {
    console.error(`source dir not found: ${srcDir}`);
    process.exit(1);
  }
  return readdirSync(srcDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith("amanar-"))
    .map((e) => ({ name: e.name, abs: join(srcDir, e.name) }));
}

const skills = [
  ...collectSkills(WORKFLOW_SKILLS_SRC),
  ...collectSkills(HARNESS_SKILLS_SRC),
];

let linked = 0;

for (const { name, abs } of skills) {
  const linkPath = join(SKILLS_DEST, name);

  // Remove existing symlink (or bail if it is a real file/dir)
  let existingStat = null;
  try {
    existingStat = lstatSync(linkPath); // lstat does not follow symlinks
  } catch {
    // does not exist yet — nothing to remove
  }
  if (existingStat !== null) {
    if (!existingStat.isSymbolicLink()) {
      console.error(`collision: ${linkPath} is not a symlink — remove it manually`);
      process.exit(1);
    }
    rmSync(linkPath);
  }

  // Relative target from the symlink's location (SKILLS_DEST) to the source
  const relTarget = relative(SKILLS_DEST, abs);
  symlinkSync(relTarget, linkPath);
  console.log(`  ${name} -> ${relTarget}`);
  linked++;
}

console.log(`\nLinked ${linked} skill(s) into ${SKILLS_DEST}`);
