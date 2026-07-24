import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { route } from "../routing.ts";
import { classifyToolCall } from "../classify.ts";
import { loadCases, runTask } from "./runner.ts";
import { runMutationSuite } from "./mutation.ts";
import type { EvalCase, SuiteResult, Score } from "./types.ts";

/**
 * The five eval suites:
 *  1. invocation      — deterministic routing hits the right skill (+ misfires)
 *  2. procedure       — each skill's SKILL.md carries its procedure invariants
 *  3. verify-gate     — mutation testing: seeded mutants are blocked (the core)
 *  4. model-tier      — recorded tier scores do not regress with capability
 *  5. harness-parity  — the shared classifier decides identically for all harnesses
 */

function casesDir(repoRoot: string, suite: string): string {
  return join(repoRoot, "src", "eval", "cases", suite);
}

// ── Suite 1: invocation correctness + misfire negatives ────────────────────
async function invocationSuite(repoRoot: string): Promise<SuiteResult> {
  const dataset = loadCases(casesDir(repoRoot, "invocation"));
  return runTask({
    suite: "invocation",
    dataset,
    solver: (c) => ({ case: c, output: route(String(c.prompt)).at(0)?.skill ?? null }),
    scorer: (s) => {
      const expected = (s.case.expected as string | null) ?? null;
      const pass = s.output === expected;
      return { caseId: s.case.id, pass, reason: pass ? "ok" : `expected ${expected}, got ${s.output}` };
    },
  });
}

// ── Suite 2: procedure adherence (static invariants in each SKILL.md) ───────
async function procedureSuite(repoRoot: string): Promise<SuiteResult> {
  const dataset = loadCases(casesDir(repoRoot, "procedure"));
  return runTask({
    suite: "procedure",
    dataset,
    solver: (c) => {
      const p = join(repoRoot, "skills", String(c.skill), "SKILL.md");
      return { case: c, output: existsSync(p) ? readFileSync(p, "utf8") : "" };
    },
    scorer: (s) => {
      const text = String(s.output);
      const must = (s.case.mustContain as string[] | undefined) ?? [];
      const mustNot = (s.case.mustNotContain as string[] | undefined) ?? [];
      const missing = must.filter((m) => !text.includes(m));
      const present = mustNot.filter((m) => text.includes(m));
      const pass = text.length > 0 && missing.length === 0 && present.length === 0;
      const reason = pass
        ? "ok"
        : text.length === 0
          ? "SKILL.md not found"
          : `missing=${JSON.stringify(missing)} forbidden=${JSON.stringify(present)}`;
      return { caseId: s.case.id, pass, reason };
    },
  });
}

// ── Suite 3: verify-gate mutation testing (the differentiator) ─────────────
function verifyGateSuite(): SuiteResult {
  const scores = runMutationSuite();
  const passed = scores.filter((s) => s.pass).length;
  return { suite: "verify-gate", scores, passed, failed: scores.length - passed };
}

// ── Suite 4: model-tier regression ─────────────────────────────────────────
async function modelTierSuite(repoRoot: string): Promise<SuiteResult> {
  const dataset = loadCases(casesDir(repoRoot, "tier"));
  return runTask({
    suite: "model-tier",
    dataset,
    solver: (c) => ({ case: c, output: c.tiers }),
    scorer: (s) => monotonicTierScore(s.case, s.output),
  });
}

/** Assert scores are non-decreasing along the declared tier order (no regression). */
function monotonicTierScore(c: EvalCase, output: unknown): Score {
  const order = (c.order as string[] | undefined) ?? [];
  const tiers = (output as Record<string, number>) ?? {};
  const eps = typeof c.epsilon === "number" ? (c.epsilon as number) : 0.001;
  for (let i = 1; i < order.length; i++) {
    const prev = tiers[order[i - 1]];
    const cur = tiers[order[i]];
    if (typeof prev !== "number" || typeof cur !== "number") {
      return { caseId: c.id, pass: false, reason: `missing tier score for ${order[i - 1]}/${order[i]}` };
    }
    if (cur < prev - eps) {
      return { caseId: c.id, pass: false, reason: `regression ${order[i - 1]}=${prev} -> ${order[i]}=${cur}` };
    }
  }
  return { caseId: c.id, pass: true, reason: "no regression" };
}

// ── Suite 5: harness parity (shared classifier) ────────────────────────────
async function harnessParitySuite(repoRoot: string): Promise<SuiteResult> {
  const dataset = loadCases(casesDir(repoRoot, "parity"));
  return runTask({
    suite: "harness-parity",
    dataset,
    solver: (c) => ({ case: c, output: classifyToolCall("bash", { command: String(c.command) }).allow }),
    scorer: (s) => {
      const pass = s.output === (s.case.expectAllow as boolean);
      return {
        caseId: s.case.id,
        pass,
        reason: pass ? "ok" : `expected allow=${s.case.expectAllow}, got ${s.output}`,
      };
    },
  });
}

/** Run all five suites and return their results in order. */
export async function runAllSuites(repoRoot: string): Promise<SuiteResult[]> {
  return [
    await invocationSuite(repoRoot),
    await procedureSuite(repoRoot),
    verifyGateSuite(),
    await modelTierSuite(repoRoot),
    await harnessParitySuite(repoRoot),
  ];
}
