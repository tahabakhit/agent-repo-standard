/**
 * Weak-model forcing helpers.
 *
 * When a controlled inference step drives a weaker model, adherence comes from
 * constraining the request, not from trusting the model: force a single tool,
 * restrict the tool set to the minimum, give few-shot examples as messages, and
 * plan once then execute. Deterministic intent→tool routing lives in
 * routing.ts (never model-generated tool-name strings). These are pure,
 * provider-agnostic request shapers.
 */

/** Anthropic-style forced tool_choice: require exactly this tool next. */
export interface ForcedTool {
  type: "tool";
  name: string;
}

export function forceTool(name: string): ForcedTool {
  return { type: "tool", name };
}

/** Restrict an available tool list to the allow-list, preserving order. */
export function restrictTools<T extends { name: string }>(available: T[], allow: string[]): T[] {
  const allowed = new Set(allow);
  return available.filter((t) => allowed.has(t.name));
}

export interface FewShotMessage {
  role: "user" | "assistant";
  content: string;
}

/** Render input/output examples as alternating messages (few-shot-as-messages). */
export function fewShotMessages(examples: Array<{ input: string; output: string }>): FewShotMessage[] {
  const messages: FewShotMessage[] = [];
  for (const ex of examples) {
    messages.push({ role: "user", content: ex.input });
    messages.push({ role: "assistant", content: ex.output });
  }
  return messages;
}

export interface PlanThenExecute {
  plan: string;
  steps: string[];
}

/**
 * Freeze a plan and its ordered steps into a single envelope. Plan once, then
 * execute the fixed steps — no re-planning mid-run.
 */
export function planThenExecute(plan: string, steps: string[]): PlanThenExecute {
  return { plan, steps: [...steps] };
}
