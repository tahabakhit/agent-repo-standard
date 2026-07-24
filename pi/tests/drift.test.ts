/**
 * Version-drift guard for the Pi ambient declarations (pi/pi.d.ts).
 *
 * pi.d.ts is hand-maintained against a pinned pi-coding-agent dist. Pi moves
 * weekly, so this test asserts the events/APIs the extension depends on still
 * exist in the installed SDK's `dist/core/extensions/types.d.ts`. It resolves
 * the SDK from node_modules or a `PI_SDK_DIR` override and SKIPS when the SDK is
 * absent (offline CI, zero-dep checkout) — so it fails loudly only where the
 * real types are present and have drifted, never on a clean install.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(PI_DIR, "..");

/** Identifiers the extension + ambient rely on; drift here means regenerate pi.d.ts. */
const REQUIRED = [
  "resources_discover",
  "session_start",
  "before_agent_start",
  "BeforeAgentStartEventResult",
  "agent_settled",
  "tool_call",
  "registerTool",
  "sendUserMessage",
  "ModelRegistry",
];

function findSdkTypes(): string | null {
  const candidates = [
    process.env.PI_SDK_DIR
      ? join(process.env.PI_SDK_DIR, "dist/core/extensions/types.d.ts")
      : null,
    join(REPO, "node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts"),
  ].filter((p): p is string => p !== null);
  return candidates.find((p) => existsSync(p)) ?? null;
}

test("pi.d.ts: depended-on SDK identifiers still exist in the installed dist", (t) => {
  const typesPath = findSdkTypes();
  if (typesPath === null) {
    t.skip("pi-coding-agent SDK not installed (set PI_SDK_DIR to check locally)");
    return;
  }
  const src = readFileSync(typesPath, "utf8");
  for (const id of REQUIRED) {
    assert.ok(
      src.includes(id),
      `SDK types no longer mention "${id}" — pi.d.ts is out of date; regenerate it against the installed dist.`,
    );
  }
});
