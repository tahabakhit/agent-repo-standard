/**
 * Native Pi controller tools.
 *
 * Registers the deterministic workflow verbs as first-class Pi tools so the
 * controller is invoked through native tool calls with a real schema and
 * constrained sampling — instead of the model free-forming a `node
 * .amanar/kernel/amanar-workflow.ts …` bash line. This is a Pi-only strength:
 * registerTool + constrainedSampling gives schema-forced invocation that Claude's
 * plugin API cannot. Each execute is a thin wrapper over the pure runKernelVerb
 * (src/kernelVerbs.ts), which is unit-tested; this file needs Pi's bundled
 * typebox at runtime, so it is imported only by the extension, never by tests.
 */

import { Type } from "typebox";
import type {
  ExtensionAPI,
  ExtensionContext,
  AgentToolResult,
  ConstrainedSamplingConfig,
} from "@earendil-works/pi-coding-agent";
import { runKernelVerb, formatVerbResult } from "../src/kernelVerbs.ts";

/** Prefer strict JSON-Schema sampling; Pi drops it for models that can't honor it. */
const PREFER_STRICT: ConstrainedSamplingConfig = { type: "json_schema", strictness: "prefer" };

function verbResult(root: string, args: string[]): AgentToolResult {
  return formatVerbResult(runKernelVerb(root, args)) as AgentToolResult;
}

export function registerControllerTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "amanar_status",
    label: "amanar: status",
    description:
      "Report the governed workflow contract's controller status as JSON " +
      "(status, current, unmet problems). Read-only. Use to check whether the " +
      "active contract is verified before ending or performing an outward action.",
    promptSnippet: "amanar_status — controller status (verified? unmet checks?)",
    parameters: Type.Object({}),
    constrainedSampling: PREFER_STRICT,
    execute: async (_id, _params, _signal, _onUpdate, ctx: ExtensionContext) =>
      verbResult(ctx.cwd, ["status", "--json"]),
  });

  pi.registerTool({
    name: "amanar_begin",
    label: "amanar: begin",
    description:
      "Begin implementing the governed workflow contract (planned → implementing). " +
      "Requires the contract to authorize repository writes.",
    promptSnippet: "amanar_begin — start implementing the active contract",
    parameters: Type.Object({}),
    constrainedSampling: PREFER_STRICT,
    execute: async (_id, _params, _signal, _onUpdate, ctx: ExtensionContext) =>
      verbResult(ctx.cwd, ["begin"]),
  });

  pi.registerTool({
    name: "amanar_run_check",
    label: "amanar: run check",
    description:
      "Run one declared acceptance check by id and record its receipt. The check " +
      "command comes from the contract, not from you.",
    promptSnippet: "amanar_run_check(id) — run one declared check, record a receipt",
    parameters: Type.Object({
      id: Type.String({ description: "The check id declared in the contract's checks." }),
    }),
    constrainedSampling: PREFER_STRICT,
    execute: async (_id, params, _signal, _onUpdate, ctx: ExtensionContext) => {
      const checkId = typeof params?.id === "string" ? params.id : "";
      return verbResult(ctx.cwd, ["run-check", checkId]);
    },
  });

  pi.registerTool({
    name: "amanar_verify",
    label: "amanar: verify",
    description:
      "Verify the governed workflow contract against recorded evidence " +
      "(implementing → verified). Fails unless every declared check has a passing " +
      "receipt and scope/artifact constraints hold. This is the completion proof.",
    promptSnippet: "amanar_verify — prove completion from receipts (not narration)",
    parameters: Type.Object({}),
    constrainedSampling: PREFER_STRICT,
    execute: async (_id, _params, _signal, _onUpdate, ctx: ExtensionContext) =>
      verbResult(ctx.cwd, ["verify"]),
  });
}
