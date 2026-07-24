import { activeWorkflowContext } from "../inject.ts";

/**
 * Claude Code PreCompact re-injection.
 *
 * Compaction drops the active checklist from context; this hook re-emits the
 * active workflow status so it survives. Soft context (additionalContext), not
 * a gate — the invariants are held by the pre-gate, completion gate, and runner.
 */

export interface PreCompactPayload {
  cwd?: string;
}

/** Serialize re-injection context to Claude Code JSON, or null when nothing to inject. */
export function buildPreCompactOutput(context: string | null): string | null {
  if (context === null) return null;
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreCompact",
      additionalContext: context,
    },
  });
}

export async function runPreCompact(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8").trim();

  let payload: PreCompactPayload = {};
  if (raw) {
    try {
      payload = JSON.parse(raw) as PreCompactPayload;
    } catch {
      process.exit(0);
    }
  }

  const root = payload.cwd ?? process.cwd();
  const output = buildPreCompactOutput(activeWorkflowContext(root));
  if (output !== null) process.stdout.write(output);
  process.exit(0);
}
