import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import {
  EXPLICIT_ONLY,
  MODEL_INVOCABLE,
  KNOWN_SKILLS,
  ALLOWED_TOKENS,
} from "./roster.ts";
import { parseFrontmatter, escapeRegExp, walkFiles } from "./util.ts";

/** Port of workflow/tests/validate-workflow.py — canonical workflow skills. */
export function validateWorkflow(repoRoot: string): string {
  const SKILLS = join(repoRoot, "workflow", "skills");
  const actual = readdirSync(SKILLS, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  // Each present skill must have the correct name in its SKILL.md.
  for (const name of [...actual].sort()) {
    const skillText = readFileSync(join(SKILLS, name, "SKILL.md"), "utf8");
    if (!new RegExp(`^name:\\s*${escapeRegExp(name)}$`, "m").test(skillText)) {
      throw new Error(`name field does not match directory: ${name}`);
    }
  }

  const missing = [...KNOWN_SKILLS].filter((s) => !actual.includes(s)).sort();
  if (missing.length) {
    throw new Error(`expected skills are absent: ${JSON.stringify(missing)}`);
  }

  const unknown = actual.filter((s) => !KNOWN_SKILLS.has(s)).sort();
  if (unknown.length) {
    console.log(
      `WARNING: unknown skills present (not validated by policy): ${JSON.stringify(unknown)}`,
    );
  }

  for (const name of [...KNOWN_SKILLS].sort()) {
    const root = join(SKILLS, name);
    validateSkill(root, name);
    // Relative-link check.
    for (const path of walkFiles(root, (p) => p.endsWith(".md"))) {
      const text = readFileSync(path, "utf8");
      for (const m of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        const target = m[1];
        if (/^(https?:\/\/|#)/.test(target)) continue;
        const targetPath = resolve(dirname(path), target.split("#")[0]);
        if (!existsSync(targetPath)) {
          throw new Error(
            `broken link: ${relative(repoRoot, path)} -> ${target}`,
          );
        }
      }
    }
  }

  return (
    `PASS: ${KNOWN_SKILLS.size} workflow skills validated ` +
    `(${MODEL_INVOCABLE.size} model-invocable, ${EXPLICIT_ONLY.size} explicit-only)`
  );
}

function validateSkill(root: string, name: string): void {
  const skillText = readFileSync(join(root, "SKILL.md"), "utf8");
  const frontmatter = parseFrontmatter(skillText);
  const openaiText = readFileSync(join(root, "agents", "openai.yaml"), "utf8");

  const hasDisable = frontmatter.includes("disable-model-invocation: true");
  const hasImplicitFalse = openaiText.includes("allow_implicit_invocation: false");
  const hasImplicitTrue = openaiText.includes("allow_implicit_invocation: true");

  if (hasDisable !== hasImplicitFalse) {
    throw new Error(
      `invocation policy inconsistency in ${name}: ` +
        `SKILL.md disable-model-invocation=${hasDisable} ` +
        `but openai.yaml allow_implicit_invocation: false=${hasImplicitFalse}`,
    );
  }

  if (EXPLICIT_ONLY.has(name)) {
    if (!hasDisable) {
      throw new Error(`explicit-only skill missing disable-model-invocation: ${name}`);
    }
    if (!hasImplicitFalse) {
      throw new Error(`explicit-only skill missing allow_implicit_invocation: false: ${name}`);
    }
    if (!/Use only when explicitly invoked/.test(skillText)) {
      throw new Error(
        `explicit-only skill missing 'Use only when explicitly invoked' clause: ${name}`,
      );
    }
  } else if (MODEL_INVOCABLE.has(name)) {
    if (hasDisable) {
      throw new Error(`model-invocable skill has disable-model-invocation: ${name}`);
    }
    if (!hasImplicitTrue) {
      throw new Error(`model-invocable skill missing allow_implicit_invocation: true: ${name}`);
    }
    if (/Use only when explicitly invoked/.test(skillText)) {
      throw new Error(
        `model-invocable skill should not have 'Use only when explicitly invoked' clause: ${name}`,
      );
    }
  }

  if (!/^name:\s*\S+/m.test(frontmatter)) {
    throw new Error(`missing name field in frontmatter: ${name}`);
  }
  if (!/^description:\s*.+/m.test(frontmatter)) {
    throw new Error(`missing description field in frontmatter: ${name}`);
  }

  for (const path of walkFiles(root, (p) => p.endsWith(".md"))) {
    const text = readFileSync(path, "utf8");
    for (const m of text.matchAll(/\$[a-z][a-z0-9:-]+/g)) {
      const token = m[0].slice(1);
      if (!ALLOWED_TOKENS.has(token)) {
        throw new Error(`unresolved invocation token ${m[0]}: ${path}`);
      }
    }
  }
}
