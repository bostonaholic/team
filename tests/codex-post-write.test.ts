// tests/codex-post-write.test.ts
//
// L3 in-process integration: spawn the Codex PostToolUse hook with apply_patch
// stdin and assert its exit code and stderr. The contract under test is the one
// the hook exists for — a patch that adds or updates a malformed plugin file
// stops with exit 2 and a reason naming the file, while unrecognized headers,
// non-plugin paths, and paths outside the project pass untouched.
//
// The same file gates the Codex registration: hooks/hooks.json must bind the
// `apply_patch` matcher to this hook and bind UserPromptSubmit to the unchanged
// canonical config guard, which still blocks an invalid `.team/config.json`
// with exit 2. `tests/validate-team-config-hook.test.ts` remains the guard's
// own regression gate.

import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const HOOK = join(ROOT, "hooks", "codex", "post-write-validate.mjs");
const CONFIG_HOOK = join(ROOT, "hooks", "validate-team-config.mjs");
const HOOKS_JSON = join(ROOT, "hooks", "hooks.json");

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), "team-codex-post-"));
  roots.push(dir);
  return dir;
}

function patch(...lines: string[]): string {
  return ["*** Begin Patch", ...lines, "*** End Patch", ""].join("\n");
}

function addedFile(path: string, body: string): string[] {
  return [`*** Add File: ${path}`, ...body.split("\n").map((line) => `+${line}`)];
}

function runPatch(dir: string, text: string) {
  return spawnSync("node", [HOOK], {
    input: JSON.stringify({
      cwd: dir,
      hook_event_name: "PostToolUse",
      tool_name: "apply_patch",
      tool_input: { input: text },
    }),
    encoding: "utf8",
  });
}

describe("codex post-write-validate", () => {
  test("blocks a malformed added agent file with exit 2 naming the file", () => {
    const dir = project();
    const result = runPatch(dir, patch(...addedFile("agents/bad.md", "# no frontmatter")));
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("agents/bad.md");
    expect(result.stderr).toContain("YAML frontmatter");
  });

  test("blocks a malformed added SKILL.md with exit 2 ", () => {
    const dir = project();
    const result = runPatch(dir, patch(...addedFile("skills/bad/SKILL.md", "# no frontmatter")));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("skills/bad/SKILL.md");
    expect(result.stderr).toContain("SKILL.md must start with YAML frontmatter");
  });

  test("blocks invalid added JSON with exit 2 ", () => {
    const dir = project();
    const result = runPatch(dir, patch(...addedFile(".claude-plugin/bad.json", "{not json")));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(".claude-plugin/bad.json");
    expect(result.stderr).toContain("Invalid JSON");
  });

  test("blocks an added hook with invalid syntax with exit 2", () => {
    const dir = project();
    const result = runPatch(dir, patch(...addedFile("hooks/broken.mjs", "export const = ;")));
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("hooks/broken.mjs");
    expect(result.stderr).toContain("Syntax error");
  });

  test("accepts a well-formed added hook file", () => {
    const dir = project();
    const result = runPatch(dir, patch(...addedFile("hooks/ok.mjs", "export const ok = true;")));
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("accepts a well-formed added agent file", () => {
    const dir = project();
    const result = runPatch(dir, patch(...addedFile("agents/good.md", "---\nname: good\n---\nBody")));
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("validates an update against the file on disk", () => {
    const dir = project();
    mkdirSync(join(dir, "agents"), { recursive: true });
    writeFileSync(join(dir, "agents", "edited.md"), "# no frontmatter\n");
    const result = runPatch(dir, patch("*** Update File: agents/edited.md", "@@", "+more"));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("agents/edited.md");
  });

  test("unrecognized headers exit 0 without a block", () => {
    const dir = project();
    const result = runPatch(dir, patch("*** Delete File: agents/bad.md"));
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("non-plugin paths exit 0 without a block", () => {
    const dir = project();
    const result = runPatch(dir, patch(...addedFile("docs/notes.md", "# no frontmatter")));
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("paths outside the project exit 0 without a block", () => {
    const dir = project();
    const result = runPatch(dir, patch(...addedFile("../escape.md", "# no frontmatter")));
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("a bare string tool input is read as patch text", () => {
    const dir = project();
    const text = patch(...addedFile("agents/bad.md", "# no frontmatter"));
    const result = spawnSync("node", [HOOK], {
      input: JSON.stringify({ cwd: dir, tool_name: "apply_patch", tool_input: text }),
      encoding: "utf8",
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("agents/bad.md");
  });
});

describe("codex hook registration", () => {
  test("hooks/hooks.json binds apply_patch and the canonical config guard", () => {
    // Codex's `HooksFile` wraps the event map in a top-level `hooks` object
    // (codex-rs/config/src/hook_config.rs), unlike Claude's inline event map.
    const file = JSON.parse(readFileSync(HOOKS_JSON, "utf8"));
    const hooks = file.hooks;
    const post = hooks.PostToolUse.flatMap((entry: { hooks: { command: string }[] }) => entry.hooks);
    expect(post.some((hook: { command: string }) => hook.command.includes("hooks/codex/post-write-validate.mjs"))).toBe(true);
    expect(hooks.PostToolUse.some((entry: { matcher?: string }) => entry.matcher === "apply_patch")).toBe(true);
    const prompt = hooks.UserPromptSubmit.flatMap((entry: { hooks: { command: string }[] }) => entry.hooks);
    expect(prompt.some((hook: { command: string }) => hook.command === "node \"${PLUGIN_ROOT}/hooks/validate-team-config.mjs\"")).toBe(true);
  });

  test("the reused config guard blocks an invalid config with exit 2", () => {
    const dir = project();
    mkdirSync(join(dir, ".team"), { recursive: true });
    const path = join(dir, ".team", "config.json");
    writeFileSync(path, "{");
    const result = spawnSync("node", [CONFIG_HOOK], {
      input: JSON.stringify({ cwd: dir, hook_event_name: "UserPromptSubmit" }),
      encoding: "utf8",
    });
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(path);
    expect(result.stderr).toContain("not valid JSON");
  });
});
