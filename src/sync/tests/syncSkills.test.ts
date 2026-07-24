import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  lstatSync,
  readlinkSync,
  readdirSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverSources, plan, apply } from "../syncSkills.ts";

const STAMP = "20260724T000000Z";
const HOST_DEFAULTS: Record<string, [string, string]> = {
  pi: ["AGENTS_HOME", ".agents"],
  codex: ["CODEX_HOME", ".codex"],
  claude: ["CLAUDE_HOME", ".claude"],
};

let base: string;
let homes: Record<string, string>;
let saved: Record<string, string | undefined>;
let sources: Record<string, string>;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "sync-"));
  homes = {};
  saved = {};
  for (const [host, [envVar, def]] of Object.entries(HOST_DEFAULTS)) {
    const home = join(base, def);
    mkdirSync(home, { recursive: true });
    homes[host] = home;
    saved[envVar] = process.env[envVar];
    process.env[envVar] = home;
  }
  sources = discoverSources();
});

afterEach(() => {
  for (const [envVar, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[envVar];
    else process.env[envVar] = value;
  }
  rmSync(base, { recursive: true, force: true });
});

test("discovers the amanar skills", () => {
  assert.ok("amanar-deliver" in sources);
  assert.ok("amanar-onboard" in sources);
  assert.ok(Object.keys(sources).every((name) => name.startsWith("amanar-")));
});

test("dry run makes no changes", () => {
  const actions = plan(sources, ["pi"], true, false);
  assert.ok(actions.some((a) => a.op === "link"));
  const skills = join(homes.pi, "skills");
  assert.ok(!existsSync(skills) || readdirSync(skills).length === 0);
});

test("apply links all skills into each host", () => {
  const actions = plan(sources, ["pi", "codex", "claude"], true, false);
  apply(actions, STAMP);
  for (const host of ["pi", "codex", "claude"]) {
    const skills = join(homes[host], "skills");
    for (const [name, source] of Object.entries(sources)) {
      const link = join(skills, name);
      assert.ok(lstatSync(link).isSymbolicLink(), `${host}:${name}`);
      assert.equal(readlinkSync(link), source);
    }
  }
});

test("supersede backs up overlapping personal skill", () => {
  const old = join(homes.pi, "skills", "codebase-design");
  mkdirSync(old, { recursive: true });
  writeFileSync(join(old, "SKILL.md"), "legacy\n");
  const actions = plan(sources, ["pi"], true, false);
  assert.ok(actions.some((a) => a.op === "supersede" && a.path === old));
  apply(actions, STAMP);
  assert.ok(!existsSync(old));
  const backup = join(homes.pi, "skills", "backups", `sync-skills-${STAMP}`, "codebase-design");
  assert.ok(existsSync(backup));
  assert.ok(lstatSync(join(homes.pi, "skills", "amanar-plan")).isSymbolicLink());
});

test("no supersede leaves personal skill", () => {
  const old = join(homes.pi, "skills", "codebase-design");
  mkdirSync(old, { recursive: true });
  const actions = plan(sources, ["pi"], false, false);
  assert.ok(!actions.some((a) => a.op === "supersede"));
});

test("remove unlinks only our symlinks", () => {
  apply(plan(sources, ["pi"], true, false), STAMP);
  apply(plan(sources, ["pi"], true, true), STAMP);
  const skills = join(homes.pi, "skills");
  const remaining = readdirSync(skills).filter(
    (n) => n.startsWith("amanar-") && lstatSync(join(skills, n)).isSymbolicLink(),
  );
  assert.equal(remaining.length, 0);
});

test("refuses symlinked skills dir", () => {
  symlinkSync(homes.codex, join(homes.codex, "skills"));
  const actions = plan(sources, ["codex"], true, false);
  assert.ok(actions.some((a) => a.op === "refuse"));
});

test("missing host home is skipped", () => {
  process.env.CLAUDE_HOME = join(base, "absent");
  const actions = plan(sources, ["claude"], true, false);
  assert.ok(actions.some((a) => a.op === "skip-host"));
});
