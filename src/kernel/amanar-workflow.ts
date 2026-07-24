#!/usr/bin/env node
/**
 * Repository-local entry point for the Amanar workflow controller.
 * Thin wrapper — imports and runs src/cli.ts.
 *
 * Run via: node .amanar/kernel/amanar-workflow.ts <verb>
 * Node >=22 strips types natively; no build step required.
 */

import { main } from './src/cli.ts';

await main(process.argv.slice(2));
