/**
 * Secret scanner: regex patterns + Shannon-entropy heuristic.
 * Exact port of kb.py secret scanning logic.
 */

const SECRET_PATTERNS: [RegExp, string][] = [
  [/AKIA[0-9A-Z]{16}/, "AWS access key (AKIA…)"],
  [
    /-----BEGIN\s+(?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
    "PEM private key block",
  ],
  [
    /(?:password|passwd|api[_-]key|secret[_-]key|auth[_-]token|access[_-]token)\s*[:=]\s*["']?[A-Za-z0-9+/=_\-]{8,}/i,
    "credential assignment",
  ],
];

const MIN_ENTROPY_LEN = 20;
const ENTROPY_THRESHOLD = 4.5;

export function shannonEntropy(s: string): number {
  if (!s) return 0.0;
  const freq: Record<string, number> = {};
  for (const c of s) {
    freq[c] = (freq[c] ?? 0) + 1;
  }
  const n = s.length;
  return -Object.values(freq).reduce((sum, c) => {
    const p = c / n;
    return sum + p * Math.log2(p);
  }, 0);
}

export function scanSecrets(text: string): string[] {
  const findings: string[] = [];
  for (const [pattern, label] of SECRET_PATTERNS) {
    const m = pattern.exec(text);
    if (m) {
      const preview = m[0].slice(0, 60).replace(/\n/g, " ");
      findings.push(`${label}: ${JSON.stringify(preview)}`);
    }
  }
  // High-entropy token heuristic: flag the first offender only.
  const tokenRe = /[A-Za-z0-9+/=_\-]{20,}/g;
  let tm: RegExpExecArray | null;
  while ((tm = tokenRe.exec(text)) !== null) {
    if (shannonEntropy(tm[0]) >= ENTROPY_THRESHOLD) {
      findings.push(
        `high-entropy token (${tm[0].length} chars): ${JSON.stringify(tm[0].slice(0, 20))}…`,
      );
      break;
    }
  }
  return findings;
}
