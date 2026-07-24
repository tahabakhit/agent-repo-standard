/**
 * Shared utilities: die, warn, nowIso.
 */

export function die(msg: string, code = 1): never {
  process.stderr.write(`kb: error: ${msg}\n`);
  process.exit(code);
}

export function warn(msg: string): void {
  process.stderr.write(`kb: warning: ${msg}\n`);
}

export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}
