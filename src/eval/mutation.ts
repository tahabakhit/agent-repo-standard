import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { snapshotTests, detectTestTampering, detectPlaceholders } from "../loop/src/guards.ts";
import { gateOutwardAction } from "../hooks/verificationGate.ts";
import { decideStop } from "../hooks/stop.ts";
import type { Score } from "./types.ts";

/**
 * Verify-gate mutation testing — the differentiator.
 *
 * Seed each anti-gaming path with a tampered mutant and assert the gate BLOCKS,
 * plus a clean control that must NOT block. A gate that fails to block a mutant
 * (or false-positives on the control) is broken; the case fails. No live model:
 * the guards are pure and the verification gate takes an injected verdict.
 */

const CONTRACT = { scope: ["src"], exclusions: [], checks: [] };

function withTempRepo<T>(fn: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), "amanar-mut-"));
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function score(id: string, pass: boolean, reason: string): Score {
  return { caseId: id, pass, reason };
}

export function runMutationSuite(): Score[] {
  const scores: Score[] = [];

  // Mutant A: a tampered test file must be detected.
  scores.push(
    withTempRepo((root) => {
      const testFile = join(root, "src", "thing.test.ts");
      writeFileSync(testFile, "assert(real() === 1);\n");
      const baseline = snapshotTests(root, CONTRACT);
      writeFileSync(testFile, "assert(true); // weakened\n");
      const offenders = detectTestTampering(root, CONTRACT, baseline);
      return score(
        "mutant-tampered-test",
        offenders.length > 0,
        offenders.length > 0 ? "blocked tampered test" : "FAILED to detect tampered test",
      );
    }),
  );

  // Mutant B: placeholder code in scope must be detected.
  scores.push(
    withTempRepo((root) => {
      writeFileSync(join(root, "src", "impl.ts"), "export function f() {\n  // TODO: implement\n}\n");
      const offenders = detectPlaceholders(root, CONTRACT);
      return score(
        "mutant-placeholder",
        offenders.length > 0,
        offenders.length > 0 ? "blocked placeholder" : "FAILED to detect placeholder",
      );
    }),
  );

  // Mutant C: an unmet world-state must block outward actions and completion.
  scores.push(
    withTempRepo((root) => {
      const deps = { hasContract: () => true, verified: () => false };
      const publishBlocked = gateOutwardAction("npm publish", root, deps).block;
      const stopBlocked = decideStop({}, root, deps).block;
      const pass = publishBlocked && stopBlocked;
      return score(
        "mutant-unmet-world-state",
        pass,
        pass ? "blocked publish and stop" : `publishBlocked=${publishBlocked} stopBlocked=${stopBlocked}`,
      );
    }),
  );

  // Control: a clean, verified world-state must NOT block (no false positives).
  scores.push(
    withTempRepo((root) => {
      const clean = detectPlaceholders(root, CONTRACT).length === 0;
      const deps = { hasContract: () => true, verified: () => true };
      const publishOk = !gateOutwardAction("npm publish", root, deps).block;
      const stopOk = !decideStop({}, root, deps).block;
      const pass = clean && publishOk && stopOk;
      return score(
        "control-clean-verified",
        pass,
        pass ? "clean state permitted" : `clean=${clean} publishOk=${publishOk} stopOk=${stopOk}`,
      );
    }),
  );

  return scores;
}
