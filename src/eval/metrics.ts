import type { Score, SuiteResult } from "./types.ts";

/** Fraction of scores that passed (0 when empty). */
export function accuracy(scores: Score[]): number {
  if (scores.length === 0) return 0;
  return scores.filter((s) => s.pass).length / scores.length;
}

export interface EvalSummary {
  total: number;
  passed: number;
  failed: number;
  accuracy: number;
  bySuite: Array<{ suite: string; passed: number; failed: number; accuracy: number }>;
}

export function summarize(results: SuiteResult[]): EvalSummary {
  const bySuite = results.map((r) => ({
    suite: r.suite,
    passed: r.passed,
    failed: r.failed,
    accuracy: accuracy(r.scores),
  }));
  const passed = results.reduce((n, r) => n + r.passed, 0);
  const failed = results.reduce((n, r) => n + r.failed, 0);
  const total = passed + failed;
  return { total, passed, failed, accuracy: total === 0 ? 0 : passed / total, bySuite };
}

/** Human-readable summary; failures listed with their reasons. */
export function formatSummary(results: SuiteResult[]): string {
  const s = summarize(results);
  const lines: string[] = ["amanar eval"];
  for (const b of s.bySuite) {
    lines.push(`  ${b.suite}: ${b.passed}/${b.passed + b.failed} (${(b.accuracy * 100).toFixed(0)}%)`);
  }
  for (const r of results) {
    for (const sc of r.scores) {
      if (!sc.pass) lines.push(`  FAIL ${r.suite}/${sc.caseId}: ${sc.reason}`);
    }
  }
  lines.push(`  total: ${s.passed}/${s.total} (${(s.accuracy * 100).toFixed(0)}%)`);
  return lines.join("\n");
}
