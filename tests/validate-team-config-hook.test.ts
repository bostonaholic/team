// tests/validate-team-config-hook.test.ts
//
// L3 in-process integration: spawn the real UserPromptSubmit hook and assert
// its exit code and stderr. The contract under test is the one the hook exists
// for — an invalid `.team/config.json` stops the prompt (exit 2) with a message
// naming the file and the reason, an absent file stays valid, and validation
// never writes to stdout (which would inject context instead of blocking).
//
// The single-owner tripwire beside it is L2: the resolver and the hook must
// share `model-config.mjs` rather than each carrying the schema, so the two
// cannot drift.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const REPO_ROOT = join(import.meta.dir, "..");
const HOOK = join(REPO_ROOT, "hooks", "validate-team-config.mjs");
const RESOLVER = join(REPO_ROOT, "skills", "team", "references", "resolve-model.mjs");
const SHARED = join(REPO_ROOT, "skills", "team", "references", "model-config.mjs");

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), "team-config-hook-"));
  roots.push(dir);
  return dir;
}

function writeConfig(dir: string, body: string): string {
  mkdirSync(join(dir, ".team"), { recursive: true });
  const path = join(dir, ".team", "config.json");
  writeFileSync(path, body);
  return path;
}

function runHook(dir: string) {
  return spawnSync("node", [HOOK], {
    input: JSON.stringify({ cwd: dir, hook_event_name: "UserPromptSubmit" }),
    encoding: "utf8",
  });
}

describe("validate-team-config hook", () => {
  test("an absent config is valid and silent", () => {
    const result = runHook(project());
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  test("a valid config passes", () => {
    const dir = project();
    writeConfig(dir, JSON.stringify({ codex: { opus: { model: "gpt-6-astra", reasoning_effort: "high" } } }));
    const result = runHook(dir);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("malformed JSON blocks the prompt and names the file", () => {
    const dir = project();
    const path = writeConfig(dir, "{");
    const result = runHook(dir);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(path);
    expect(result.stderr).toContain("not valid JSON");
  });

  test("a schema violation blocks the prompt with the reason", () => {
    const dir = project();
    writeConfig(dir, JSON.stringify({ codex: { opus: { model: "opus" } } }));
    const result = runHook(dir);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Codex needs a concrete model ID");
  });

  test("blocking goes through stderr and exit 2, never stdout", () => {
    const dir = project();
    writeConfig(dir, JSON.stringify({ nope: {} }));
    const result = runHook(dir);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("unsupported host");
  });
});

describe("config schema has one owner", () => {
  test("the resolver and the hook both import the shared validator", () => {
    const resolver = readFileSync(RESOLVER, "utf8");
    const hook = readFileSync(HOOK, "utf8");
    expect(resolver).toContain("./model-config.mjs");
    expect(hook).toContain("model-config.mjs");
    // The resolver must not carry its own copy of the schema.
    expect(resolver).not.toContain("function validateConfig");
  });

  test("the shared module exports validateConfig", () => {
    const shared = readFileSync(SHARED, "utf8");
    expect(shared).toContain("export function validateConfig");
  });
});
