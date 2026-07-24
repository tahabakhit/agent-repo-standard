import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Onboard-skill-specific checks. Name, frontmatter, invocation policy, link
 * resolution, and $token validation are covered by the roster validator
 * (workflow.ts) and skillConsistency.ts; this validator adds only what is
 * unique to onboard: its behavioural fixture and the obsolete-generator
 * boundary (no live Copier artifacts leak back into the tree).
 */
export function validateOnboard(repoRoot: string): string {
  const SKILL = join(repoRoot, "skills", "amanar-onboard");
  const FIXTURE = join(SKILL, "tests", "onboard-evaluations.json");

  const skill = readFileSync(join(SKILL, "SKILL.md"), "utf8");
  req(/^name:\s*amanar-onboard$/m.test(skill), "invalid onboard name");
  req(skill.includes("$amanar-onboard"), "canonical invocation missing");

  const metadata = readFileSync(join(SKILL, "agents", "openai.yaml"), "utf8");
  req(metadata.includes("allow_implicit_invocation: false"), "onboard must be explicit-only");

  const data = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
    schema_version?: number;
    cases?: Array<{ id?: string }>;
  };
  req(data.schema_version === 1, "unsupported fixture schema");
  const cases = data.cases;
  req(Array.isArray(cases) && cases.length === 5, "expected five behavioral cases");
  const ids = new Set((cases ?? []).map((c) => c.id));
  req(ids.size === (cases ?? []).length, "fixture IDs must be unique");

  for (const obsolete of ["copier.yml", "template", "bin/new-repo.sh", "tests/verify-template.sh"]) {
    req(!existsSync(join(repoRoot, obsolete)), `obsolete live generator path: ${obsolete}`);
  }

  return "PASS: Amanar onboard skill structure, fixtures, and compatibility boundary valid";
}

function req(value: boolean, message: string): void {
  if (!value) throw new Error(message);
}
