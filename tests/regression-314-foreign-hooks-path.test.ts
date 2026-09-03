// Regression test for issue #314. A hooks surface Team cannot own must not
// abort the plugin install. The pull hook re-runs the Claude installer after a
// pull; nothing about installing a harness depends on it, so its absence skips
// loudly and the install proceeds (principle-optimization-never-dependency).
//
// Real Git is the subject here: the bug is what `git rev-parse --git-path
// hooks` reports under a `core.hooksPath` that resolves outside the clone.

import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const HARNESSES = ["claude", "codex", "antigravity"] as const;
const COPIED_SCRIPTS = [
  "dev-install",
  "dev-install-claude-pull-hook",
] as const;
const tempDirs: string[] = [];

type Fixture = { root: string; checkout: string; home: string };

// Hermetic Git: the machine's own global config may set `core.hooksPath`, which
// is the very condition under test. Neutralize it so each case sets it itself.
const HERMETIC_GIT = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
} as const;

function run(cwd: string, command: string, args: string[], home?: string) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...HERMETIC_GIT, ...(home ? { HOME: home } : {}) },
  });
  return {
    status: result.status ?? -1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}`,
  };
}

function git(cwd: string, ...args: string[]) {
  const result = run(cwd, "git", args);
  if (result.status !== 0) throw new Error(result.output);
  return result.output.trim();
}

function writeExecutable(path: string, contents: string) {
  writeFileSync(path, contents);
  chmodSync(path, 0o755);
}

function newFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), `team-hooks-path-${process.pid}-`));
  tempDirs.push(root);
  const checkout = join(root, "checkout");
  const home = join(root, "home");

  mkdirSync(join(checkout, "script"), { recursive: true });
  mkdirSync(home);
  git(checkout, "init", "-q", "-b", "main");
  git(checkout, "config", "user.email", "test@example.com");
  git(checkout, "config", "user.name", "Test");

  for (const script of COPIED_SCRIPTS) {
    writeExecutable(
      join(checkout, "script", script),
      readFileSync(join(REPO_ROOT, "script", script), "utf8"),
    );
  }
  // Each harness installer records that it ran, so "nothing installed" — the
  // reported symptom — is directly observable.
  for (const harness of HARNESSES) {
    writeExecutable(
      join(checkout, "script", `dev-install-${harness}`),
      `#!/usr/bin/env bash\nprintf "%s\\n" "${harness}" >> "${join(root, "install-calls")}"\n`,
    );
  }
  writeFileSync(join(checkout, "VERSION"), "one\n");
  git(checkout, "add", "-A");
  git(checkout, "commit", "-q", "-m", "initial");

  return { root, checkout, home };
}

function install(fixture: Fixture, ...args: string[]) {
  return run(
    fixture.checkout,
    join(fixture.checkout, "script", "dev-install"),
    args,
    fixture.home,
  );
}

function installCalls(fixture: Fixture): string[] {
  const path = join(fixture.root, "install-calls");
  return existsSync(path)
    ? readFileSync(path, "utf8").trim().split("\n").filter(Boolean)
    : [];
}

function cloneHook(fixture: Fixture, name: "post-merge" | "post-rewrite") {
  return join(fixture.checkout, ".git", "hooks", name);
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("dev install: an unownable hooks surface never blocks the install (#314)", () => {
  test("a hooks path outside the clone skips the pull hooks and installs every harness", () => {
    const fixture = newFixture();
    const foreignHooks = join(fixture.root, "shared-hooks");
    git(fixture.checkout, "config", "core.hooksPath", foreignHooks);

    const result = install(fixture);

    expect(result.status).toBe(0);
    expect(installCalls(fixture)).toEqual([...HARNESSES]);
    // The foreign hooks path is preserved: Team writes nothing into it.
    expect(existsSync(foreignHooks)).toBe(false);
    // Skip loudly: name what was skipped, why, and how to get it back.
    expect(result.output).toContain("outside this clone");
    expect(result.output).toContain(foreignHooks);
    expect(result.output).toContain("Skipped");
    // The remedy echoes the command the user typed. Which harness a pull can
    // strand is an implementation detail, so no harness name reaches the user.
    expect(result.output).toContain("re-run 'script/dev-install' after each");
    for (const harness of HARNESSES) {
      expect(result.output.toLowerCase()).not.toContain(harness);
    }
  });

  test("an existing unmanaged hook is preserved and still installs every harness", () => {
    const fixture = newFixture();
    const userHook = "#!/bin/sh\necho user-hook\n";
    writeExecutable(cloneHook(fixture, "post-merge"), userHook);

    const result = install(fixture);

    expect(result.status).toBe(0);
    expect(installCalls(fixture)).toEqual([...HARNESSES]);
    expect(readFileSync(cloneHook(fixture, "post-merge"), "utf8")).toBe(userHook);
    // All-or-nothing: one unownable hook leaves the sibling alone too.
    expect(existsSync(cloneHook(fixture, "post-rewrite"))).toBe(false);
    expect(result.output).toContain("not managed by Team");
    expect(result.output).toContain("Skipped");
  });

  // Positive control: the assertions above must be able to observe the
  // difference between "skipped" and "installed", or they prove nothing.
  test("an ownable hooks surface still installs the pull hooks", () => {
    const fixture = newFixture();

    const result = install(fixture);

    expect(result.status).toBe(0);
    expect(installCalls(fixture)).toEqual([...HARNESSES]);
    expect(existsSync(cloneHook(fixture, "post-merge"))).toBe(true);
    expect(existsSync(cloneHook(fixture, "post-rewrite"))).toBe(true);
    expect(result.output).not.toContain("Skipped");
  });
});
