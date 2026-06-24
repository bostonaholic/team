#!/usr/bin/env node

/**
 * Claude Code version gate for nested sub-agent dispatch.
 *
 * Sub-agents spawning their own sub-agents is a Claude Code >= 2.1.172
 * capability. Below that floor the `Agent` tool is simply absent from a
 * sub-agent's toolset, so a nesting-enabled pipeline agent must check the
 * running version before its first nested dispatch and fall back to inline
 * work when the floor is not met.
 *
 * The pure comparison core (`parseVersion`, `meetsMinimum`) is unit-tested at
 * L1; the CLI below is what a pipeline agent runs via Bash:
 *
 *     node "${CLAUDE_PLUGIN_ROOT}/skills/nested-agents/supports-nesting.mjs" "$(claude --version)"
 *
 * It prints `supported` (exit 0) or `unsupported` (exit 1). Fail-closed:
 * anything that does not provably parse to a version >= MIN_VERSION — an
 * older release, malformed output, or a missing argument — is treated as
 * unsupported, so the agent degrades to its inline path rather than
 * attempting a dispatch that cannot work.
 */

import { pathToFileURL } from "node:url";

/** The Claude Code release that introduced nested sub-agents. Single source of truth. */
export const MIN_VERSION = "2.1.172";

/**
 * Extract the first dotted MAJOR.MINOR.PATCH triple from arbitrary text such
 * as `claude --version` output ("2.1.185 (Claude Code)"). Returns a numeric
 * [major, minor, patch] tuple, or null when no triple is present.
 */
export function parseVersion(raw) {
  if (typeof raw !== "string") return null;
  const m = raw.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * True only when `raw` parses to a version >= `min`. Fail-closed: returns
 * false on any input that cannot be parsed.
 */
export function meetsMinimum(raw, min = MIN_VERSION) {
  const current = parseVersion(raw);
  const floor = parseVersion(min);
  if (!current || !floor) return false;
  for (let i = 0; i < 3; i++) {
    if (current[i] > floor[i]) return true;
    if (current[i] < floor[i]) return false;
  }
  return true; // exactly equal
}

// CLI entry point — runs only when executed directly, not when imported by a
// test. process.argv[1] is the test runner under `bun test`, so the import is
// side-effect free.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const supported = meetsMinimum(process.argv[2] ?? "");
  process.stdout.write(supported ? "supported\n" : "unsupported\n");
  process.exit(supported ? 0 : 1);
}
