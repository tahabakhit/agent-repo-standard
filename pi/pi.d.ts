/**
 * Ambient declarations for @earendil-works/pi-coding-agent.
 *
 * Regenerated against the installed dist of pi-coding-agent@0.82.0
 * (dist/core/extensions/{types,index}.d.ts, model-registry.d.ts). Covers the
 * events, APIs, and result shapes this extension wires — injection
 * (before_agent_start), session lifecycle (session_start), the completion gate
 * (agent_settled), native controller tools (registerTool + typebox), model
 * introspection (ctx.modelRegistry/model), skill discovery (resources_discover),
 * and backpressure (tool_call). Kept focused so a future Pi upgrade surfaces a
 * mismatch here rather than silently; a drift guard (pi/tests/drift.test.ts)
 * checks these names against the installed dist when it is present.
 *
 * The real package is a peer of the Pi runtime, not an amanar dependency; these
 * ambient types let `tsc --noEmit` succeed with amanar's zero-dependency tree.
 */
declare module "@earendil-works/pi-coding-agent" {
  import type { TSchema } from "typebox";

  /** Generic handler type: receives an event and context, may return a result. */
  export type ExtensionHandler<E, R = undefined> = (
    event: E,
    ctx: ExtensionContext,
  ) => Promise<R | void> | R | void;

  // ── Content + messages (loose; roles/parts intentionally wide) ─────────────

  export interface TextContent {
    type: "text";
    text: string;
  }
  export interface ImageContent {
    type: "image";
    [key: string]: unknown;
  }
  export interface AgentMessage {
    role: string;
    content: unknown;
  }

  // ── Model introspection (ctx.model + ctx.modelRegistry) ────────────────────

  export interface Model {
    id: string;
    name: string;
    provider?: string;
    contextWindow?: number;
    reasoning?: boolean;
    [key: string]: unknown;
  }

  /** Synchronous compatibility facade exposed to extensions. */
  export interface ModelRegistry {
    getAll(): Model[];
    getAvailable(): Model[];
    find(provider: string, modelId: string): Model | undefined;
    getRegisteredProviderIds(): readonly string[];
  }

  // ── Context ────────────────────────────────────────────────────────────────

  export type ExtensionMode = "tui" | "rpc" | "json" | "print";

  export interface ExtensionContext {
    cwd: string;
    mode: ExtensionMode;
    hasUI: boolean;
    isIdle(): boolean;
    signal: AbortSignal | undefined;
    /** Current model, or undefined before one is resolved. */
    model: Model | undefined;
    /** Model registry facade (getAvailable/getAll/find). */
    modelRegistry: ModelRegistry;
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

  // ── session lifecycle ──────────────────────────────────────────────────────

  export interface SessionStartEvent {
    type: "session_start";
    reason: "startup" | "reload" | "new" | "resume" | "fork";
    previousSessionFile?: string;
  }

  // ── injection: before_agent_start ──────────────────────────────────────────

  export interface BeforeAgentStartEvent {
    type: "before_agent_start";
    /** The raw user prompt text (after expansion). */
    prompt: string;
    images?: ImageContent[];
    /** The fully assembled system prompt string. */
    systemPrompt: string;
  }
  export interface BeforeAgentStartEventResult {
    /** Replace the system prompt for this turn. Chained across extensions. */
    systemPrompt?: string;
  }

  // ── completion gate: agent lifecycle ───────────────────────────────────────

  export interface AgentEndEvent {
    type: "agent_end";
    messages: AgentMessage[];
  }
  /** Fired after an agent run has fully settled: no retry/compaction/continuation. */
  export interface AgentSettledEvent {
    type: "agent_settled";
  }

  // ── tool_call (backpressure) ───────────────────────────────────────────────

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
  export type ToolCallEvent = BashToolCallEvent | CustomToolCallEvent;
  export interface ToolCallEventResult {
    block?: boolean;
    reason?: string;
  }

  // ── registerTool (native controller tools) ─────────────────────────────────

  export interface AgentToolResult<TDetails = unknown> {
    content: (TextContent | ImageContent)[];
    isError?: boolean;
    details?: TDetails;
  }
  export type AgentToolUpdateCallback<TDetails = unknown> = (
    partial: TDetails,
  ) => void;

  /** Strict-JSON-Schema or grammar constrained sampling request for a tool. */
  export type ConstrainedSamplingConfig =
    | { type: "json_schema"; strictness: "prefer" | "require" }
    | { type: "grammar"; syntax: "lark" | "regex"; definition: string };

  export interface ToolDefinition {
    name: string;
    label: string;
    description: string;
    promptSnippet?: string;
    promptGuidelines?: string[];
    parameters: TSchema;
    constrainedSampling?: false | ConstrainedSamplingConfig;
    execute(
      toolCallId: string,
      params: any,
      signal: AbortSignal | undefined,
      onUpdate: AgentToolUpdateCallback | undefined,
      ctx: ExtensionContext,
    ): Promise<AgentToolResult>;
  }

  // ── ExtensionAPI ──────────────────────────────────────────────────────────

  export interface ExtensionAPI {
    on(
      event: "resources_discover",
      handler: ExtensionHandler<ResourcesDiscoverEvent, ResourcesDiscoverResult>,
    ): void;
    on(event: "session_start", handler: ExtensionHandler<SessionStartEvent>): void;
    on(
      event: "before_agent_start",
      handler: ExtensionHandler<BeforeAgentStartEvent, BeforeAgentStartEventResult>,
    ): void;
    on(event: "agent_end", handler: ExtensionHandler<AgentEndEvent>): void;
    on(event: "agent_settled", handler: ExtensionHandler<AgentSettledEvent>): void;
    on(
      event: "tool_call",
      handler: ExtensionHandler<ToolCallEvent, ToolCallEventResult>,
    ): void;

    /** Register a tool the LLM can call. */
    registerTool(tool: ToolDefinition): void;

    /**
     * Send a user message to the agent. Always triggers a turn. Used by the
     * completion gate to drive continuation until evidence is verified.
     */
    sendUserMessage(
      content: string | (TextContent | ImageContent)[],
      options?: { deliverAs?: "steer" | "followUp" },
    ): void;
  }

  /** Extension factory function type. */
  export type ExtensionFactory = (pi: ExtensionAPI) => void | Promise<void>;
}

/**
 * Ambient shim for Pi's bundled typebox. Pi aliases `typebox` (and
 * `@sinclair/typebox`) into the extension at load time, so `import { Type }`
 * resolves to Pi's copy at runtime; this declaration only satisfies typecheck
 * in amanar's zero-dependency tree. Covers the builders the controller tools use.
 */
declare module "typebox" {
  /** Opaque schema handle. Real TypeBox schemas carry runtime symbols. */
  export interface TSchema {
    readonly __typebox: unique symbol;
  }
  export type Static<_T extends TSchema> = any;

  interface SchemaOptions {
    description?: string;
    [key: string]: unknown;
  }

  export const Type: {
    Object(properties: Record<string, TSchema>, options?: SchemaOptions): TSchema;
    String(options?: SchemaOptions): TSchema;
    Number(options?: SchemaOptions): TSchema;
    Boolean(options?: SchemaOptions): TSchema;
    Optional(schema: TSchema): TSchema;
    Literal(value: string | number | boolean, options?: SchemaOptions): TSchema;
    Union(schemas: TSchema[], options?: SchemaOptions): TSchema;
    Array(schema: TSchema, options?: SchemaOptions): TSchema;
  };
}
