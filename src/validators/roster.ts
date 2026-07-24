/**
 * Canonical Amanar skill roster — the single source of truth the workflow
 * validator enforces. Adding a skill (e.g. a new model-invocable skill or a
 * router) means updating these sets in the same change, or the gate fails.
 */

// Skills with live effects must stay explicit-only.
export const EXPLICIT_ONLY = new Set<string>(["amanar-deliver", "amanar-onboard"]);

// Skills that are model-invocable by default.
export const MODEL_INVOCABLE = new Set<string>([
  "amanar-interview",
  "amanar-plan",
  "amanar-adversarial-review",
  "amanar-remember",
  "amanar-author-skill",
  "amanar-essence",
  "amanar-guide",
  "amanar-worktrees",
  "amanar-debug",
  "amanar-discover",
  "amanar-last30days",
]);

export const KNOWN_SKILLS = new Set<string>([...EXPLICIT_ONLY, ...MODEL_INVOCABLE]);

// Invocation tokens that may appear in skill markdown.
export const ALLOWED_TOKENS = new Set<string>([...KNOWN_SKILLS]);

// Bucket directories under skills/ that are not themselves skills — they hold
// non-promoted skills off the validated surface.
export const SKILL_BUCKETS = new Set<string>(["in-progress", "deprecated"]);
