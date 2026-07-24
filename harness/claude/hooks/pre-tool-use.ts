/**
 * Claude Code PreToolUse hook for amanar backpressure.
 *
 * Reads the PreToolUse JSON payload from stdin, adapts the tool_name and
 * tool_input to the shared Pi classifier, and emits the appropriate Claude
 * Code hookSpecificOutput decision.
 *
 * Deny rules are NOT duplicated here — they live in harness/pi/src/classify.ts
 * as the single source of truth.
 *
 * Claude Code tool names are PascalCase ("Bash") while the Pi classifier
 * expects lowercase ("bash"). This file normalises before calling.
 *
 * Exit codes:
 *   0  — success (JSON output if deny, no output if allow/defer)
 *   1  — unexpected internal error (stderr; tool call proceeds)
 */

import { fileURLToPath } from "node:url";
import { classifyToolCall } from "../../pi/src/classify.ts";

// ── Types ──────────────────────────────────────────────────────────────────

/** Shape of the PreToolUse JSON delivered on stdin by Claude Code. */
export interface ClaudePreToolUsePayload {
  session_id?: string;
  prompt_id?: string;
  transcript_path?: string;
  cwd?: string;
  permission_mode?: string;
  hook_event_name?: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
}

/** Backpressure decision produced by this adapter. */
export interface HookDecision {
  decision: "allow" | "deny";
  /** Set only when decision === 'deny'. */
  reason?: string;
}

// ── Pure functions (exported for testing) ──────────────────────────────────

/**
 * Adapt a Claude Code PreToolUse payload to the shared classifier and return
 * the backpressure decision.
 *
 * Normalises tool_name to lowercase so it matches the Pi classifier contract
 * (e.g. "Bash" → "bash").
 */
export function evaluatePreToolUse(
  payload: ClaudePreToolUsePayload,
): HookDecision {
  const toolName = payload.tool_name.toLowerCase();
  const toolInput =
    typeof payload.tool_input === "object" && payload.tool_input !== null
      ? payload.tool_input
      : {};

  const result = classifyToolCall(toolName, toolInput);

  if (!result.allow) {
    return { decision: "deny", reason: result.reason };
  }
  return { decision: "allow" };
}

/**
 * Serialise a HookDecision to the Claude Code hookSpecificOutput JSON string.
 *
 * Returns null when the decision is allow — no output means Claude Code
 * defers to its normal permission flow.
 */
export function buildOutput(decision: HookDecision): string | null {
  if (decision.decision === "deny") {
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          decision.reason ?? "blocked by amanar backpressure",
      },
    });
  }
  return null;
}

// ── Entry point ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();

  if (!raw) {
    process.exit(0);
  }

  let payload: ClaudePreToolUsePayload;
  try {
    payload = JSON.parse(raw) as ClaudePreToolUsePayload;
  } catch {
    // Malformed JSON — defer (do not block the tool call)
    process.exit(0);
  }

  const decision = evaluatePreToolUse(payload);
  const output = buildOutput(decision);

  if (output !== null) {
    process.stdout.write(output);
  }

  process.exit(0);
}

// Run only when this file is the direct entry point, not when imported by tests.
const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  main().catch((err: unknown) => {
    process.stderr.write(String(err) + "\n");
    process.exit(1);
  });
}
