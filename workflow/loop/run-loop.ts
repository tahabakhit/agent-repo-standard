#!/usr/bin/env node
/**
 * Bounded-loop runner entry point.
 *
 * Usage: node workflow/loop/run-loop.ts --host pi --root PATH
 *
 * Invokes the TypeScript loop runner with the given flags. All flags are
 * forwarded to `loop()`; the result is printed as JSON. Exits 0 if the
 * outcome is 'verified', 1 otherwise.
 *
 * Node >=22 strips types natively; no build step required.
 */

import path from 'node:path';
import { MARKER_KEYS, loop } from './src/runLoop.ts';

// ---------------------------------------------------------------------------
// Minimal arg parser (mirrors the Python argparse setup exactly)
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): {
  host: string;
  root: string;
  model: string;
  effort: string;
  maxIterations: number;
  passK: number;
  timeout: number;
  allowMarkers: string[];
} {
  const args = argv.slice(0); // copy
  let host = '';
  let root = '.';
  let model = 'gpt-5.6-sol';
  let effort = 'medium';
  let maxIterations = 6;
  let passK = 1;
  let timeout = 300;
  const allowMarkers: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = args[i + 1];
    if (a === '--host' && next) { host = next; i++; }
    else if (a === '--root' && next) { root = next; i++; }
    else if (a === '--model' && next) { model = next; i++; }
    else if (a === '--effort' && next) { effort = next; i++; }
    else if (a === '--max-iterations' && next) { maxIterations = parseInt(next, 10); i++; }
    else if (a === '--pass-k' && next) { passK = parseInt(next, 10); i++; }
    else if (a === '--timeout' && next) { timeout = parseInt(next, 10); i++; }
    else if (a === '--allow-marker' && next) {
      if (![...MARKER_KEYS].includes(next)) {
        process.stderr.write(`error: --allow-marker must be one of: ${[...MARKER_KEYS].sort().join(', ')}\n`);
        process.exit(1);
      }
      allowMarkers.push(next);
      i++;
    }
  }

  if (!host || !['pi', 'claude', 'codex'].includes(host)) {
    process.stderr.write('error: --host is required and must be pi, claude, or codex\n');
    process.exit(1);
  }

  return { host, root, model, effort, maxIterations, passK, timeout, allowMarkers };
}

const parsed = parseArgs(process.argv.slice(2));
const allowedMarkers: Set<string> | null = parsed.allowMarkers.length > 0
  ? new Set(parsed.allowMarkers)
  : null;

const result = loop(
  path.resolve(parsed.root),
  parsed.host,
  parsed.model,
  parsed.effort,
  parsed.maxIterations,
  parsed.passK,
  parsed.timeout,
  undefined,
  allowedMarkers,
);

process.stdout.write(JSON.stringify(result, Object.keys(result).sort() as unknown as null) + '\n');
process.exit(result.outcome === 'verified' ? 0 : 1);
