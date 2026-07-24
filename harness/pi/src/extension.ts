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
} from "./bootstrap.js";
import { classifyToolCall } from "./classify.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Absolute paths to the kit skill directories.
 *
 * Both resolve relative to this file's directory (works whether Pi runs
 * extension.ts via type-stripping from src/ or from a compiled dist/):
 *
 *   src/  or dist/  → ../../../workflow/skills  (kit workflow skills)
 *                    → ../../skills             (kit harness skills)
 */
export const WORKFLOW_SKILLS_DIR = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "workflow",
  "skills",
);
export const HARNESS_SKILLS_DIR = resolve(__dirname, "..", "..", "skills");

export default function amanarExtension(pi: ExtensionAPI): void {
  // ── 1. Skill registration ─────────────────────────────────────────────────

  pi.on(
    "resources_discover",
    (_event: ResourcesDiscoverEvent): ResourcesDiscoverResult => ({
      skillPaths: [WORKFLOW_SKILLS_DIR, HARNESS_SKILLS_DIR],
    }),
  );

  // ── 2. One-time bootstrap pointer ─────────────────────────────────────────

  pi.on(
    "context",
    (event: ContextEvent): ContextEventResult | void => {
      if (messagesContainBootstrap(event.messages)) {
        // Already injected in this session — skip.
        return;
      }

      const bootstrapMessage = {
        role: "system" as const,
        content: getBootstrapContent(),
      };

      const insertAt = findBootstrapInsertionIndex(event.messages);
      const updated = [
        ...event.messages.slice(0, insertAt),
        bootstrapMessage,
        ...event.messages.slice(insertAt),
      ];

      return { messages: updated };
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
