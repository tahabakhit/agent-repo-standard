/**
 * Shared coding-agent host invocation shapes.
 *
 * Both the portability pack and the bounded-loop runner drive hosts through
 * the identical builders here, so a host either behaves one way everywhere or
 * nowhere. Each builder returns a non-interactive, fresh-context,
 * JSON-emitting invocation over `prompt`, run from the target repository root
 * (the caller sets the working directory). `null` means the host has no
 * supported headless shape.
 *
 * Fresh context per invocation: codex `--ephemeral`, claude
 * `--no-session-persistence`, pi `--no-session`. Reasoning is pinned low;
 * callers that need a different level should extend this in one place.
 *
 * Port of workflow/hosts.py.
 */

export function hostCommand(
  host: string,
  fixture: string,
  prompt: string,
  model: string,
  effort: string = 'low',
): string[] | null {
  if (host === 'codex') {
    return [
      'codex', 'exec', '--model', model, '--config', `model_reasoning_effort="${effort}"`,
      '--ephemeral', '--disable', 'plugins', '--sandbox', 'workspace-write',
      '--json', '-C', fixture, prompt,
    ];
  }
  if (host === 'claude') {
    return [
      'claude', '-p', '--no-session-persistence', '--setting-sources', 'project',
      '--permission-mode', 'acceptEdits', '--output-format', 'json',
      '--model', 'sonnet', '--effort', effort, prompt,
    ];
  }
  if (host === 'pi') {
    // Pi auto-discovers AGENTS.md/CLAUDE.md and project .agents/skills; the
    // controller instruction and any $skill trigger travel in the prompt, as
    // for the other hosts. An unqualified model id fuzzy-matches across every
    // known provider (and can land on an unauthed one), so qualify it with the
    // openai-codex provider to match the codex host. Pass a full `provider/id`
    // (e.g. anthropic-vertex/claude-sonnet-5) to route elsewhere.
    const pattern = model.includes('/') ? model : `openai-codex/${model}`;
    return [
      'pi', '-p', '--no-session', '--mode', 'json',
      '--thinking', effort, '--model', pattern, prompt,
    ];
  }
  return null;
}
