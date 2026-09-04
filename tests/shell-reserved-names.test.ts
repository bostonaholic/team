// tests/shell-reserved-names.test.ts
//
// L2 tripwire: shell a skill or agent tells the runner to execute must never
// assign to `status`.
//
// `status` is a read-only special parameter in zsh (an alias for `?`). Every
// assignment form aborts the script:
//
//   $ zsh -c 'true; status=$?'
//   zsh:1: read-only variable: status
//
// bash accepts the same line, so the instruction reads fine to whoever wrote
// it and fails only on the hosts whose Bash tool runs zsh. That is how
// `status=$?` shipped in shipit's land sequence (#332): the backgrounded CI
// watch died on its first line having watched nothing, and the exit code the
// merge decision reads was never captured.
//
// `tests/shipit-skill.test.ts` pins that one call site by name. This sweep is
// the general form — every shell fence in every skill and agent, so the next
// author to reach for `status=$?` in a different procedure is stopped at the
// same layer rather than after a land run dies.
//
// Only `status` is banned. Its siblings were probed rather than assumed —
// `PIPESTATUS=1` and `pipestatus=(0)` both succeed in zsh, so banning them
// would assert a constraint the shell does not enforce.

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

// Prose a model reads and then executes. Human-facing docs are out of scope:
// nothing runs them.
const SCAN_ROOTS = [
  join(ROOT, "skills"),
  join(ROOT, "agents"),
  join(ROOT, ".claude", "skills"),
];

const SHELL_LANGUAGES = new Set(["bash", "sh", "shell", "zsh", "console"]);

// Every form that binds the name, not only `NAME=value`: zsh refuses
// `export`, `local`, `typeset`, and `read` on a read-only parameter too.
const ASSIGNS_STATUS =
  /^\s*(?:(?:export|local|typeset|declare|readonly)\s+)?status(?:=|\+=)|^\s*read\s+(?:-\w+\s+)*status\b/;

function markdownFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return markdownFiles(path);
    return path.endsWith(".md") ? [path] : [];
  });
}

// Lines inside ```bash / ```sh / ```shell / ```zsh / ```console fences, paired
// with their 1-indexed line number in the file.
function shellLines(source: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  let inShellBlock = false;
  source.split("\n").forEach((text, index) => {
    const fence = text.match(/^\s*```+\s*(\w*)/);
    if (fence) {
      inShellBlock = inShellBlock ? false : SHELL_LANGUAGES.has(fence[1] ?? "");
      return;
    }
    if (inShellBlock) out.push({ line: index + 1, text });
  });
  return out;
}

function violations(source: string): { line: number; text: string }[] {
  return shellLines(source).filter(({ text }) => ASSIGNS_STATUS.test(text));
}

describe("shell reserved names: no assignment to zsh's read-only `status`", () => {
  const files = SCAN_ROOTS.flatMap(markdownFiles);

  // Guard: a mis-scoped scan would pass every assertion below vacuously.
  test("the scan finds files with shell blocks in them", () => {
    expect(files.length).toBeGreaterThan(0);
    const withShell = files.filter((f) => shellLines(readFileSync(f, "utf8")).length > 0);
    expect(withShell.length).toBeGreaterThan(0);
  });

  // Positive control: prove the detector fires on a known-bad snippet before
  // trusting it to report the tree clean. docs/testing.md, "Prove a negative
  // check can find a positive".
  test("the detector fires on every assignment form", () => {
    const planted = [
      "```bash",
      "timeout 1800 gh pr checks 1 --watch",
      "status=$?",
      "export status=0",
      "local status=1",
      "read -r status",
      "```",
    ].join("\n");
    expect(violations(planted).length).toBe(4);

    // The accepted form, and a read of the parameter, must both stay clean.
    const clean = ["```bash", "WATCH_STATUS=$?", "echo \"$status\"", "```"].join("\n");
    expect(violations(clean).length).toBe(0);
  });

  for (const file of files) {
    const found = violations(readFileSync(file, "utf8"));
    test(`${relative(ROOT, file)} assigns no read-only name`, () => {
      expect(found.map((v) => `line ${v.line}: ${v.text.trim()}`)).toEqual([]);
    });
  }
});
