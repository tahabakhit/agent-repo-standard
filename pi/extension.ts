/**
 * Amanar Pi extension.
 *
 * Three responsibilities:
 *   1. resources_discover — register the amanar skills directory so Pi
 *      loads amanar-* skills natively.
 *   2. context — inject a one-time, short bootstrap pointer into the
 *      conversation (deduplicated; does not repeat across turns).
 *   3. tool_call — deny-unless-evidence backpressure: block dangerous bash
 *      operations before they execute.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
  ContextEvent,
  ContextEventResult,
  ResourcesDiscoverEvent,
  ResourcesDiscoverResult,
  ToolCallEvent,
  ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import {
  getBootstrapContent,
  messagesContainBootstrap,
  findBootstrapInsertionIndex,
} from "./bootstrap.ts";
import { classifyToolCall } from "../src/classify.ts";
import { activeWorkflowContext } from "../src/inject.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Absolute path to the single root skills tree. Resolves relative to this
 * file's directory (pi/extension.ts → ../skills).
 */
export const SKILLS_DIR = resolve(__dirname, "..", "skills");

/** Marks the per-turn workflow-context system message so stale copies are stripped. */
const TURN_MARKER = "[amanar:turn:v1]";

export default function amanarExtension(pi: ExtensionAPI): void {
  // ── 1. Skill registration ─────────────────────────────────────────────────

  pi.on(
    "resources_discover",
    (_event: ResourcesDiscoverEvent): ResourcesDiscoverResult => ({
      skillPaths: [SKILLS_DIR],
    }),
  );

  // ── 2. Injection: one-time bootstrap + per-turn workflow context ───────────
  //
  // Pi's platform-adaptive injection path. The bootstrap pointer is injected
  // once; the active workflow context is refreshed each turn (stale copies are
  // stripped first so it does not accumulate). This mirrors the Claude
  // UserPromptSubmit re-injection.

  pi.on(
    "context",
    (event: ContextEvent, ctx: ExtensionContext): ContextEventResult | void => {
      let messages = event.messages;
      let changed = false;

      if (!messagesContainBootstrap(messages)) {
        const insertAt = findBootstrapInsertionIndex(messages);
        messages = [
          ...messages.slice(0, insertAt),
          { role: "system" as const, content: getBootstrapContent() },
          ...messages.slice(insertAt),
        ];
        changed = true;
      }

      // Refresh the per-turn workflow context: drop any prior amanar turn
      // injection, then append the current one (if any).
      const withoutStale = messages.filter(
        (m) => !(typeof m.content === "string" && m.content.startsWith(TURN_MARKER)),
      );
      if (withoutStale.length !== messages.length) {
        messages = withoutStale;
        changed = true;
      }
      const wf = activeWorkflowContext(ctx.cwd);
      if (wf !== null) {
        messages = [...messages, { role: "system" as const, content: `${TURN_MARKER} ${wf}` }];
        changed = true;
      }

      return changed ? { messages } : undefined;
    },
  );

  // ── 3. Backpressure: deny dangerous ops ───────────────────────────────────

  pi.on(
    "tool_call",
    (event: ToolCallEvent): ToolCallEventResult | void => {
      const input =
        "input" in event && typeof event.input === "object" && event.input !== null
          ? (event.input as Record<string, unknown>)
          : {};

      const result = classifyToolCall(event.toolName, input);
      if (!result.allow) {
        return { block: true, reason: result.reason };
      }
      // Allow: return nothing (Pi continues normally)
    },
  );
}
