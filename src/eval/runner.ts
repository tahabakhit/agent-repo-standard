import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { EvalCase, Task, SuiteResult } from "./types.ts";

/** Load JSON case files from a suite directory. Empty when the dir is absent. */
export function loadCases(dir: string): EvalCase[] {
  if (!existsSync(dir)) return [];
  const cases: EvalCase[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".json")) continue;
    const parsed = JSON.parse(readFileSync(join(dir, name), "utf8")) as EvalCase;
    cases.push(parsed);
  }
  return cases;
}

/** Run every case in a task through its solver and scorer. */
export async function runTask(task: Task): Promise<SuiteResult> {
  const scores = [];
  for (const c of task.dataset) {
    let score;
    try {
      const sample = await task.solver(c);
      score = task.scorer(sample);
    } catch (e) {
      score = { caseId: c.id, pass: false, reason: `solver/scorer threw: ${(e as Error).message}` };
    }
    scores.push(score);
  }
  const passed = scores.filter((s) => s.pass).length;
  return { suite: task.suite, scores, passed, failed: scores.length - passed };
}
