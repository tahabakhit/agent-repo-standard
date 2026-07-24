/**
 * Minimal YAML frontmatter parser / serializer (no third-party deps).
 * Handles: scalar, inline list, block list, nested source objects.
 */

export type FmValue = string | null | string[] | Record<string, string>[];
export type FmDict = Record<string, FmValue>;

function unquote(s: string): string {
  s = s.trim();
  if (
    s.length >= 2 &&
    ((s[0] === '"' && s[s.length - 1] === '"') ||
      (s[0] === "'" && s[s.length - 1] === "'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

export function quoteScalar(s: string): string {
  if (!s) return '""';
  const special = new Set([
    ":", "{", "}", "[", "]", "|", ">", "&", "!", "%", "@", "`", "#", ",",
    "'", '"',
  ]);
  if (
    [...s].some((c) => special.has(c)) ||
    s[0] === " " ||
    s[0] === "\t" ||
    s[s.length - 1] === " " ||
    s[s.length - 1] === "\t" ||
    s.includes("\n")
  ) {
    const escaped = s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return s;
}

export function parseFrontmatter(text: string): FmDict {
  const lines = text.split("\n");
  const n = lines.length;
  const result: FmDict = {};
  let i = 0;

  function skipBlank(idx: number): number {
    while (idx < n && !lines[idx].trim()) idx++;
    return idx;
  }

  while (i < n) {
    i = skipBlank(i);
    if (i >= n) break;
    const line = lines[i];
    const stripped = line.trimStart();
    const indent = line.length - stripped.length;
    if (indent > 0) {
      i++;
      continue;
    }
    const m = line.match(/^([\w-]+):\s*(.*)/);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1];
    const valRaw = m[2].trim();

    if (valRaw) {
      if (valRaw.startsWith("[") && valRaw.endsWith("]")) {
        const inner = valRaw.slice(1, -1).trim();
        result[key] = inner
          ? inner.split(",").filter((v) => v.trim()).map((v) => unquote(v))
          : [];
      } else {
        result[key] = unquote(valRaw);
      }
      i++;
    } else {
      i++;
      i = skipBlank(i);
      if (i >= n) {
        result[key] = null;
        break;
      }
      const firstStripped = lines[i].trimStart();
      if (firstStripped.startsWith("- ") || firstStripped === "-") {
        const items: (string | null | Record<string, string>)[] = [];
        while (i < n) {
          const bl = lines[i];
          const bls = bl.trimStart();
          const blsIndent = bl.length - bls.length;
          if (!bls) {
            i++;
            continue;
          }
          if (blsIndent === 0 && !bls.startsWith("-")) break;
          if (bls.startsWith("- ")) {
            const itemText = bls.slice(2).trim();
            i++;
            const km = itemText.match(/^([\w-]+):\s*(.*)/);
            if (km) {
              const obj: Record<string, string> = {
                [km[1]]: unquote(km[2].trim()),
              };
              while (i < n) {
                const sl = lines[i];
                const sls = sl.trimStart();
                if (!sls) break;
                if (sl.length - sls.length === 0) break;
                const sm = sls.match(/^([\w-]+):\s*(.*)/);
                if (sm) {
                  obj[sm[1]] = unquote(sm[2].trim());
                }
                i++;
              }
              items.push(obj);
            } else if (itemText) {
              items.push(unquote(itemText));
            } else {
              items.push(null);
            }
          } else {
            i++;
          }
        }
        result[key] = items as string[];
      } else {
        result[key] = unquote(firstStripped);
        i++;
      }
    }
  }
  return result;
}

export function serializeFrontmatter(data: FmDict): string {
  const lines: string[] = ["---"];
  for (const [key, val] of Object.entries(data)) {
    if (Array.isArray(val)) {
      if (val.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of val) {
          if (item !== null && typeof item === "object") {
            const pairs = Object.entries(item as Record<string, string>);
            if (pairs.length === 0) {
              lines.push("  -");
            } else {
              const [k0, v0] = pairs[0];
              lines.push(`  - ${k0}: ${quoteScalar(String(v0))}`);
              for (const [k, v] of pairs.slice(1)) {
                lines.push(`    ${k}: ${quoteScalar(String(v))}`);
              }
            }
          } else {
            lines.push(`  - ${quoteScalar(String(item))}`);
          }
        }
      }
    } else if (val === null) {
      lines.push(`${key}:`);
    } else {
      lines.push(`${key}: ${quoteScalar(String(val))}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

export function splitEntryText(text: string): [string, string] {
  if (!text.startsWith("---")) return ["", text];
  let rest = text.slice(3);
  if (rest && (rest[0] === "\r" || rest[0] === "\n")) {
    rest = rest.replace(/^[\r\n]+/, "");
  }
  const end = rest.indexOf("\n---");
  if (end === -1) return ["", text];
  const fmText = rest.slice(0, end).trimEnd();
  const body = rest.slice(end + 4).replace(/^\n+/, "");
  return [fmText, body];
}
