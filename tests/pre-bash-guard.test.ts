// tests/pre-bash-guard.test.ts
//
// L3 subprocess check: hooks/pre-bash-guard.mjs is the mechanical backstop
// behind the pr-cleanup / worktree teardown skills. The destructive commands
// those skills emit must surface as an "ask" permission decision — a
// mis-generated deletion prompts the user instead of executing silently —
// while benign commands pass through with no output.

import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const HOOK = join(process.cwd(), "hooks", "pre-bash-guard.mjs");

// Run the hook exactly as Claude Code does: JSON on stdin, decision on
// stdout. An empty stdout means the command was allowed.
function hookOutput(command: string): string {
  return execFileSync("node", [HOOK], {
    encoding: "utf-8",
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
  });
}

function decision(command: string): string | undefined {
  const out = hookOutput(command);
  if (out === "") return undefined;
  return JSON.parse(out)?.hookSpecificOutput?.permissionDecision;
}

// Both the bare form and the skill's `git -C "$PRIMARY_ROOT"` anchored
// form must match — the skills only ever emit the anchored form.
const guarded = [
  `git branch -D feature/x`,
  `git -C "$PRIMARY_ROOT" branch -D -- "$BRANCH"`,
  `git push origin --delete stale-branch`,
  `git -C "$PRIMARY_ROOT" push origin --delete -- "$BRANCH"`,
  `git worktree remove ../wt --force`,
  `git -C "$PRIMARY_ROOT" worktree remove --force "$WORKTREE_PATH"`,
  // The skills' current sinks expand with :? — the guard must match
  // the exact form the fenced blocks instruct the agent to emit.
  `git -C "\${PRIMARY_ROOT:?}" branch -D -- "\${BRANCH:?}"`,
  `git -C "\${PRIMARY_ROOT:?}" push origin --delete -- "\${BRANCH:?}"`,
  `git -C "\${PRIMARY_ROOT:?}" worktree remove --force "\${WORKTREE_PATH:?}"`,
  `rm -rf "\${PRIMARY_ROOT:?}/docs/plans/\${ID:?}"`,
  `rm -rf "$WORKTREE_PATH"`,
  // A quoted repo path with a space must not void the -C group —
  // \S+ alone cannot span it, and a failed optional group is a MISS.
  `git -C "/Users/x/My Repo" branch -D -- b`,
  `git -C '/Users/x/My Repo' branch -D -- b`,
  `git -C "/Users/x/My Repo" push origin --delete -- b`,
  `git -C "/Users/x/My Repo" worktree remove --force /p`,
  // `--delete --force` is the long spelling of -D.
  `git branch --delete --force old-branch`,
  `git -C /repo branch --delete --force b`,
  `git branch --force --delete old-branch`,
];

describe("pre-bash-guard: the emitted payload passes Claude Code's schema", () => {
  // Regression pin. The guard shipped without `hookEventName`, which the
  // hook output schema requires. Claude Code rejected the whole payload
  // ("hookSpecificOutput is missing required field") and DISCARDED the
  // decision, so a matched dangerous command ran with no prompt — the guard
  // failed open while every assertion below on permissionDecision stayed
  // green. Asserting the decision alone cannot catch that; the envelope has
  // to be checked too.
  test("carries hookEventName so the decision is not discarded", () => {
    const payload = JSON.parse(hookOutput("rm -rf /"));
    expect(payload.hookSpecificOutput.hookEventName).toBe("PreToolUse");
  });

  // Every guarded command must emit a valid envelope, not just the one above.
  test("carries hookEventName on every guarded command", () => {
    for (const command of guarded) {
      const payload = JSON.parse(hookOutput(command));
      expect(payload.hookSpecificOutput.hookEventName).toBe("PreToolUse");
    }
  });
});

describe("pre-bash-guard: teardown deletion commands surface as ask", () => {
  for (const command of guarded) {
    test(`asks on: ${command}`, () => {
      expect(decision(command)).toBe("ask");
    });
  }
});

describe("pre-bash-guard: safe neighbors of the guarded commands pass", () => {
  const allowed = [
    `git branch -d merged-branch`,
    `git branch --delete merged-branch`,
    `git -C "/Users/x/My Repo" branch -d merged-branch`,
    `git push origin main`,
    `git worktree remove ../wt`,
    `git -C "/Users/x/My Repo" worktree remove ../wt`,
    `git worktree list --porcelain`,
    `git status --porcelain`,
    `rm -rf node_modules`,
    `rm -f "$FILE"`,
    `rm -r "$DIR"`,
  ];

  for (const command of allowed) {
    test(`allows: ${command}`, () => {
      expect(decision(command)).toBeUndefined();
    });
  }
});
