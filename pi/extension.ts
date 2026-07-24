/**
 * Amanar Pi extension (pi-coding-agent 0.82.0).
 *
 * Responsibilities:
 *   1. resources_discover — register the amanar skills directory so Pi loads
 *      amanar-* skills natively.
 *   2. session_start — reset per-session injection state (first-turn orientation,
 *      essence toggle) for a fresh or reloaded session.
 *   3. before_agent_start — the strong injection path: append the amanar block to
 *      the assembled system prompt each turn (first-turn orientation + per-turn
 *      essence/workflow context). Replaces the weaker context-message stuffing.
 *   4. tool_call — deny-unless-evidence backpressure: block dangerous bash
 *      operations before they execute.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
  ResourcesDiscoverEvent,
  ResourcesDiscoverResult,
  SessionStartEvent,
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  AgentSettledEvent,
  ToolCallEvent,
  ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import { classifyToolCall } from "../src/classify.ts";
import { buildPiInjection } from "../src/inject.ts";
import { essenceToggleFromPrompt } from "../src/hooks/userPromptSubmit.ts";
import { decidePiSettle } from "../src/hooks/piCompletion.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Absolute path to the single root skills tree. Resolves relative to this
 * file's directory (pi/extension.ts → ../skills).
 */
export const SKILLS_DIR = resolve(__dirname, "..", "skills");

export default function amanarExtension(pi: ExtensionAPI): void {
  // Per-session injection state (reset by session_start).
  let firstTurnDone = false;
  let essenceOn = true;
  // Completion-gate continuation counter (bounded; reset by session_start and
  // whenever the contract is verified or absent).
  let piNudges = 0;

  // ── 1. Skill registration ─────────────────────────────────────────────────

  pi.on(
    "resources_discover",
    (_event: ResourcesDiscoverEvent): ResourcesDiscoverResult => ({
      skillPaths: [SKILLS_DIR],
    }),
  );

  // ── 2. Session lifecycle ───────────────────────────────────────────────────
  //
  // Pi has no way to return context from session_start, so its job here is state:
  // a new/reloaded session gets fresh orientation on its next turn and the
  // default-on essence directive.

  pi.on("session_start", (_event: SessionStartEvent): void => {
    firstTurnDone = false;
    essenceOn = true;
    piNudges = 0;
  });

  // ── 3. Injection: before_agent_start systemPrompt rewrite ──────────────────
  //
  // Pi's strongest injection point: the fully assembled system prompt is handed
  // over per turn and we return a replacement. First turn carries the one-time
  // orientation (bootstrap + catalog + onboarding nudge); every turn carries the
  // essence directive and active workflow context. Mirrors the Claude
  // SessionStart + UserPromptSubmit re-injection at equal or greater strength.

  pi.on(
    "before_agent_start",
    (
      event: BeforeAgentStartEvent,
      ctx: ExtensionContext,
    ): BeforeAgentStartEventResult | void => {
      const toggle = essenceToggleFromPrompt(event.prompt ?? "");
      if (toggle === "off") essenceOn = false;
      else if (toggle === "on") essenceOn = true;

      const injection = buildPiInjection(ctx.cwd, {
        firstTurn: !firstTurnDone,
        essenceOn,
      });
      firstTurnDone = true;

      if (injection === null) return;
      return { systemPrompt: `${event.systemPrompt}\n\n${injection}` };
    },
  );

  // ── 4. Completion gate: agent_settled continuation ─────────────────────────
  //
  // Pi cannot block "done" (agent_settled returns nothing), so the gate holds
  // completion by continuation: if a governed contract is present and unverified,
  // re-inject the evidence demand via sendUserMessage, which triggers another
  // turn. Bounded by a nudge cap (no stop_hook_active equivalent on Pi); past the
  // cap it stands down to the runner-holds-done floor.

  pi.on("agent_settled", (_event: AgentSettledEvent, ctx: ExtensionContext): void => {
    const decision = decidePiSettle(ctx.cwd, { nudges: piNudges });
    if (decision.action === "reset") {
      piNudges = 0;
    } else if (decision.action === "continue" && decision.reason) {
      piNudges += 1;
      pi.sendUserMessage(decision.reason);
    }
    // stand-down: leave the counter and do nothing (runner holds done).
  });

  // ── 5. Backpressure: deny dangerous ops ────────────────────────────────────

  pi.on("tool_call", (event: ToolCallEvent): ToolCallEventResult | void => {
    const input =
      "input" in event && typeof event.input === "object" && event.input !== null
        ? (event.input as Record<string, unknown>)
        : {};

    const result = classifyToolCall(event.toolName, input);
    if (!result.allow) {
      return { block: true, reason: result.reason };
    }
    // Allow: return nothing (Pi continues normally)
  });
}
