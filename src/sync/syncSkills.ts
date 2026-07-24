import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  renameSync,
  statSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

/**
 * Link Amanar's portable skills into each coding-agent host's skill directory.
 * Amanar owns the skills; this symlinks each `amanar-*` skill into Pi
 * (`~/.agents/skills`), Codex (`~/.codex/skills`), and Claude
 * (`~/.claude/skills`), superseding overlapping pre-amanar personal entries
 * (backed up, never deleted outright).
 *
 * Opt-in developer tool: dry-run by default, `--apply` to act, `--remove` to
 * unlink. Writes only under each host's skill directory. Host homes are
 * overridable by env (AGENTS_HOME / CODEX_HOME / CLAUDE_HOME) for testing.
 * Ported from harness/sync-skills/sync_skills.py (Python).
 */

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKILL_ROOTS = [join(REPO, "skills")];
const HOSTS: Record<string, [string, string]> = {
  pi: ["AGENTS_HOME", ".agents"],
  codex: ["CODEX_HOME", ".codex"],
  claude: ["CLAUDE_HOME", ".claude"],
};
// Pre-amanar personal skills superseded by an amanar-* skill.
const SUPERSEDE: Record<string, string> = {
  scaffold: "amanar-onboard",
  "codebase-design": "amanar-plan",
};
const PROTECTED = new Set([".system"]);

export type SyncOp = "skip-host" | "refuse" | "unlink" | "ok" | "link" | "supersede";
export interface SyncAction {
  op: SyncOp;
  host: string;
  path: string;
  source?: string;
  reason?: string;
  backup?: boolean;
}

export function discoverSources(): Record<string, string> {
  const sources: Record<string, string> = {};
  for (const base of SKILL_ROOTS) {
    if (!isDir(base)) continue;
    for (const name of readdirSync(base).sort()) {
      const entry = join(base, name);
      if (isDir(entry) && existsSync(join(entry, "SKILL.md"))) sources[name] = entry;
    }
  }
  return sources;
}

function skillsDir(host: string): string {
  const [envVar, def] = HOSTS[host];
  const home = process.env[envVar] || join(homedir(), def);
  return join(home, "skills");
}

function isOurs(path: string, source: string): boolean {
  try {
    if (!lstatSync(path).isSymbolicLink()) return false;
    return readlinkSync(path) === source;
  } catch {
    return false;
  }
}

export function plan(
  sources: Record<string, string>,
  hosts: string[],
  supersede: boolean,
  remove: boolean,
): SyncAction[] {
  const actions: SyncAction[] = [];
  for (const host of hosts) {
    const skills = skillsDir(host);
    if (!isDir(dirname(skills))) {
      actions.push({ op: "skip-host", host, path: dirname(skills), reason: "host not installed" });
      continue;
    }
    if (isSymlink(skills)) {
      actions.push({ op: "refuse", host, path: skills, reason: "skills dir is a symlink" });
      continue;
    }
    for (const [name, source] of Object.entries(sources)) {
      const target = join(skills, name);
      if (remove) {
        if (isOurs(target, source)) actions.push({ op: "unlink", host, path: target });
        continue;
      }
      if (isOurs(target, source)) {
        actions.push({ op: "ok", host, path: target });
      } else {
        actions.push({
          op: "link",
          host,
          path: target,
          source,
          backup: existsSync(target) || isSymlink(target),
        });
      }
    }
    if (remove || !supersede) continue;
    for (const [oldName, newName] of Object.entries(SUPERSEDE)) {
      if (!(newName in sources) || PROTECTED.has(oldName)) continue;
      const oldPath = join(skills, oldName);
      if (existsSync(oldPath) && !isOurs(oldPath, sources[newName])) {
        actions.push({ op: "supersede", host, path: oldPath });
      }
    }
  }
  return actions;
}

export function apply(actions: SyncAction[], stamp: string): void {
  for (const action of actions) {
    const path = action.path;
    if (action.op === "link") {
      if (action.backup) backup(path, stamp);
      mkdirSync(dirname(path), { recursive: true });
      symlinkSync(action.source as string, path);
    } else if (action.op === "supersede") {
      backup(path, stamp);
    } else if (action.op === "unlink") {
      rmSync(path);
    }
  }
}

function backup(path: string, stamp: string): void {
  const backupDir = join(dirname(path), "backups", `sync-skills-${stamp}`);
  mkdirSync(backupDir, { recursive: true });
  renameSync(path, join(backupDir, basename(path)));
}

function describe(action: SyncAction): string {
  switch (action.op) {
    case "link":
      return (
        `link    ${action.path} -> ${action.source}` +
        (action.backup ? "  (backing up existing)" : "")
      );
    case "supersede":
      return `supersede ${action.path} (superseded by amanar-*)`;
    case "unlink":
      return `unlink  ${action.path}`;
    case "ok":
      return `ok      ${action.path}`;
    default:
      return `${action.op.padEnd(9)}${action.path}  ${action.reason ?? ""}`;
  }
}

export function runSyncSkills(argv: string[]): void {
  let hosts = "pi,codex,claude";
  let doApply = false;
  let remove = false;
  let noSupersede = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--hosts") hosts = argv[++i] ?? hosts;
    else if (arg === "--apply") doApply = true;
    else if (arg === "--remove") remove = true;
    else if (arg === "--no-supersede") noSupersede = true;
  }

  const actions = plan(discoverSources(), hosts.split(","), !noSupersede, remove);
  for (const action of actions) console.log(describe(action));
  const refused = actions.some((a) => a.op === "refuse");
  if (doApply) {
    apply(actions, stamp());
    console.log("applied");
  } else {
    console.log("dry run; re-run with --apply to act");
  }
  process.exit(refused ? 1 : 0);
}

function stamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}
