import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Pure runner for the vendored workflow controller.
 *
 * The Pi native controller tools (pi/controllerTools.ts) are thin wrappers over
 * this: it spawns the repo's vendored `.amanar/kernel/amanar-workflow.ts` for a
 * verb and returns the raw result. Kept free of any Pi/typebox runtime import so
 * it is unit-testable without a live Pi (the registration layer that needs those
 * lives in pi/, imported only by the extension).
 */

export interface VerbResult {
  /** False when the repo has no vendored kernel (ungoverned). */
  available: boolean;
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface SpawnResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export type KernelSpawn = (root: string, cli: string, args: string[]) => SpawnResult;

function defaultSpawn(root: string, cli: string, args: string[]): SpawnResult {
  const res = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8" });
  return {
    status: res.status,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
}

/** Path to the vendored kernel CLI for a repo, whether or not it exists. */
export function kernelCliPath(root: string): string {
  return join(root, ".amanar", "kernel", "amanar-workflow.ts");
}

/**
 * Run a controller verb (e.g. ["status","--json"], ["run-check", id]) against
 * the repo's vendored kernel. Returns available:false when the kernel is absent
 * rather than throwing, so the tool can nudge toward onboarding.
 */
export function runKernelVerb(
  root: string,
  args: string[],
  spawn: KernelSpawn = defaultSpawn,
): VerbResult {
  const cli = kernelCliPath(root);
  if (!existsSync(cli)) {
    return {
      available: false,
      ok: false,
      exitCode: null,
      stdout: "",
      stderr:
        "amanar: no .amanar/kernel in this repo — run $amanar-onboard to set up the workflow controller.",
    };
  }
  const res = spawn(root, cli, args);
  return {
    available: true,
    ok: res.status === 0,
    exitCode: res.status,
    stdout: res.stdout,
    stderr: res.stderr,
  };
}

/** Structural tool-result payload (matches Pi's AgentToolResult without importing it). */
export interface VerbToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
}

/** Format a verb result as a Pi tool result: stdout+stderr text, isError on failure. */
export function formatVerbResult(result: VerbResult): VerbToolResult {
  if (!result.available) {
    return { content: [{ type: "text", text: result.stderr }], isError: true };
  }
  const text = [result.stdout, result.stderr].filter((s) => s.trim() !== "").join("\n").trim();
  return {
    content: [{ type: "text", text: text === "" ? "(no output)" : text }],
    isError: !result.ok,
  };
}
