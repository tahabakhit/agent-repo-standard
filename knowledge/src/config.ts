/**
 * Config resolution: resolveStore + store config helpers.
 * Exact port of kb.py config precedence chain.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { die } from "./util.ts";

const STORE_CONFIG_NAME = ".kb";
const STORE_CONFIG_FILE = "config.yml";

function readSimpleYamlFile(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    const text = fs.readFileSync(filePath, "utf-8");
    for (const line of text.split("\n")) {
      const m = line.trim().match(/^([\w-]+):\s*(.*)/);
      if (m) {
        const raw = m[2].trim();
        result[m[1]] = unquote(raw);
      }
    }
  } catch {
    // missing file → empty dict
  }
  return result;
}

function unquote(s: string): string {
  s = s.trim();
  if (
    s.length >= 2 &&
    ((s[0] === '"' && s[s.length - 1] === '"') ||
      (s[0] === "'" && s[s.length - 1] === "'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

export interface ResolveOptions {
  interactive?: boolean;
  env?: Record<string, string | undefined>;
  cwd?: string;
  home?: string;
}

export function resolveStore(
  flagStore: string | null | undefined,
  opts: ResolveOptions = {},
): string {
  const interactive = opts.interactive ?? true;
  const env = opts.env ?? (process.env as Record<string, string | undefined>);
  const cwd = opts.cwd ?? process.cwd();
  const home = opts.home ?? os.homedir();

  // 1. --store flag
  if (flagStore) {
    return path.resolve(flagStore.replace(/^~/, home));
  }

  // 2. AMANAR_KB_DIR env
  const envVal = env["AMANAR_KB_DIR"] ?? "";
  if (envVal) {
    return path.resolve(envVal.replace(/^~/, home));
  }

  // 3. ./.knowledge directory in cwd
  const cwdStore = path.join(cwd, ".knowledge");
  if (fs.existsSync(cwdStore) && fs.statSync(cwdStore).isDirectory()) {
    return path.resolve(cwdStore);
  }

  // 4. ./.kb/config.yml project pointer
  const projectCfg = path.join(cwd, ".kb", STORE_CONFIG_FILE);
  if (fs.existsSync(projectCfg)) {
    const cfg = readSimpleYamlFile(projectCfg);
    if (cfg["store"]) {
      return path.resolve(cfg["store"].replace(/^~/, home));
    }
  }

  // 5. XDG / user config
  const xdgConfig = env["XDG_CONFIG_HOME"] ?? "";
  let userCfg: string;
  if (xdgConfig) {
    userCfg = path.join(xdgConfig, "amanar", "kb.yml");
  } else {
    userCfg = path.join(home, ".config", "amanar", "kb.yml");
  }
  if (fs.existsSync(userCfg)) {
    const cfg = readSimpleYamlFile(userCfg);
    if (cfg["store"]) {
      return path.resolve(cfg["store"].replace(/^~/, home));
    }
  }

  // 6. Ask or error
  if (!interactive) {
    die(
      "no store configured; set --store, AMANAR_KB_DIR, " +
        "or create ~/.config/amanar/kb.yml with store: <path>",
    );
  }
  process.stderr.write("kb: no store configured.\n");
  // Synchronous readline
  const raw = readLineSync("Enter knowledge store path: ").trim();
  if (!raw) {
    die("no store path provided");
  }
  return path.resolve(raw.replace(/^~/, home));
}

function readLineSync(prompt: string): string {
  process.stdout.write(prompt);
  const buf = Buffer.alloc(256);
  const fd = fs.openSync("/dev/tty", "r");
  let result = "";
  let bytesRead = 0;
  while (true) {
    bytesRead = fs.readSync(fd, buf, 0, 1, null);
    if (bytesRead === 0) break;
    const ch = buf.toString("utf-8", 0, 1);
    if (ch === "\n") break;
    result += ch;
  }
  fs.closeSync(fd);
  return result;
}

export function readStoreConfig(store: string): Record<string, string> {
  const cfgPath = path.join(store, STORE_CONFIG_NAME, STORE_CONFIG_FILE);
  const defaults: Record<string, string> = {
    commit_policy: "auto",
    ttl_policy: "90d",
  };
  if (fs.existsSync(cfgPath)) {
    const loaded = readSimpleYamlFile(cfgPath);
    Object.assign(defaults, loaded);
  }
  return defaults;
}

export function ensureStore(store: string): void {
  fs.mkdirSync(store, { recursive: true });
  const cfgDir = path.join(store, STORE_CONFIG_NAME);
  fs.mkdirSync(cfgDir, { recursive: true });
  const cfgFile = path.join(cfgDir, STORE_CONFIG_FILE);
  if (!fs.existsSync(cfgFile)) {
    fs.writeFileSync(cfgFile, "commit_policy: auto\nttl_policy: 90d\n", "utf-8");
  }
  const manifest = path.join(store, "manifest.json");
  if (!fs.existsSync(manifest)) {
    fs.writeFileSync(
      manifest,
      JSON.stringify({ entries: [] }, null, 2) + "\n",
      "utf-8",
    );
  }
  const logPath = path.join(store, "log.md");
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, "# Knowledge store log\n\n", "utf-8");
  }
}
