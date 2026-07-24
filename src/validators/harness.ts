import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { parseFrontmatter, walkFiles } from "./util.ts";

/** Port of harness/tests/validate-harness.py — scaffold structure + boundary. */
export function validateHarness(repoRoot: string): string {
  const ROOT = join(repoRoot, "harness");
  const REPO = repoRoot;
  const SKILL = join(ROOT, "skills", "amanar-scaffold");
  const FIXTURE = join(ROOT, "tests", "fixtures", "scaffold-evaluations.json");

  const skill = readFileSync(join(SKILL, "SKILL.md"), "utf8");
  require(/^name:\s*amanar-scaffold$/m.test(skill), "invalid scaffold name");
  require(skill.includes("$amanar-scaffold"), "canonical invocation missing");

  const metadata = readFileSync(join(SKILL, "agents", "openai.yaml"), "utf8");
  require(metadata.includes("allow_implicit_invocation: false"), "scaffold must be explicit-only");

  validateTokensAndMetadata(SKILL);

  for (const path of walkFiles(SKILL, (p) => p.endsWith(".md"))) {
    const text = readFileSync(path, "utf8");
    for (const m of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = m[1];
      if (/^(https?:\/\/|#)/.test(target)) continue;
      require(
        existsSync(resolve(dirname(path), target.split("#")[0])),
        `broken link: ${path}: ${target}`,
      );
    }
  }

  const data = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
    schema_version?: number;
    cases?: Array<{ id?: string }>;
  };
  require(data.schema_version === 1, "unsupported fixture schema");
  const cases = data.cases;
  require(Array.isArray(cases) && cases.length === 5, "expected five behavioral cases");
  const ids = new Set((cases ?? []).map((c) => c.id));
  require(ids.size === (cases ?? []).length, "fixture IDs must be unique");

  for (const obsolete of ["copier.yml", "template", "bin/new-repo.sh", "tests/verify-template.sh"]) {
    require(!existsSync(join(REPO, obsolete)), `obsolete live Copier path: ${obsolete}`);
  }

  return "PASS: Amanar harness structure, links, fixtures, and compatibility boundary valid";
}

function validateTokensAndMetadata(SKILL: string): void {
  const text = readFileSync(join(SKILL, "SKILL.md"), "utf8");
  const frontmatter = parseFrontmatter(text);
  require(
    /^description:\s*.+Use only when explicitly invoked/m.test(frontmatter) &&
      frontmatter.includes("disable-model-invocation: true"),
    "invalid scaffold explicit frontmatter",
  );
  require(
    readFileSync(join(SKILL, "agents", "openai.yaml"), "utf8").includes(
      "allow_implicit_invocation: false",
    ),
    "scaffold must be explicit-only",
  );
  const allowed = new Set([
    "amanar-scaffold",
    "amanar-workflow",
    "amanar-inquire",
    "amanar-design",
    "amanar-assure",
    "agent-eval:evaluate-all",
  ]);
  for (const path of walkFiles(SKILL, (p) => p.endsWith(".md"))) {
    const text = readFileSync(path, "utf8");
    for (const m of text.matchAll(/\$[a-z][a-z0-9:-]+/g)) {
      require(allowed.has(m[0].slice(1)), `unresolved invocation token ${m[0]}: ${path}`);
    }
  }
}

function require(value: boolean, message: string): void {
  if (!value) throw new Error(message);
}
