import type { Harness } from "./capabilities.ts";
import { asHarness } from "./capabilities.ts";

/**
 * Native-tool adaptation (hybrid: static manifest + runtime signals).
 *
 * Harnesses gain and lose native capabilities weekly, and give plugin code no
 * reliable tool manifest, so adaptation is a static per-(harness, version)
 * manifest gated by a runtime-detected version. Prefer a native mechanism when
 * available; otherwise degrade down a ladder to the portable floor (a skill or
 * MCP), which every harness has. Version-gating is hard: a capability whose
 * min-version cannot be confirmed is treated as absent.
 */

export type NativeMechanism =
  | "plan-mode"
  | "workflows"
  | "subagents"
  | "deep-research"
  | "codex-plan"
  | "codex-subagents"
  | "pi-ctx"
  | "pi-register-tool"
  | "mcp";

export interface NativeCapability {
  mechanism: NativeMechanism;
  /** Minimum harness version (semver-ish); undefined = always available. */
  minVersion?: string;
  summary: string;
}

/** Static per-harness capability manifest, source-verified 2026-07. */
export const MANIFEST: Record<Harness, NativeCapability[]> = {
  claude: [
    { mechanism: "plan-mode", summary: "plan mode — plan before acting, gated approval" },
    { mechanism: "subagents", summary: "Task-tool subagents for isolated sub-work" },
    { mechanism: "workflows", minVersion: "2.0.0", summary: "ultracode multi-agent workflows" },
    { mechanism: "deep-research", summary: "/deep-research for multi-source research" },
    { mechanism: "mcp", summary: "MCP servers" },
  ],
  codex: [
    { mechanism: "codex-plan", summary: "/plan mode" },
    { mechanism: "codex-subagents", minVersion: "2.0.0", summary: "subagents V2" },
    { mechanism: "mcp", summary: "MCP via `codex mcp list`" },
  ],
  pi: [
    { mechanism: "pi-ctx", summary: "in-process ctx introspection (true runtime signal)" },
    { mechanism: "pi-register-tool", summary: "registerTool to fill capability gaps" },
    { mechanism: "mcp", summary: "MCP servers" },
  ],
};

/** Compare semver-ish strings. Returns -1/0/1. Missing parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * Native capabilities available for a harness at a given version. Version-gated
 * hard: when `version` is undefined, capabilities that declare a minVersion are
 * excluded (cannot confirm).
 */
export function availableNativeTools(harness: Harness, version?: string): NativeCapability[] {
  return MANIFEST[harness].filter((c) => {
    if (c.minVersion === undefined) return true;
    if (version === undefined) return false;
    return compareVersions(version, c.minVersion) >= 0;
  });
}

export type Intent = "plan" | "decompose" | "parallelize" | "research" | "extend-tools";

/** Preference ladder per intent: try each mechanism in order, top-down. */
const LADDER: Record<Intent, NativeMechanism[]> = {
  plan: ["plan-mode", "codex-plan"],
  decompose: ["subagents", "codex-subagents", "workflows"],
  parallelize: ["workflows", "subagents", "codex-subagents"],
  research: ["deep-research", "mcp"],
  "extend-tools": ["pi-register-tool", "mcp"],
};

/** The portable floor per intent when no native mechanism is available. */
const FLOOR: Record<Intent, string> = {
  plan: "$amanar-plan skill",
  decompose: "$amanar-deliver + the bounded-loop runner",
  parallelize: "the bounded-loop runner",
  research: "web/MCP search via the amanar-discover skill",
  "extend-tools": "bash + MCP",
};

export interface NativePlan {
  intent: Intent;
  /** The chosen native mechanism, or null when none is available. */
  chosen: NativeMechanism | null;
  /** The portable-floor fallback, always present. */
  floor: string;
  /** The full ladder considered, for transparency. */
  ladder: NativeMechanism[];
}

/**
 * Resolve the best native mechanism for an intent on a harness/version,
 * degrading to the portable floor when none is available.
 */
export function planNative(intent: Intent, harness: Harness, version?: string): NativePlan {
  const available = new Set(availableNativeTools(harness, version).map((c) => c.mechanism));
  const ladder = LADDER[intent];
  const chosen = ladder.find((m) => available.has(m)) ?? null;
  return { intent, chosen, floor: FLOOR[intent], ladder };
}

/** Detect the harness from the environment (best-effort). */
export function detectHarness(env: NodeJS.ProcessEnv = process.env): Harness | null {
  const explicit = asHarness(env.AMANAR_HARNESS);
  if (explicit) return explicit;
  if (env.CLAUDE_PLUGIN_ROOT || env.CLAUDECODE || env.CLAUDE_CODE_ENTRYPOINT) return "claude";
  if (env.CODEX_HOME || env.CODEX_SANDBOX) return "codex";
  if (env.PI_HOME || env.AGENTS_HOME) return "pi";
  return null;
}

/** Detect the harness version from the environment (best-effort; may be undefined). */
export function detectVersion(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.AMANAR_HARNESS_VERSION || env.CLAUDE_CODE_VERSION || env.CODEX_VERSION || env.PI_VERSION || undefined;
}

/**
 * A model as reported by Pi's in-process runtime (ctx.model /
 * ctx.modelRegistry.getAvailable()). Pi is the only harness that exposes a true
 * runtime model signal to plugin code; Claude/Codex fall back to the static
 * manifest + env guess above.
 */
export interface RuntimeModel {
  id: string;
  name?: string;
  provider?: string;
}

/**
 * Format Pi's runtime model introspection as an advisory hint: the active model
 * plus the count of authenticated/available models. Null when nothing is known.
 * (Replaces the handoff's stale `getModels` API — 0.82.0 exposes
 * ctx.model + ctx.modelRegistry.getAvailable().)
 */
export function piRuntimeModelHint(
  current: RuntimeModel | null | undefined,
  available: RuntimeModel[] = [],
): string | null {
  const label = (m: RuntimeModel): string =>
    m.provider ? `${m.provider}/${m.id}` : m.id;
  const lines: string[] = [];
  if (current) lines.push(`[amanar:model] Active model: ${label(current)}.`);
  if (available.length > 0) {
    const sample = available.slice(0, 6).map(label).join(", ");
    const more = available.length > 6 ? `, +${available.length - 6} more` : "";
    lines.push(`Available (authenticated): ${available.length} — ${sample}${more}.`);
  }
  return lines.length ? lines.join("\n") : null;
}

/**
 * An advisory hint listing the native mechanisms available on this harness and
 * the "prefer native, then degrade" guidance. Null when the harness is unknown.
 */
export function nativeToolsHint(harness: Harness | null, version?: string): string | null {
  if (harness === null) return null;
  const caps = availableNativeTools(harness, version);
  const lines = [
    `[amanar:native] ${harness}${version ? ` v${version}` : ""} native tools — prefer these, then degrade to the portable floor (skills + MCP):`,
    ...caps.map((c) => `- ${c.mechanism}: ${c.summary}`),
  ];
  return lines.join("\n");
}
