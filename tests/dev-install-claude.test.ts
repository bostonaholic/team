// tests/dev-install-claude.test.ts
//
// Acceptance tests for `script/dev-install-claude`'s cache hygiene.
//
// Claude Code installs a plugin under a path that carries its version, so
// every version ever installed from a checkout leaves a directory behind:
// eighteen of them, several gigabytes' worth over a project's life, plus the
// occasional stale symlink from an older dev install. The installer prunes
// them, keeping only the version it just installed and any other install
// Claude still reports.
//
// L3 subprocess-snapshot. HOME is a tempdir and the fake `claude` from
// tests/helpers/fake-claude.ts is first on PATH. Idempotency and marketplace
// refusal are covered by tests/regression-309-idempotent-install.test.ts.

import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeFakeClaude } from "./helpers/fake-claude";

const REPO_ROOT = join(import.meta.dir, "..");
const INSTALL = join(REPO_ROOT, "script", "dev-install-claude");
const VERSION: string = JSON.parse(
  readFileSync(join(REPO_ROOT, ".claude-plugin", "plugin.json"), "utf8"),
).version;

const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { force: true, recursive: true });
});

function newHome(): string {
  const home = mkdtempSync(join(tmpdir(), `claude-prune-${process.pid}-`));
  tempDirs.push(home);
  writeFakeClaude(home);
  return home;
}

function run(home: string) {
  const result = spawnSync("bash", [INSTALL], {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      PATH: `${join(home, "bin")}:${process.env.PATH ?? ""}`,
      PLUGIN_VERSION: VERSION,
    },
  });
  return {
    status: result.status ?? -1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}`,
  };
}

const cacheRoot = (home: string) =>
  join(home, ".claude", "plugins", "cache", "team-dev", "team");

function plantStaleCopy(home: string, version: string) {
  const dir = join(cacheRoot(home), version);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "marker"), `${version}\n`);
  return dir;
}

describe("dev install: claude cache hygiene", () => {
  test("stale version directories are pruned", () => {
    const home = newHome();
    plantStaleCopy(home, "0.62.0");
    plantStaleCopy(home, "0.87.0");

    const { status, output } = run(home);

    expect(status).toBe(0);
    expect(existsSync(join(cacheRoot(home), "0.62.0"))).toBe(false);
    expect(existsSync(join(cacheRoot(home), "0.87.0"))).toBe(false);
    expect(output).toContain("0.62.0");
    expect(output).toContain("0.87.0");
    expect(readlinkSync(join(cacheRoot(home), VERSION))).toBe(REPO_ROOT);
  });

  // The stale entry left by an older dev install is a symlink into the
  // checkout. Pruning must unlink it, never descend it.
  test("a stale symlink into the checkout is unlinked, not followed", () => {
    const home = newHome();
    mkdirSync(cacheRoot(home), { recursive: true });
    symlinkSync(REPO_ROOT, join(cacheRoot(home), "0.81.0"));

    expect(run(home).status).toBe(0);

    expect(lstatSync(join(cacheRoot(home), "0.81.0"), { throwIfNoEntry: false })).toBeUndefined();
    expect(existsSync(join(REPO_ROOT, "skills", "team", "SKILL.md"))).toBe(true);
    expect(existsSync(join(REPO_ROOT, ".claude-plugin", "plugin.json"))).toBe(true);
  });

  test("the installed version is never pruned", () => {
    const home = newHome();
    expect(run(home).status).toBe(0);

    const second = run(home);

    expect(second.status).toBe(0);
    expect(lstatSync(join(cacheRoot(home), VERSION)).isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(cacheRoot(home), VERSION))).toBe(REPO_ROOT);
  });

  test("a version Claude still reports installed is kept", () => {
    const home = newHome();
    const kept = plantStaleCopy(home, "0.0.1");
    // Claude reports 0.0.1 as installed, so the installer updates rather than
    // installs — and must not delete the directory Claude is still serving
    // from until the update has moved off it.
    mkdirSync(join(home, "state"), { recursive: true });
    writeFileSync(join(home, "state", "marketplace-path"), REPO_ROOT);
    writeFileSync(join(home, "state", "installed-version"), "0.0.1");

    const { status } = run(home);

    expect(status).toBe(0);
    // The update moved the install to the current version, so 0.0.1 is stale
    // by the time the prune runs.
    expect(existsSync(kept)).toBe(false);
    expect(readlinkSync(join(cacheRoot(home), VERSION))).toBe(REPO_ROOT);
  });
});
