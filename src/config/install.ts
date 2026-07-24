import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

/**
 * Config installer.
 *
 * Amanar is the versioned source of truth for agent config; nothing is applied
 * automatically. `install`/`sync` merge the public templates in `config/` into
 * live host config, preferring a private `overlay/<area>/<file>` (gitignored)
 * when present so secrets reach live config but are never committed.
 *
 * Explicit and safe: dry-run by default, writes only with `--apply`, and never
 * writes overlay/secret content back into the tracked tree. Host homes are
 * overridable by env for testing.
 */

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export type HostKey = "claude" | "codex" | "pi" | "shared";

interface Mapping {
  area: string;
  file: string;
  targets: Array<{ host: HostKey; rel: string }>;
}

const MAPPINGS: Mapping[] = [
  {
    area: "doctrine",
    file: "doctrine.md",
    targets: [
      { host: "claude", rel: "CLAUDE.md" },
      { host: "codex", rel: "AGENTS.md" },
      { host: "pi", rel: "AGENTS.md" },
    ],
  },
  { area: "claude", file: "settings.json", targets: [{ host: "claude", rel: "settings.json" }] },
  { area: "statusline", file: "ccstatusline.json", targets: [{ host: "claude", rel: "ccstatusline.json" }] },
  { area: "mcp", file: ".mcp.json", targets: [{ host: "claude", rel: ".mcp.json" }] },
  { area: "model-routing", file: "model-routing.json", targets: [{ host: "claude", rel: "model-routing.json" }] },
  { area: "pi", file: "config.json", targets: [{ host: "pi", rel: "config.json" }] },
  { area: "kb", file: "kb.yml", targets: [{ host: "shared", rel: "kb.yml" }] },
];

function hostHome(host: HostKey, env: NodeJS.ProcessEnv): string {
  switch (host) {
    case "claude":
      return env.CLAUDE_HOME || join(homedir(), ".claude");
    case "codex":
      return env.CODEX_HOME || join(homedir(), ".codex");
    case "pi":
      return env.AGENTS_HOME || join(homedir(), ".agents");
    case "shared":
      return env.AMANAR_CONFIG_HOME || join(homedir(), ".config", "amanar");
  }
}

export type ConfigOp = "write" | "unchanged" | "missing-template";

export interface ConfigAction {
  op: ConfigOp;
  host: HostKey;
  target: string;
  source: string;
  fromOverlay: boolean;
}

export interface PlanOpts {
  repoRoot?: string;
  overlayDir?: string;
  env?: NodeJS.ProcessEnv;
}

export function planConfigInstall(opts: PlanOpts = {}): ConfigAction[] {
  const repoRoot = opts.repoRoot ?? REPO;
  const overlayDir = opts.overlayDir ?? join(repoRoot, "overlay");
  const env = opts.env ?? process.env;

  const actions: ConfigAction[] = [];
  for (const m of MAPPINGS) {
    const overlaySrc = join(overlayDir, m.area, m.file);
    const templateSrc = join(repoRoot, "config", m.area, m.file);
    const fromOverlay = existsSync(overlaySrc);
    const source = fromOverlay ? overlaySrc : templateSrc;

    for (const t of m.targets) {
      const target = join(hostHome(t.host, env), t.rel);
      if (!existsSync(source)) {
        actions.push({ op: "missing-template", host: t.host, target, source, fromOverlay });
        continue;
      }
      const content = readFileSync(source, "utf8");
      const unchanged = existsSync(target) && readFileSync(target, "utf8") === content;
      actions.push({ op: unchanged ? "unchanged" : "write", host: t.host, target, source, fromOverlay });
    }
  }
  return actions;
}

/**
 * Back up an existing target before it is overwritten. Mirrors syncSkills:
 * copies the current file into `<dir>/backups/config-install-<stamp>/<name>` so
 * an install --apply can never silently clobber a user's live CLAUDE.md /
 * settings.json / AGENTS.md. Returns the backup path, or null when there was
 * nothing to back up. Copy (not rename) so the target is replaced in place.
 */
export function backupConfigTarget(target: string, stamp: string): string | null {
  if (!existsSync(target)) return null;
  const backupDir = join(dirname(target), "backups", `config-install-${stamp}`);
  mkdirSync(backupDir, { recursive: true });
  const dest = join(backupDir, basename(target));
  copyFileSync(target, dest);
  return dest;
}

export function stamp(now: Date = new Date()): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

/**
 * Apply the plan. Every existing target is backed up before it is overwritten
 * (see backupConfigTarget), so no live config is lost. `at` fixes the backup
 * stamp for deterministic testing.
 */
export function applyConfigInstall(actions: ConfigAction[], at: string = stamp()): string[] {
  const backups: string[] = [];
  for (const a of actions) {
    if (a.op !== "write") continue;
    const backed = backupConfigTarget(a.target, at);
    if (backed !== null) backups.push(backed);
    mkdirSync(dirname(a.target), { recursive: true });
    writeFileSync(a.target, readFileSync(a.source, "utf8"));
  }
  return backups;
}

export function describeConfigAction(a: ConfigAction): string {
  const src = a.fromOverlay ? "overlay" : "template";
  switch (a.op) {
    case "write":
      return `write     ${a.target}  (${src})`;
    case "unchanged":
      return `unchanged ${a.target}`;
    case "missing-template":
      return `MISSING   ${a.target}  (no source at ${a.source})`;
  }
}

export function runConfigInstall(argv: string[]): void {
  const apply = argv.includes("--apply");
  const actions = planConfigInstall();
  for (const a of actions) console.log(describeConfigAction(a));

  const missing = actions.some((a) => a.op === "missing-template");
  if (apply) {
    const backups = applyConfigInstall(actions);
    for (const b of backups) console.log(`backed up existing → ${b}`);
    console.log("applied");
  } else {
    console.log("dry run; re-run with --apply to write");
  }
  process.exit(missing ? 1 : 0);
}
