import { classifyToolCall } from "../../harness/pi/src/classify.ts";

/**
 * Claude Code PreToolUse backpressure adapter. Reads the PreToolUse JSON
 * payload from stdin, routes it through the shared classifier, and emits the
 * Claude Code hookSpecificOutput decision. Deny rules live in the classifier
 * (single source of truth), never here.
 *
 * (classify.ts moves to src/classify.ts in a later slice; this import updates
 * with it.)
 */

export interface ClaudePreToolUsePayload {
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export interface HookDecision {
  decision: "allow" | "deny";
  reason?: string;
}

export function evaluatePreToolUse(payload: ClaudePreToolUsePayload): HookDecision {
  const toolName = payload.tool_name.toLowerCase();
  const toolInput =
    typeof payload.tool_input === "object" && payload.tool_input !== null
      ? payload.tool_input
      : {};
  const result = classifyToolCall(toolName, toolInput);
  return result.allow ? { decision: "allow" } : { decision: "deny", reason: result.reason };
}

export function buildOutput(decision: HookDecision): string | null {
  if (decision.decision === "deny") {
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: decision.reason ?? "blocked by amanar backpressure",
      },
    });
  }
  return null;
}

export async function runPreToolUse(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) process.exit(0);

  let payload: ClaudePreToolUsePayload;
  try {
    payload = JSON.parse(raw) as ClaudePreToolUsePayload;
  } catch {
    process.exit(0); // malformed JSON — defer, never block
  }

  const output = buildOutput(evaluatePreToolUse(payload));
  if (output !== null) process.stdout.write(output);
  process.exit(0);
}
