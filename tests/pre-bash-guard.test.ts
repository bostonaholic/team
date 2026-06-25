// tests/pre-bash-guard.test.ts
//
// L3 subprocess tests for the runtime PreToolUse hook hooks/pre-bash-guard.mjs.
// The hook reads {tool_input:{command}} from stdin and, for a dangerous command,
// emits a permissionDecision:"ask" payload; otherwise it passes through
// silently. It always exits 0 (fail-open). Driven as a real subprocess so the
// guard's actual behavior — not its prose — is pinned. Free, fast, gate-tier.

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const HOOK = join(REPO_ROOT, "hooks", "pre-bash-guard.mjs");

function runHook(input: unknown): { status: number | null; out: string } {
  const r = spawnSync("node", [HOOK], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
  });
  return { status: r.status, out: r.stdout ?? "" };
}

// True when the hook asks the user to confirm; asserts fail-open exit 0.
function asksFor(command: string): boolean {
  const { status, out } = runHook({ tool_name: "Bash", tool_input: { command } });
  expect(status).toBe(0); // the hook always fails open
  if (out.trim() === "") return false;
  const payload = JSON.parse(out);
  return payload?.hookSpecificOutput?.permissionDecision === "ask";
}

const DANGEROUS = [
  "rm -rf /",
  "rm -rf ~",
  "rm -fr /etc",
  "sudo rm -rf / --no-preserve-root",
  "psql -c 'DROP TABLE users'",
  "mysql -e 'drop database prod'",
  "git push --force origin main",
  "git push -f",
  "git reset --hard HEAD~3",
  "chmod 777 /usr/bin",
  "dd if=/dev/zero of=/dev/sda bs=1M",
  "mkfs.ext4 /dev/sdb1",
  ":(){ :|:& };:",
];

const SAFE = [
  "ls -la",
  "rm -rf ./build", // relative path, not / or ~
  "rm -rf node_modules",
  "git push origin main",
  "git commit -m 'wip'",
  "chmod 644 file.txt",
  "echo hello",
];

describe("pre-bash-guard.mjs: dangerous commands prompt for confirmation", () => {
  for (const cmd of DANGEROUS) {
    test(`asks: ${cmd}`, () => {
      expect(asksFor(cmd)).toBe(true);
    });
  }
});

describe("pre-bash-guard.mjs: safe commands pass through", () => {
  for (const cmd of SAFE) {
    test(`allows: ${cmd}`, () => {
      expect(asksFor(cmd)).toBe(false);
    });
  }
});

describe("pre-bash-guard.mjs: payload shape and fail-open edges", () => {
  test("the ask payload carries the blocking reason in systemMessage", () => {
    const { out } = runHook({
      tool_name: "Bash",
      tool_input: { command: "rm -rf /" },
    });
    const payload = JSON.parse(out);
    expect(payload.hookSpecificOutput.permissionDecision).toBe("ask");
    expect(payload.systemMessage).toMatch(/recursive forced deletion/i);
  });

  test("non-Bash input (no command string) passes through silently", () => {
    const r = runHook({ tool_name: "Read", tool_input: { file_path: "/etc/passwd" } });
    expect(r.status).toBe(0);
    expect(r.out.trim()).toBe("");
  });

  test("malformed stdin fails open (exit 0, no output)", () => {
    const r = runHook("this is not json {");
    expect(r.status).toBe(0);
    expect(r.out.trim()).toBe("");
  });
});
