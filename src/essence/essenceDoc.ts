/**
 * Essence doc guard.
 *
 * A mechanical protected-span guard for essence rewrites: prose may be trimmed,
 * but fenced code, inline code, URLs, file paths, and commands must survive
 * verbatim. This extracts those spans and checks that a rewrite preserved every
 * one — style compression must never silently alter a payload.
 *
 * Ported to TypeScript from essence's essence_doc.py (adapted from essence by
 * Clint Ayres, jurassix/essence, MIT).
 */

export type SpanKind = "fenced-code" | "inline-code" | "url";

export interface ProtectedSpan {
  kind: SpanKind;
  text: string;
}

const FENCED = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
const INLINE = /`[^`\n]+`/g;
const URL = /\bhttps?:\/\/[^\s)<>"']+/g;

/** Extract the protected spans from a markdown/prose document, in document order. */
export function protectedSpans(text: string): ProtectedSpan[] {
  const spans: ProtectedSpan[] = [];
  const fenced = new Set<string>();

  for (const m of text.matchAll(FENCED)) {
    spans.push({ kind: "fenced-code", text: m[0] });
    fenced.add(m[0]);
  }
  // Inline code, skipping anything already captured inside a fenced block.
  for (const m of text.matchAll(INLINE)) {
    if ([...fenced].some((f) => f.includes(m[0]))) continue;
    spans.push({ kind: "inline-code", text: m[0] });
  }
  for (const m of text.matchAll(URL)) {
    spans.push({ kind: "url", text: m[0] });
  }
  return spans;
}

export interface PreservationResult {
  ok: boolean;
  /** Protected spans present in `before` but missing from `after`. */
  missing: ProtectedSpan[];
}

/**
 * Verify that every protected span in `before` still appears verbatim in
 * `after`. Counts matter: two occurrences before require two after.
 */
export function verifyPreserved(before: string, after: string): PreservationResult {
  const missing: ProtectedSpan[] = [];
  const consumed: number[] = [];
  // Track match positions in `after` so duplicate spans must each be present.
  for (const span of protectedSpans(before)) {
    let from = 0;
    let found = -1;
    // Find an occurrence in `after` not already consumed.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const idx = after.indexOf(span.text, from);
      if (idx === -1) break;
      if (!consumed.includes(idx)) {
        found = idx;
        break;
      }
      from = idx + 1;
    }
    if (found === -1) missing.push(span);
    else consumed.push(found);
  }
  return { ok: missing.length === 0, missing };
}
