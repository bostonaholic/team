// tests/dev-install-codex.test.ts
//
// Acceptance tests for the Codex half of the dev install,
// `script/dev-install-codex` and `script/dev-uninstall-codex`.
//
// Two layers:
//
// - L2 forbidden-pattern tripwire: the Codex scripts must NEVER
//   reference Codex's `plugins/cache` path. The Claude Code dev-install
//   trick — replacing the plugin cache dir with a symlink to the checkout —
//   makes Codex report the plugin `not installed` and drops the catalog to
//   zero skills. Porting it would silently break the install.
//
// - L3 subprocess-snapshot: both scripts derive their target from
//   `${HOME}/.agents/skills`, so every test isolates with HOME=<tempdir>.
//   The target's parent is often a checkout the user owns (a dotfiles
//   repo), so the scripts must touch only the one symlink they create.
//   Nothing here drives the real `codex` binary; the catalog is Codex's
//   concern, not this pair's.

import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const INSTALL = join(REPO_ROOT, "script", "dev-install-codex");
const UNINSTALL = join(REPO_ROOT, "script", "dev-uninstall-codex");

const tempDirs: string[] = [];

function newHome(): string {
  const dir = mkdtempSync(join(tmpdir(), `codex-dev-${process.pid}-`));
  tempDirs.push(dir);
  return dir;
}

/**
 * Put a fake `codex` first on PATH that prints `output` for any invocation.
 * The scripts shell out to `codex plugin list`; the real binary is not the
 * subject here, so it is stubbed at the boundary. Returns the dir to prepend.
 */
function stubCodex(home: string, output: string): string {
  const binDir = join(home, "stub-bin");
  mkdirSync(binDir, { recursive: true });
  const stub = join(binDir, "codex");
  writeFileSync(stub, `#!/usr/bin/env bash\nprintf '%b\\n' "${output}"\n`);
  chmodSync(stub, 0o755);
  return binDir;
}

/** Run a script with an isolated HOME. Never touches the real one. */
function run(script: string, home: string, pathPrefix?: string) {
  const result = spawnSync("bash", [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      ...(pathPrefix
        ? { PATH: `${pathPrefix}:${process.env.PATH ?? ""}` }
        : {}),
    },
  });
  return {
    status: result.status ?? -1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}`,
  };
}

const teamLink = (home: string) => join(home, ".agents", "skills", "team");

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { force: true, recursive: true });
});

describe("dev install: codex harness", () => {
  test("L2 tripwire: never reference Codex's plugin cache", () => {
    const scripts = [INSTALL, UNINSTALL].filter((path) => existsSync(path));
    // Guard against a vacuous pass if the scripts are ever renamed.
    expect(scripts.length).toBe(2);
    for (const path of scripts) {
      expect(readFileSync(path, "utf8")).not.toContain("plugins/cache");
    }
  });

  test("install links skills/ into the Codex skill root", () => {
    const home = newHome();
    const { status, output } = run(INSTALL, home);

    expect(status).toBe(0);
    expect(output).toContain("Linked:");
    expect(lstatSync(teamLink(home)).isSymbolicLink()).toBe(true);
    expect(readlinkSync(teamLink(home))).toBe(join(REPO_ROOT, "skills"));
  });

  test("install announces that Codex ignores disable-model-invocation", () => {
    // pr-approve-watch installs like any other skill here, so the run has to
    // say that its approval can merge a PR — the guard it relies on is
    // honored by Claude Code and ignored by Codex.
    const { output } = run(INSTALL, newHome());
    expect(output).toContain("pr-approve-watch");
    expect(output).toContain("disable-model-invocation");
  });

  // Stacking the dev symlink on a native plugin install makes Codex find the
  // same 51 skills under two roots and render every one twice — a doubled
  // catalog, worse truncation, and an ambiguous source. The guard reads the
  // STATUS column, so a registered-but-uninstalled marketplace row is fine.
  test("install aborts when a Codex plugin install is already present", () => {
    const home = newHome();
    const stub = stubCodex(
      home,
      "PLUGIN         STATUS              VERSION  PATH\\nteam@team-dev  installed, enabled  0.29.1   /somewhere",
    );

    const { status, output } = run(INSTALL, home, stub);

    expect(status).not.toBe(0);
    expect(output).toContain("already present");
    expect(existsSync(teamLink(home))).toBe(false);
  });

  test("install proceeds past a registered-but-uninstalled plugin row", () => {
    const home = newHome();
    const stub = stubCodex(
      home,
      "PLUGIN         STATUS         VERSION  PATH\\nteam@team-dev  not installed           /somewhere",
    );

    const { status } = run(INSTALL, home, stub);

    expect(status).toBe(0);
    expect(lstatSync(teamLink(home)).isSymbolicLink()).toBe(true);
  });

  test("install is idempotent", () => {
    const home = newHome();
    expect(run(INSTALL, home).status).toBe(0);

    const second = run(INSTALL, home);
    expect(second.status).toBe(0);
    expect(second.output).toContain("already installed");
    expect(readlinkSync(teamLink(home))).toBe(join(REPO_ROOT, "skills"));
  });

  test("install refuses to replace a target it did not create", () => {
    const home = newHome();
    const target = teamLink(home);
    mkdirSync(target, { recursive: true });
    const userFile = join(target, "USER_DATA.md");
    writeFileSync(userFile, "not ours\n");

    const { status, output } = run(INSTALL, home);

    expect(status).not.toBe(0);
    expect(output).toContain("not a symlink");
    expect(readFileSync(userFile, "utf8")).toBe("not ours\n");
  });

  test("uninstall removes the link and leaves its parents alone", () => {
    const home = newHome();
    expect(run(INSTALL, home).status).toBe(0);

    const { status, output } = run(UNINSTALL, home);

    expect(status).toBe(0);
    expect(output).toContain("Removed:");
    expect(existsSync(teamLink(home))).toBe(false);
    // The parents can be a user-owned dotfiles checkout — never removed.
    expect(existsSync(join(home, ".agents", "skills"))).toBe(true);
  });

  test("uninstall is idempotent and refuses a foreign target", () => {
    const home = newHome();
    const absent = run(UNINSTALL, home);
    expect(absent.status).toBe(0);
    expect(absent.output).toContain("Nothing to do");

    const target = teamLink(home);
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "USER_DATA.md"), "not ours\n");

    const foreign = run(UNINSTALL, home);
    expect(foreign.status).not.toBe(0);
    expect(foreign.output).toContain("not a symlink");
    expect(existsSync(join(target, "USER_DATA.md"))).toBe(true);
  });
});
