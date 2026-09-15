// tests/antigravity-config-hook.test.ts
//
// L3 in-process integration: spawn the Antigravity PreInvocation hook with
// camelCase stdin and assert its exit code and stdout. The contract under test
// is the one the hook exists for — an invalid `.team/config.json` is reported
// as an `injectSteps` ephemeral message and the prompt proceeds, while an
// absent or valid config is silent. The hook never blocks: every path exits 0
// and writes nothing to stderr.
//
// A companion test parses the root `hooks.json` for the registered handler. The
// root file is Antigravity's registration surface; Codex registers through
// `.codex-plugin/plugin.json` -> `./hooks/hooks.json` (a subdirectory), so the
// two hosts read different files.

import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const HOOK = join(ROOT, "hooks", "antigravity", "validate-team-config.mjs");
const ROOT_HOOKS_JSON = join(ROOT, "hooks.json");
const CODEX_MANIFEST = join(ROOT, ".codex-plugin", "plugin.json");

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), "team-antigravity-config-"));
  roots.push(dir);
  return dir;
}

function writeConfig(dir: string, body: string): string {
  mkdirSync(join(dir, ".team"), { recursive: true });
  const path = join(dir, ".team", "config.json");
  writeFileSync(path, body);
  return path;
}

function runHook(dir: string | null) {
  return spawnSync("node", [HOOK], {
    input: JSON.stringify({
      conversationId: "conversation-1",
      workspacePaths: dir ? [dir] : [],
      transcriptPath: "/tmp/transcript",
      artifactDirectoryPath: "/tmp/artifacts",
      modelName: "flash",
      invocationNum: 1,
      initialNumSteps: 0,
    }),
    encoding: "utf8",
  });
}

describe("antigravity validate-team-config hook", () => {
  test("an invalid config injects an ephemeral message and exits 0", () => {
    const dir = project();
    const path = writeConfig(dir, "{");
    const result = runHook(dir);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const parsed = JSON.parse(result.stdout);
    expect(parsed.injectSteps).toHaveLength(1);
    expect(parsed.injectSteps[0].ephemeralMessage).toContain(path);
    expect(parsed.injectSteps[0].ephemeralMessage).toContain("not valid JSON");
  });

  test("a schema violation reports the reason and exits 0", () => {
    const dir = project();
    writeConfig(dir, JSON.stringify({ codex: { opus: { model: "opus" } } }));
    const result = runHook(dir);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.injectSteps[0].ephemeralMessage).toContain("Codex needs a concrete model ID");
  });

  test("an absent config is silent and exits 0", () => {
    const result = runHook(project());
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  test("a valid config is silent and exits 0", () => {
    const dir = project();
    writeConfig(dir, JSON.stringify({ codex: { opus: { model: "gpt-6-astra", reasoning_effort: "high" } } }));
    const result = runHook(dir);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  test("an empty workspacePaths list is silent and exits 0", () => {
    const result = runHook(null);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });
});

describe("antigravity hook registration", () => {
  test("the root hooks.json registers the PreInvocation handler", () => {
    const hooks = JSON.parse(readFileSync(ROOT_HOOKS_JSON, "utf8"));
    const handler = hooks.team.PreInvocation[0];
    expect(handler.type).toBe("command");
    expect(handler.command).toBe("node hooks/antigravity/validate-team-config.mjs");
    expect(handler.timeout).toBe(30);
  });

  test("the root hooks.json does not collide with the Codex hook file", () => {
    const manifest = JSON.parse(readFileSync(CODEX_MANIFEST, "utf8"));
    expect(manifest.hooks).toBe("./hooks/hooks.json");
    expect(manifest.hooks).not.toBe("./hooks.json");
  });
});
