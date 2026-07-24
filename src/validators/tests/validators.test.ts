import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateComponents } from "../components.ts";
import { validateSkillConsistency } from "../skillConsistency.ts";
import { validateWorkflow } from "../workflow.ts";
import { EXPLICIT_ONLY, KNOWN_SKILLS } from "../roster.ts";

/**
 * Negative-case coverage for the gate validators. The gate itself runs them over
 * the real tree (positive path); these assert they REJECT bad input — the logic
 * a green run never exercises.
 */

let base: string;
beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "val-"));
});
afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

// ── components: estate-identifier leak ─────────────────────────────────────

test("validateComponents: passes a clean tree", () => {
  writeFileSync(join(base, "ok.md"), "portable content only\n");
  const out = validateComponents(base, []);
  assert.match(out, /PASS/);
});

test("validateComponents: rejects a leaked estate identifier", () => {
  // Assemble the token from fragments so this test file is not itself a match.
  writeFileSync(join(base, "leak.md"), `estate ${"NAS" + "RID"} slipped in\n`);
  assert.throws(() => validateComponents(base, []), /estate-specific identifier/);
});

test("validateComponents: skips declared identifier sources", () => {
  const src = join(base, "components.ts");
  writeFileSync(src, `${"NAS" + "RID"}\n`);
  assert.match(validateComponents(base, [src]), /PASS/);
});

// ── skillConsistency: per-skill policy + buckets ───────────────────────────

function writeSkill(
  root: string,
  name: string,
  opts: { name?: string; description?: string; disable?: boolean; implicit?: "true" | "false" | "none" } = {},
): void {
  const dir = join(root, "skills", name);
  mkdirSync(join(dir, "agents"), { recursive: true });
  const fmName = opts.name ?? name;
  const desc = opts.description ?? "does a thing";
  const disable = opts.disable ? "disable-model-invocation: true\n" : "";
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${fmName}\ndescription: ${desc}\n${disable}---\nbody\n`);
  if (opts.implicit !== "none") {
    writeFileSync(join(dir, "agents", "openai.yaml"), `allow_implicit_invocation: ${opts.implicit ?? "true"}\n`);
  }
}

test("validateSkillConsistency: a consistent model-invocable skill passes", () => {
  writeSkill(base, "amanar-demo", { implicit: "true" });
  assert.match(validateSkillConsistency(base), /PASS/);
});

test("validateSkillConsistency: rejects a name/directory mismatch", () => {
  writeSkill(base, "amanar-demo", { name: "wrong-name", implicit: "true" });
  assert.throws(() => validateSkillConsistency(base), /name mismatch/);
});

test("validateSkillConsistency: rejects a missing description", () => {
  const dir = join(base, "skills", "amanar-demo", "agents");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(base, "skills", "amanar-demo", "SKILL.md"), `---\nname: amanar-demo\n---\nbody\n`);
  writeFileSync(join(dir, "openai.yaml"), "allow_implicit_invocation: true\n");
  assert.throws(() => validateSkillConsistency(base), /missing 'description'/);
});

test("validateSkillConsistency: rejects disable-model-invocation without implicit:false", () => {
  writeSkill(base, "amanar-demo", { disable: true, implicit: "true" });
  assert.throws(() => validateSkillConsistency(base), /missing allow_implicit_invocation: false/);
});

test("validateSkillConsistency: rejects a contradictory both-flags openai.yaml", () => {
  // disable-model-invocation with openai.yaml declaring BOTH false and true.
  const dir = join(base, "skills", "amanar-demo", "agents");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(base, "skills", "amanar-demo", "SKILL.md"),
    "---\nname: amanar-demo\ndescription: d\ndisable-model-invocation: true\n---\nbody\n",
  );
  writeFileSync(join(dir, "openai.yaml"), "allow_implicit_invocation: false\nallow_implicit_invocation: true\n");
  assert.throws(() => validateSkillConsistency(base), /contradictory/);
});

test("validateSkillConsistency: rejects model-invocable skill missing implicit:true", () => {
  writeSkill(base, "amanar-demo", { implicit: "none" });
  // openai.yaml absent → no cross-check; add one lacking the flag.
  writeFileSync(join(base, "skills", "amanar-demo", "agents", "openai.yaml"), "other: value\n");
  assert.throws(() => validateSkillConsistency(base), /missing allow_implicit_invocation: true/);
});

test("validateSkillConsistency: bucket directories are not treated as skills", () => {
  // A malformed 'skill' under a bucket must be ignored, not validated.
  writeSkill(base, join("deprecated", "amanar-old"), { name: "totally-wrong", implicit: "true" });
  // Also need at least the bucket dir to exist; a valid sibling skill keeps count > 0.
  writeSkill(base, "amanar-demo", { implicit: "true" });
  assert.match(validateSkillConsistency(base), /PASS/);
});

// ── workflow: full-roster drift + broken links + tokens ────────────────────

/** Generate a complete, policy-correct roster fixture that validateWorkflow accepts. */
function makeRoster(root: string): void {
  for (const name of KNOWN_SKILLS) {
    const dir = join(root, "skills", name);
    mkdirSync(join(dir, "agents"), { recursive: true });
    const explicit = EXPLICIT_ONLY.has(name);
    const fm = [
      "---",
      `name: ${name}`,
      "description: a validated skill",
      ...(explicit ? ["disable-model-invocation: true"] : []),
      "---",
      "Body with no stray tokens.",
      ...(explicit ? ["Use only when explicitly invoked by the user."] : []),
      "",
    ].join("\n");
    writeFileSync(join(dir, "SKILL.md"), fm);
    writeFileSync(
      join(dir, "agents", "openai.yaml"),
      `allow_implicit_invocation: ${explicit ? "false" : "true"}\n`,
    );
  }
}

test("validateWorkflow: a complete policy-correct roster passes", () => {
  makeRoster(base);
  assert.match(validateWorkflow(base), /PASS/);
});

test("validateWorkflow: rejects roster drift (a known skill is absent)", () => {
  makeRoster(base);
  rmSync(join(base, "skills", "amanar-plan"), { recursive: true, force: true });
  assert.throws(() => validateWorkflow(base), /expected skills are absent/);
});

test("validateWorkflow: rejects a broken relative link", () => {
  makeRoster(base);
  writeFileSync(
    join(base, "skills", "amanar-plan", "SKILL.md"),
    "---\nname: amanar-plan\ndescription: d\n---\nSee [x](./missing.md).\n",
  );
  assert.throws(() => validateWorkflow(base), /broken link/);
});

test("validateWorkflow: rejects an unresolved invocation token", () => {
  makeRoster(base);
  writeFileSync(
    join(base, "skills", "amanar-plan", "SKILL.md"),
    "---\nname: amanar-plan\ndescription: d\n---\nRun $amanar-nonesuch now.\n",
  );
  assert.throws(() => validateWorkflow(base), /unresolved invocation token/);
});

test("validateWorkflow: rejects an invocation-policy inconsistency", () => {
  makeRoster(base);
  // Make an explicit-only skill claim implicit-true → inconsistency.
  const name = [...EXPLICIT_ONLY][0];
  writeFileSync(join(base, "skills", name, "agents", "openai.yaml"), "allow_implicit_invocation: true\n");
  assert.throws(() => validateWorkflow(base), /inconsistency|missing allow_implicit_invocation: false/);
});
