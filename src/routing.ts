/**
 * Deterministic intent → skill routing.
 *
 * Routing is a keyword table, never free model judgment: the same text always
 * routes to the same skills, which is what makes routing safe to rely on for
 * weak models and for the guide/catalog. This does not invoke anything — it
 * suggests which skill applies; explicit-only skills still require explicit
 * invocation.
 */

export interface SkillRoute {
  skill: string;
  /** Substrings (lowercased) that route to this skill. */
  triggers: string[];
  /** One-line purpose, surfaced in the catalog. */
  summary: string;
  explicitOnly: boolean;
}

export const ROUTES: SkillRoute[] = [
  {
    skill: "amanar-interview",
    triggers: ["clarify", "unclear", "requirements", "what should", "scope", "figure out what", "ambiguous"],
    summary: "Clarify an unclear idea into a verifiable success contract.",
    explicitOnly: false,
  },
  {
    skill: "amanar-plan",
    triggers: ["design", "architecture", "plan", "approach", "how should we build", "trade-off", "tradeoff"],
    summary: "Design a system from evidence, alternatives, and failure analysis.",
    explicitOnly: false,
  },
  {
    skill: "amanar-adversarial-review",
    triggers: ["review", "verify my", "check my work", "is this ready", "audit", "adversarial", "readiness"],
    summary: "Independently challenge readiness and completion evidence.",
    explicitOnly: false,
  },
  {
    skill: "amanar-remember",
    triggers: ["remember", "save this", "note for later", "capture this", "knowledge entry"],
    summary: "Capture reusable knowledge into the configured store.",
    explicitOnly: false,
  },
  {
    skill: "amanar-author-skill",
    triggers: ["write a skill", "author a skill", "new skill", "revise this skill", "skill.md"],
    summary: "Apply the kit skill-authoring discipline to a SKILL.md.",
    explicitOnly: false,
  },
  {
    skill: "amanar-deliver",
    triggers: ["implement", "make the tests pass", "ship this", "deliver", "governed workflow", "run the controller"],
    summary: "Route a material objective through the controller to verified.",
    explicitOnly: true,
  },
  {
    skill: "amanar-onboard",
    triggers: ["scaffold", "new repo", "set up the repo", "harness", "onboard", "adopt this repo", "audit the repo"],
    summary: "Design, audit, or apply the smallest useful repository harness.",
    explicitOnly: true,
  },
];

export interface RouteMatch {
  skill: string;
  summary: string;
  explicitOnly: boolean;
  hits: string[];
}

/**
 * Route free text to matching skills by keyword, most-hits first. Deterministic:
 * ties break by ROUTES order. Empty array when nothing matches.
 */
export function route(text: string): RouteMatch[] {
  const lower = text.toLowerCase();
  const matches: RouteMatch[] = [];
  for (const r of ROUTES) {
    const hits = r.triggers.filter((t) => lower.includes(t));
    if (hits.length > 0) {
      matches.push({ skill: r.skill, summary: r.summary, explicitOnly: r.explicitOnly, hits });
    }
  }
  return matches.sort((a, b) => b.hits.length - a.hits.length);
}

/** A compact, stable catalog line per skill — used by SessionStart and guide. */
export function catalogLines(): string[] {
  return ROUTES.map(
    (r) => `- $${r.skill}${r.explicitOnly ? " (explicit)" : ""} — ${r.summary}`,
  );
}
