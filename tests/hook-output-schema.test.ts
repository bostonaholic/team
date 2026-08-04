// tests/hook-output-schema.test.ts
//
// L2 tripwire: a hook that writes a `hookSpecificOutput` payload to STDOUT
// must name its event in `hookEventName`.
//
// Claude Code schema-validates hook JSON on stdout. A payload missing
// `hookEventName` fails validation and the decision inside it is DISCARDED —
// so a PreToolUse guard that meant to block silently fails open. The failure
// is invisible to a test that only asserts the decision field, because the
// hook still emits it; only the harness rejects the envelope.
//
// Payloads written to STDERR are not schema-validated (that path carries
// context/warnings, not decisions), so those hooks are out of scope here.

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const HOOK_DIRS = [
  join(process.cwd(), "hooks"),
  join(process.cwd(), ".claude", "hooks"),
];

function hookFiles(): string[] {
  return HOOK_DIRS.flatMap((dir) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return [];
    }
    return entries.filter((f) => f.endsWith(".mjs")).map((f) => join(dir, f));
  });
}

describe("hook output schema: stdout payloads name their event", () => {
  const files = hookFiles();

  test("there are hook files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const source = readFileSync(file, "utf-8");
    const writesPayloadToStdout =
      source.includes("hookSpecificOutput") &&
      source.includes("process.stdout.write");

    test.if(writesPayloadToStdout)(
      `${file.replace(process.cwd() + "/", "")} sets hookEventName`,
      () => {
        expect(source).toContain("hookEventName");
      },
    );
  }
});
