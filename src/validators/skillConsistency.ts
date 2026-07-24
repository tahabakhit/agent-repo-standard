import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { SKILL_BUCKETS } from "./roster.ts";

/**
 * Every skill under the single root `skills/` tree has a SKILL.md whose name
 * matches its directory, a non-empty description, and an invocation policy that
 * agrees between SKILL.md and agents/openai.yaml.
 */
export function validateSkillConsistency(repoRoot: string): string {
  const roots = [join(repoRoot, "skills")];
  let total = 0;
  for (const root of roots) {
    if (!existsSync(root)) throw new Error(`skill root not found: ${root}`);
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || SKILL_BUCKETS.has(entry.name)) continue;
      checkSkill(join(root, entry.name), entry.name);
      total++;
    }
  }
  return `PASS: ${total} skill(s) checked under skills/ — all consistent`;
}

function parseFrontmatter(text: string): string {
  if (!text.startsWith("---")) return "";
  const end = text.indexOf("---", 3);
  if (end === -1) return "";
  return text.slice(3, end);
}

function fmGet(frontmatter: string, key: string): string | null {
  const m = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return m ? m[1].trim() : null;
}

function fmBool(frontmatter: string, key: string): boolean {
  return new RegExp(`^${key}:\\s*true\\s*$`, "m").test(frontmatter);
}

function checkSkill(skillDir: string, skillName: string): void {
  const skillMdPath = join(skillDir, "SKILL.md");
  if (!existsSync(skillMdPath)) throw new Error(`${skillName}: missing SKILL.md (${skillMdPath})`);

  const skillText = readFileSync(skillMdPath, "utf8");
  const frontmatter = parseFrontmatter(skillText);
  if (!frontmatter) throw new Error(`${skillName}: SKILL.md has no YAML frontmatter`);

  const nameValue = fmGet(frontmatter, "name");
  if (!nameValue) throw new Error(`${skillName}: SKILL.md missing 'name' frontmatter field`);
  if (nameValue !== skillName) {
    throw new Error(
      `${skillName}: SKILL.md name mismatch — frontmatter 'name: ${nameValue}' does not match directory '${skillName}'`,
    );
  }

  const description = fmGet(frontmatter, "description");
  if (!description) throw new Error(`${skillName}: SKILL.md missing 'description' frontmatter field`);

  const openaiYamlPath = join(skillDir, "agents", "openai.yaml");
  if (!existsSync(openaiYamlPath)) return;

  const openaiText = readFileSync(openaiYamlPath, "utf8");
  const hasDisable = fmBool(frontmatter, "disable-model-invocation");
  const hasImplicitFalse = /allow_implicit_invocation:\s*false/.test(openaiText);
  const hasImplicitTrue = /allow_implicit_invocation:\s*true/.test(openaiText);

  if (hasDisable && !hasImplicitFalse) {
    throw new Error(
      `${skillName}: SKILL.md has disable-model-invocation: true but agents/openai.yaml is missing allow_implicit_invocation: false`,
    );
  }
  if (!hasDisable && hasImplicitFalse) {
    throw new Error(
      `${skillName}: agents/openai.yaml has allow_implicit_invocation: false but SKILL.md is missing disable-model-invocation: true`,
    );
  }
  if (!hasDisable && !hasImplicitTrue) {
    throw new Error(
      `${skillName}: ${skillName} is model-invocable (no disable-model-invocation) but agents/openai.yaml is missing allow_implicit_invocation: true`,
    );
  }
  if (hasDisable && hasImplicitTrue) {
    throw new Error(
      `${skillName}: SKILL.md has disable-model-invocation: true but agents/openai.yaml has allow_implicit_invocation: true — these are contradictory`,
    );
  }
}
