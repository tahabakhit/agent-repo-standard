/**
 * Eval case-runner types — Inspect-AI shape (Dataset → Task → Solver → Scorer).
 *
 * A Task pairs a Solver (produce an output for a case) with a Scorer (grade the
 * output). Cases are plain data. This runner reuses the deterministic kit
 * internals (routing, loop guards, the verification gate) as solvers, so the
 * suites need no live model to grade.
 */

export interface EvalCase {
  id: string;
  suite: string;
  [key: string]: unknown;
}

export interface Sample {
  case: EvalCase;
  output: unknown;
}

export interface Score {
  caseId: string;
  pass: boolean;
  reason: string;
}

export type Solver = (c: EvalCase) => Sample | Promise<Sample>;
export type Scorer = (s: Sample) => Score;

export interface Task {
  suite: string;
  dataset: EvalCase[];
  solver: Solver;
  scorer: Scorer;
}

export interface SuiteResult {
  suite: string;
  scores: Score[];
  passed: number;
  failed: number;
}
