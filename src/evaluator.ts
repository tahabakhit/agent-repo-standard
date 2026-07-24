/**
 * Optional cheap-model evaluator (L2).
 *
 * A judge SEPARATE from the generator, for what a rule table cannot express
 * (secrets, stubs, quality thresholds). It is optional and capability-gated:
 * the invariants never depend on it — they hold via the pre-gate, the
 * completion gate, and the runner. Disabled by default; a real deployment wires
 * a haiku-class judge behind the same injected-runner shape the loop uses for
 * hosts. Kept generator-independent because self-review is not trustworthy.
 */

export interface Verdict {
  pass: boolean;
  reason: string;
}

export interface Evaluator {
  name: string;
  judge(prompt: string): Verdict;
}

/** Default: no judgement. The kit works fully without an evaluator. */
export const disabledEvaluator: Evaluator = {
  name: "disabled",
  judge: () => ({ pass: true, reason: "evaluator disabled" }),
};

/** A judge invocation: given a judge prompt, return the raw model output. */
export type JudgeRunner = (prompt: string) => string;

/**
 * Parse a strict judge verdict. The judge must answer with a leading
 * `PASS` or `FAIL` token followed by a reason. Anything else is fail-closed.
 */
export function parseVerdict(raw: string): Verdict {
  const trimmed = raw.trim();
  const m = /^(PASS|FAIL)\b[:\s-]*(.*)$/is.exec(trimmed);
  if (m === null) return { pass: false, reason: `unparseable verdict: ${trimmed.slice(0, 120)}` };
  return { pass: m[1].toUpperCase() === "PASS", reason: m[2].trim() || m[1].toUpperCase() };
}

/**
 * Build an evaluator that shells a judge via the injected runner. Fail-closed:
 * a thrown runner or empty output is a FAIL verdict.
 */
export function commandEvaluator(runner: JudgeRunner, name = "command-judge"): Evaluator {
  return {
    name,
    judge(prompt: string): Verdict {
      try {
        const out = runner(prompt);
        if (!out.trim()) return { pass: false, reason: "empty judge output" };
        return parseVerdict(out);
      } catch (e) {
        return { pass: false, reason: `judge error: ${(e as Error).message}` };
      }
    },
  };
}
