// Real-Git regression tests for issue #312. The hook trigger is the subject,
// so these fixtures perform actual merge-based and rebase-based pulls.

import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const INSTALL_SOURCE = join(REPO_ROOT, "script", "dev-install");
const UNINSTALL_SOURCE = join(REPO_ROOT, "script", "dev-uninstall");
const PULL_HOOK_SOURCE = join(
  REPO_ROOT,
  "script",
  "dev-install-claude-pull-hook",
);
const tempDirs: string[] = [];

type Fixture = {
  root: string;
  upstream: string;
  remote: string;
  checkout: string;
  home: string;
};

// Neutralize the developer's own Git config. Two reasons: a global commit hook
// manager costs ~0.9s per fixture commit, which alone times this suite out; and
// a global `core.hooksPath` would decide the very condition under test.
const HERMETIC_GIT = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
} as const;

function run(
  cwd: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...env, ...HERMETIC_GIT },
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
  const root = mkdtempSync(join(tmpdir(), `team-pull-hook-${process.pid}-`));
  tempDirs.push(root);
  const upstream = join(root, "upstream");
  const remote = join(root, "remote.git");
  const checkout = join(root, "checkout");
  const home = join(root, "home");

  mkdirSync(join(upstream, "script"), { recursive: true });
  mkdirSync(home);
  git(upstream, "init", "-q", "-b", "main");
  git(upstream, "config", "user.email", "test@example.com");
  git(upstream, "config", "user.name", "Test");
  writeExecutable(
    join(upstream, "script", "dev-install"),
    readFileSync(INSTALL_SOURCE, "utf8"),
  );
  writeExecutable(
    join(upstream, "script", "dev-uninstall"),
    readFileSync(UNINSTALL_SOURCE, "utf8"),
  );
  writeExecutable(
    join(upstream, "script", "dev-install-claude-pull-hook"),
    readFileSync(PULL_HOOK_SOURCE, "utf8"),
  );
  writeExecutable(
    join(upstream, "script", "dev-install-claude"),
    '#!/usr/bin/env bash\nprintf "install\\n" >> "$HOME/install-calls"\n',
  );
  writeExecutable(
    join(upstream, "script", "dev-uninstall-claude"),
    '#!/usr/bin/env bash\nprintf "uninstall\\n" >> "$HOME/uninstall-calls"\n',
  );
  writeFileSync(join(upstream, "VERSION"), "one\n");
  git(upstream, "add", "-A");
  git(upstream, "commit", "-q", "-m", "initial");
  git(root, "clone", "-q", "--bare", upstream, remote);
  git(root, "clone", "-q", remote, checkout);
  git(upstream, "remote", "add", "origin", remote);
  git(upstream, "config", "user.email", "test@example.com");
  git(upstream, "config", "user.name", "Test");
  git(checkout, "config", "user.email", "test@example.com");
  git(checkout, "config", "user.name", "Test");

  return { root, upstream, remote, checkout, home };
}

function fixtureEnv(fixture: Fixture): NodeJS.ProcessEnv {
  return { ...process.env, HOME: fixture.home };
}

function install(fixture: Fixture) {
  return run(
    fixture.checkout,
    join(fixture.checkout, "script", "dev-install"),
    ["claude"],
    fixtureEnv(fixture),
  );
}

function uninstall(fixture: Fixture) {
  return run(
    fixture.checkout,
    join(fixture.checkout, "script", "dev-uninstall"),
    ["claude"],
    fixtureEnv(fixture),
  );
}

function advanceUpstream(fixture: Fixture, version: string) {
  writeFileSync(join(fixture.upstream, "VERSION"), `${version}\n`);
  git(fixture.upstream, "add", "VERSION");
  git(fixture.upstream, "commit", "-q", "-m", `advance to ${version}`);
  git(fixture.upstream, "push", "-q", "origin", "main");
}

function installCalls(fixture: Fixture): string[] {
  const path = join(fixture.home, "install-calls");
  return existsSync(path)
    ? readFileSync(path, "utf8").trim().split("\n").filter(Boolean)
    : [];
}

function hookPath(fixture: Fixture, name: "post-merge" | "post-rewrite") {
  return join(fixture.checkout, ".git", "hooks", name);
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("dev install: refresh after pulls (#312)", () => {
  test("a merge-based pull reruns the Claude installer", () => {
    const fixture = newFixture();
    expect(install(fixture).status).toBe(0);
    expect(statSync(hookPath(fixture, "post-merge")).mode & 0o111).not.toBe(0);
    expect(installCalls(fixture)).toHaveLength(1);

    advanceUpstream(fixture, "two");
    const pull = run(
      fixture.checkout,
      "git",
      ["pull", "--ff-only"],
      fixtureEnv(fixture),
    );

    expect(pull.status).toBe(0);
    expect(installCalls(fixture)).toHaveLength(2);
  });

  test("a rebase-based pull reruns the Claude installer", () => {
    const fixture = newFixture();
    expect(install(fixture).status).toBe(0);
    expect(statSync(hookPath(fixture, "post-rewrite")).mode & 0o111).not.toBe(
      0,
    );

    writeFileSync(join(fixture.checkout, "local"), "local\n");
    git(fixture.checkout, "add", "local");
    git(fixture.checkout, "commit", "-q", "-m", "local change");
    advanceUpstream(fixture, "two");

    const pull = run(
      fixture.checkout,
      "git",
      ["pull", "--rebase"],
      fixtureEnv(fixture),
    );

    expect(pull.status).toBe(0);
    expect(installCalls(fixture)).toHaveLength(2);
  });

  test("reinstallation is idempotent and uninstall removes owned hooks", () => {
    const fixture = newFixture();
    expect(install(fixture).status).toBe(0);
    const first = readFileSync(hookPath(fixture, "post-merge"), "utf8");
    expect(first).toBe(
      readFileSync(
        join(fixture.checkout, "script", "dev-install-claude-pull-hook"),
        "utf8",
      ),
    );

    expect(install(fixture).status).toBe(0);
    expect(readFileSync(hookPath(fixture, "post-merge"), "utf8")).toBe(first);
    expect(uninstall(fixture).status).toBe(0);
    expect(existsSync(hookPath(fixture, "post-merge"))).toBe(false);
    expect(existsSync(hookPath(fixture, "post-rewrite"))).toBe(false);
  });

  // A hooks surface Team does not own is preserved, and the pull-hook refresh
  // is skipped — but the install itself proceeds. See #314 and
  // tests/regression-314-foreign-hooks-path.test.ts.
  test("an existing user hook is preserved and the install still runs", () => {
    const fixture = newFixture();
    const hook = hookPath(fixture, "post-merge");
    writeExecutable(hook, "#!/bin/sh\necho user-hook\n");

    const result = install(fixture);

    expect(result.status).toBe(0);
    expect(result.output).toContain("not managed by Team");
    expect(readFileSync(hook, "utf8")).toBe("#!/bin/sh\necho user-hook\n");
    expect(existsSync(hookPath(fixture, "post-rewrite"))).toBe(false);
    expect(installCalls(fixture)).toHaveLength(1);
  });

  test("a custom hooks path is preserved and the install still runs", () => {
    const fixture = newFixture();
    const customHooks = join(fixture.root, "shared-hooks");
    git(fixture.checkout, "config", "core.hooksPath", customHooks);

    const result = install(fixture);

    expect(result.status).toBe(0);
    expect(result.output).toContain("outside this clone");
    expect(existsSync(customHooks)).toBe(false);
    expect(installCalls(fixture)).toHaveLength(1);
  });
});
