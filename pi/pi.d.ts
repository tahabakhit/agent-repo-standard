/**
 * Minimal ambient declarations for @earendil-works/pi-coding-agent.
 *
 * These types are derived from the published dist/core/extensions/types.d.ts in
 * @earendil-works/pi-coding-agent@0.81.1. They cover only the events and shapes
 * used by this extension. Kept narrow so future upgrades surface mismatches early.
 *
 * The real package is a devDependency but may not be installable in offline CI;
 * this ambient module lets tsc succeed regardless.
 */
declare module "@earendil-works/pi-coding-agent" {
  /** Generic handler type: receives an event and context, may return a result. */
  export type ExtensionHandler<E, R = undefined> = (
    event: E,
    ctx: ExtensionContext,
  ) => Promise<R | void> | R | void;

  // ── Context ────────────────────────────────────────────────────────────────

  export interface ExtensionContext {
    cwd: string;
    mode: "tui" | "rpc" | "json" | "print";
    hasUI: boolean;
    isIdle(): boolean;
    signal: AbortSignal | undefined;
  }

  // ── resources_discover ────────────────────────────────────────────────────

  export interface ResourcesDiscoverEvent {
    type: "resources_discover";
    cwd: string;
    reason: "startup" | "reload";
  }

  export interface ResourcesDiscoverResult {
    skillPaths?: string[];
    promptPaths?: string[];
    themePaths?: string[];
  }

  // ── context ───────────────────────────────────────────────────────────────

  /** An agent message in the conversation. Role is intentionally loose here. */
  export interface AgentMessage {
    role: string;
    content: unknown;
  }

  export interface ContextEvent {
    type: "context";
    messages: AgentMessage[];
  }

  export interface ContextEventResult {
    messages?: AgentMessage[];
  }

  // ── tool_call ─────────────────────────────────────────────────────────────

  export interface BashToolInput {
    command: string;
    timeout?: number;
    restart?: boolean;
  }

  interface ToolCallEventBase {
    type: "tool_call";
    toolCallId: string;
  }

  export interface BashToolCallEvent extends ToolCallEventBase {
    toolName: "bash";
    input: BashToolInput;
  }

  export interface CustomToolCallEvent extends ToolCallEventBase {
    toolName: string;
    input: Record<string, unknown>;
  }

  export type ToolCallEvent =
    | BashToolCallEvent
    | CustomToolCallEvent;

  export interface ToolCallEventResult {
    block?: boolean;
    reason?: string;
  }

  // ── ExtensionAPI ──────────────────────────────────────────────────────────

  export interface ExtensionAPI {
    on(
      event: "resources_discover",
      handler: ExtensionHandler<ResourcesDiscoverEvent, ResourcesDiscoverResult>,
    ): void;
    on(
      event: "context",
      handler: ExtensionHandler<ContextEvent, ContextEventResult>,
    ): void;
    on(
      event: "tool_call",
      handler: ExtensionHandler<ToolCallEvent, ToolCallEventResult>,
    ): void;
  }
}
