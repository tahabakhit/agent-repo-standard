/**
 * Deterministic resume/handoff digest for an Amanar workflow.
 * Mirrors tools/render_handoff.py exactly.
 */

import fs from 'node:fs';
import path from 'node:path';
import { paths, readJson } from '../cli.ts';
import { load, workflowHash } from '../contract.ts';
import { WorkflowError } from '../errors.ts';
import { outputProblem, receiptProblem, sourceSnapshot } from '../receipts.ts';
import { readState } from '../state.ts';

function verdict(
  location: Record<string, string>,
  contract: Record<string, unknown>,
  check: Record<string, unknown>,
  currentDigest: string | null,
): [string, string] {
  const receiptPath = path.join(location['receipts'], `${check['id']}.json`);
  if (!fs.existsSync(receiptPath) || !fs.statSync(receiptPath).isFile()) {
    return ['MISSING', 'no receipt recorded'];
  }
  if (currentDigest === null) {
    return ['UNKNOWN', 'source digest unavailable (not a committed git tree)'];
  }
  const receipt = readJson(receiptPath);
  let problem = receiptProblem(receipt, contract, check, currentDigest);
  if (problem === null) {
    problem = outputProblem(receipt, check, path.join(location['run'], 'output'));
  }
  if (problem !== null) {
    return ['STALE', problem];
  }
  return [
    'CURRENT',
    `passed, tests=${receipt['discoveredTests']}, at ${receipt['recordedAt']}`,
  ];
}

export function render(root: string): string {
  const location = paths(root);
  const contract = load(location['contract']);
  const state = readState(location['state']);
  const recorded = state === null ? 'planned' : (state['status'] as string);

  let currentDigest: string | null = null;
  if (state !== null) {
    try {
      currentDigest = sourceSnapshot(root)['digest'] as string;
    } catch {
      currentDigest = null;
    }
  }

  const verdicts: Array<[string, string, string]> = (
    contract['checks'] as Record<string, unknown>[]
  ).map(c => {
    const [tag, detail] = verdict(location, contract, c, currentDigest);
    return [c['id'] as string, tag, detail];
  });

  const stale = verdicts.some(([, tag]) => tag !== 'CURRENT');
  const effective = recorded === 'verified' && stale ? 'implementing' : recorded;

  const out: string[] = [`# Workflow handoff — ${contract['id']}`, ''];
  const label =
    `**${effective}**` + (effective !== recorded ? ` (recorded ${recorded})` : '');
  out.push(`- State: ${label}`);
  out.push(`- Objective: ${contract['objective']}`);
  if (state !== null && state['blockReason']) {
    out.push(`- Blocked: ${state['blockReason']}`);
  }

  out.push('', '## Receipts');
  for (const [cid, tag, detail] of verdicts) {
    out.push(`- \`${cid}\`: **${tag}** — ${detail}`);
  }

  out.push('', '## Closet');
  out.push(`- Workflow id: \`${contract['id']}\``);
  out.push(`- Workflow hash: \`${workflowHash(contract)}\``);
  const scopeStr = (contract['scope'] as string[]).map(p => `\`${p}\``).join(', ') || '(none)';
  out.push(`- Scope: ${scopeStr}`);
  const exclusions = contract['exclusions'] as string[];
  if (exclusions.length > 0) {
    out.push(`- Exclusions: ${exclusions.map(p => `\`${p}\``).join(', ')}`);
  }
  const artifactsStr =
    (contract['artifacts'] as string[]).map(p => `\`${p}\``).join(', ') || '(none)';
  out.push(`- Artifacts: ${artifactsStr}`);

  out.push('', '## Rebuild to verified');
  if (effective === 'verified') {
    out.push('- Already verified with current receipts. No action needed.');
  } else {
    const steps: string[] = [];
    if (effective === 'planned' || effective === 'blocked') {
      steps.push('`begin` (required before any check)');
    }
    for (const [cid, tag] of verdicts) {
      if (tag !== 'CURRENT') {
        steps.push(`\`run-check ${cid}\` (currently ${tag})`);
      }
    }
    steps.push('`verify`');
    for (let i = 0; i < steps.length; i++) {
      out.push(`${i + 1}. ${steps[i]}`);
    }
  }
  out.push('');
  return out.join('\n');
}

export function main(argv: string[] = process.argv.slice(2)): void {
  const args = argv.slice();
  const rootIdx = args.indexOf('--root');
  let rootPath = '.';
  if (rootIdx !== -1) {
    rootPath = args[rootIdx + 1] ?? '.';
  }
  try {
    process.stdout.write(render(path.resolve(rootPath)));
  } catch (e) {
    if (e instanceof WorkflowError) {
      process.stderr.write(`render_handoff error: ${e.message}\n`);
      process.exit(1);
    }
    throw e;
  }
}
