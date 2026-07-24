/**
 * Bootstrap helpers.
 *
 * Provides a short, one-time context pointer that tells the agent the
 * amanar-* skills are loaded. Not a coercive mega-prompt — just a brief note
 * so the agent knows what tools are available.
 */

/** Stable marker used to detect if bootstrap was already injected. */
const BOOTSTRAP_MARKER = "amanar:bootstrap:v1";

/**
 * Returns the one-time bootstrap content.
 *
 * Keep this short. Its only job is to point the agent toward the amanar
 * skills without overriding its natural behaviour.
 */
export function getBootstrapContent(): string {
  return (
    `[${BOOTSTRAP_MARKER}] ` +
    `Amanar skills are loaded (prefix $amanar-). ` +
    `Use them when they apply; ignore this note otherwise.`
  );
}

/**
 * Returns true when the given text already contains the bootstrap marker.
 * Used to deduplicate: only inject once per session.
 */
export function messageContainsBootstrap(text: string): boolean {
  return text.includes(BOOTSTRAP_MARKER);
}

/**
 * Checks whether an array of agent messages already has a bootstrap injection.
 * Inspects all messages whose content is a plain string.
 */
export function messagesContainBootstrap(
  messages: ReadonlyArray<{ role: string; content: unknown }>,
): boolean {
  return messages.some((m) => {
    if (typeof m.content === "string") {
      return messageContainsBootstrap(m.content);
    }
    // Handle content arrays (multi-modal messages)
    if (Array.isArray(m.content)) {
      return m.content.some(
        (part) =>
          typeof part === "object" &&
          part !== null &&
          "text" in part &&
          typeof (part as { text: unknown }).text === "string" &&
          messageContainsBootstrap((part as { text: string }).text),
      );
    }
    return false;
  });
}

/**
 * Finds the best insertion index for the bootstrap pointer.
 *
 * Strategy: insert after the last existing system-level message (role
 * "system") if one exists, otherwise at the very beginning. This avoids
 * splitting mid-conversation messages and mirrors superpowers' approach of
 * picking a stable insertion point near the system prompt.
 */
export function findBootstrapInsertionIndex(
  messages: ReadonlyArray<{ role: string; content: unknown }>,
): number {
  let lastSystemIdx = -1;
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === "system") {
      lastSystemIdx = i;
    }
  }
  return lastSystemIdx + 1; // 0 when no system message, lastSystemIdx+1 otherwise
}
