/**
 * Tool-call classification for backpressure.
 *
 * Pure, exported functions — no Pi API imports. Mirrors dev-loops'
 * _bash-command-classify.mjs style: classify a command string into allow or
 * deny, with a structured reason.
 *
 * Deny-unless-evidence policy: block operations that are irreversible and
 * high-risk by default. The caller (extension.ts) decides whether session
 * evidence overrides the denial.
 */

export interface ClassifyResult {
  /** true = let the tool run; false = block it */
  allow: boolean;
  /** Human-readable explanation returned to the agent on block */
  reason: string;
  /** The matched pattern label, or undefined when the tool is allowed freely */
  matchedRule?: string;
}

/**
 * A deny rule: a label, a test function, and a message.
 */
interface DenyRule {
  label: string;
  test: (command: string) => boolean;
  message: string;
}

/**
 * Ordered list of deny rules applied to bash commands.
 * First match wins — keep the most specific rules first.
 */
const BASH_DENY_RULES: DenyRule[] = [
  {
    label: "git-force-push",
    test: (cmd) => /git\s+push\b.*--force/.test(cmd) || /git\s+push\b.*-f\b/.test(cmd),
    message:
      "Force-push blocked by amanar backpressure. Review the change set, get explicit approval, then run manually.",
  },
  {
    label: "git-push",
    test: (cmd) => /\bgit\s+push\b/.test(cmd),
    message:
      "git push blocked by amanar backpressure. Confirm the branch and remote are correct before pushing manually.",
  },
  {
    label: "rm-rf",
    test: (cmd) => /\brm\s+.*-[a-zA-Z]*r[a-zA-Z]*f\b/.test(cmd) || /\brm\s+.*-[a-zA-Z]*f[a-zA-Z]*r\b/.test(cmd),
    message:
      "Recursive force-remove blocked by amanar backpressure. Verify the target path is correct before running manually.",
  },
  {
    label: "git-reset-hard",
    test: (cmd) => /\bgit\s+reset\b.*--hard/.test(cmd),
    message:
      "git reset --hard blocked by amanar backpressure. Stash or commit outstanding work first.",
  },
  {
    label: "git-clean-force",
    test: (cmd) => /\bgit\s+clean\b.*-f/.test(cmd),
    message:
      "git clean -f blocked by amanar backpressure. Review untracked files before running manually.",
  },
  {
    label: "chmod-world-writable",
    test: (cmd) => /\bchmod\b.*\b[0-7]*[2367][0-7]{0,2}\b/.test(cmd) && /\bchmod\b.*(777|666|722|022)/.test(cmd),
    message:
      "World-writable chmod blocked by amanar backpressure. Verify the intended permissions.",
  },
  {
    label: "curl-pipe-sh",
    test: (cmd) => /\bcurl\b.*\|\s*(ba)?sh/.test(cmd) || /\bwget\b.*\|\s*(ba)?sh/.test(cmd),
    message:
      "Curl/wget-pipe-to-shell blocked by amanar backpressure. Inspect the downloaded script before running.",
  },
];

/**
 * Classify a bash command.
 *
 * Returns { allow: false } for commands matching any deny rule.
 * Returns { allow: true } otherwise.
 */
export function classifyBashCommand(command: string): ClassifyResult {
  const trimmed = command.trim();
  for (const rule of BASH_DENY_RULES) {
    if (rule.test(trimmed)) {
      return {
        allow: false,
        reason: rule.message,
        matchedRule: rule.label,
      };
    }
  }
  return { allow: true, reason: "no deny rule matched" };
}

/**
 * Classify a Pi tool_call event payload.
 *
 * Handles bash and falls through for all other tools.
 */
export function classifyToolCall(
  toolName: string,
  input: Record<string, unknown>,
): ClassifyResult {
  if (toolName === "bash") {
    const command = typeof input["command"] === "string" ? input["command"] : "";
    return classifyBashCommand(command);
  }
  // Non-bash tools: allow by default (extend later as needed)
  return { allow: true, reason: `tool '${toolName}' not subject to backpressure` };
}
