import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildTurnInjection } from "../inject.ts";

/**
 * Claude Code UserPromptSubmit re-injection.
 *
 * Re-injects the active checklist and the always-on essence directive every
 * turn, resisting drift as context grows. Soft context (additionalContext), not
 * a gate. Honours the essence on/off toggle, persisted per session so the state
 * survives across stateless hook invocations.
 */

export interface UserPromptSubmitPayload {
  session_id?: string;
  prompt?: string;
  cwd?: string;
}

/** Detect an essence on/off toggle in the prompt, or null when none. */
export function essenceToggleFromPrompt(prompt: string): "on" | "off" | null {
  const p = prompt.toLowerCase();
  if (/\b(stop essence|normal mode)\b/.test(p)) return "off";
  if (/\b(essence mode|resume essence|start essence)\b/.test(p)) return "on";
  return null;
}

function toggleMarkerPath(sessionId: string | undefined): string {
  const dir = join(tmpdir(), "amanar-essence");
  const id = (sessionId ?? "default").replace(/[^A-Za-z0-9_-]/g, "_");
  return join(dir, `${id}.off`);
}

/** Resolve whether essence is on for this session, applying any toggle in the prompt. */
export function resolveEssenceState(
  sessionId: string | undefined,
  prompt: string,
  deps: {
    isOff?: (marker: string) => boolean;
    setOff?: (marker: string, off: boolean) => void;
  } = {},
): boolean {
  const marker = toggleMarkerPath(sessionId);
  const isOff = deps.isOff ?? ((m) => existsSync(m));
  const setOff =
    deps.setOff ??
    ((m, off) => {
      if (off) {
        mkdirSync(join(m, ".."), { recursive: true });
        writeFileSync(m, "");
      } else if (existsSync(m)) {
        rmSync(m);
      }
    });

  const toggle = essenceToggleFromPrompt(prompt);
  if (toggle === "off") {
    setOff(marker, true);
    return false;
  }
  if (toggle === "on") {
    setOff(marker, false);
    return true;
  }
  return !isOff(marker);
}

export function buildUserPromptOutput(context: string | null): string | null {
  if (context === null) return null;
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: context,
    },
  });
}

export async function runUserPromptSubmit(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8").trim();

  let payload: UserPromptSubmitPayload = {};
  if (raw) {
    try {
      payload = JSON.parse(raw) as UserPromptSubmitPayload;
    } catch {
      process.exit(0);
    }
  }

  const root = payload.cwd ?? process.cwd();
  const essenceOn = resolveEssenceState(payload.session_id, payload.prompt ?? "");
  const output = buildUserPromptOutput(buildTurnInjection(root, { essenceOn }));
  if (output !== null) process.stdout.write(output);
  process.exit(0);
}
