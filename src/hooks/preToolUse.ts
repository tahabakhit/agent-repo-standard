import { classifyToolCall } from "../classify.ts";
import { gateOutwardAction } from "./verificationGate.ts";

/**
 * Claude Code PreToolUse gate. Reads the PreToolUse JSON payload from stdin and
 * emits the hookSpecificOutput decision. Two hard layers, both deny (never
 * advisory context):
 *   1. backpressure floor — the shared classifier denies dangerous/irreversible
 *      ops (deny rules are single-source in classify.ts, never here);
 *   2. verification gate — when a governed workflow contract exists, outward
 *      publish-class actions are denied unless the kernel reports verified.
 * Push stays floor-denied regardless (manual review by design); the gate's new
 * teeth are on publish-class commands the floor allows.
 */

export interface ClaudePreToolUsePayload {
  tool_name: string;
  tool_input: Record<string, unknown>;
  cwd?: string;
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

  // 1. Backpressure floor.
  const floor = evaluatePreToolUse(payload);
  if (floor.decision === "deny") {
    const output = buildOutput(floor);
    if (output !== null) process.stdout.write(output);
    process.exit(0);
  }

  // 2. Verification gate on outward publish-class actions the floor allowed.
  const command =
    typeof payload.tool_input?.["command"] === "string"
      ? (payload.tool_input["command"] as string)
      : "";
  const root = payload.cwd ?? process.cwd();
  const gate = gateOutwardAction(command, root);
  if (gate.block) {
    process.stdout.write(buildOutput({ decision: "deny", reason: gate.reason }) as string);
  }
  process.exit(0);
}
