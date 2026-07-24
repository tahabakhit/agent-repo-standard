import { sessionCatalog, onboardingNudge } from "../inject.ts";
import { detectHarness, detectVersion, nativeToolsHint } from "../nativeTools.ts";

/**
 * Claude Code SessionStart injection.
 *
 * At session start, inject the skill catalog so the agent knows what is loaded,
 * and — when the repo has no `.amanar/` control directory — a pointer toward
 * onboarding. Soft context (additionalContext): discovery and orientation, not
 * a gate.
 */

export interface SessionStartPayload {
  cwd?: string;
  source?: string;
}

/** Build the session-start context, or null when there is nothing to say. */
export function buildSessionContext(root: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const parts = [sessionCatalog()];
  const nudge = onboardingNudge(root);
  if (nudge !== null) parts.push(nudge);
  const hint = nativeToolsHint(detectHarness(env), detectVersion(env));
  if (hint !== null) parts.push(hint);
  return parts.join("\n\n");
}

export function buildSessionStartOutput(context: string | null): string | null {
  if (context === null) return null;
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: context,
    },
  });
}

export async function runSessionStart(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8").trim();

  let payload: SessionStartPayload = {};
  if (raw) {
    try {
      payload = JSON.parse(raw) as SessionStartPayload;
    } catch {
      process.exit(0);
    }
  }

  const root = payload.cwd ?? process.cwd();
  const output = buildSessionStartOutput(buildSessionContext(root));
  if (output !== null) process.stdout.write(output);
  process.exit(0);
}
