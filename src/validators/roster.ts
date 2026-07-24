/**
 * Canonical Amanar skill roster — the single source of truth the workflow
 * validator enforces. Adding a skill (e.g. a new model-invocable skill or a
 * router) means updating these sets in the same change, or the gate fails.
 */

// Skills with live effects must stay explicit-only.
export const EXPLICIT_ONLY = new Set<string>(["amanar-workflow"]);

// Skills that are model-invocable by default.
export const MODEL_INVOCABLE = new Set<string>([
  "amanar-inquire",
  "amanar-design",
  "amanar-assure",
  "amanar-remember",
  "amanar-writing-skills",
]);

export const KNOWN_SKILLS = new Set<string>([...EXPLICIT_ONLY, ...MODEL_INVOCABLE]);

// Invocation tokens that may appear in skill markdown.
export const ALLOWED_TOKENS = new Set<string>([
  ...KNOWN_SKILLS,
  "amanar-scaffold",
  "agent-eval:evaluate-all",
]);
