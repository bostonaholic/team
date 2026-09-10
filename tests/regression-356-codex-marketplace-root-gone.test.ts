// Regression test for issue #356.
//
// Codex loads every configured marketplace before it lists anything, so a
// `team-dev` registration pointing at a deleted checkout fails both
// `codex plugin marketplace list --json` and `codex plugin list --json`: exit
// 1, the offending name and path on stderr, nothing on stdout. Both Codex dev
// scripts used to pipe that empty stdout straight into `node -e`, so the
// operator saw a JSON syntax error and a node stack and never learned which
// marketplace was broken or how to drop it.
//
// The facts this pins: the install names the broken root and the recovery
// command instead of a parse error, and the uninstall — the script someone
// reaches for in that state — completes the teardown rather than crashing.
//
// L3 subprocess-snapshot, matching tests/dev-install-codex.test.ts: an
// isolated HOME, the fake `codex` from tests/helpers/fake-codex.mjs on PATH,
// and a disposable copy of the plugin root, because the install stamps the
// manifest.

import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { makePluginFixture, type PluginFixture } from "./helpers/codex-plugin-fixture";

const REPO_ROOT = join(import.meta.dir, "..");
const FAKE_CODEX = join(REPO_ROOT, "tests", "helpers", "fake-codex.mjs");

const disposable: string[] = [];

afterAll(() => {
  for (const dir of disposable) rmSync(dir, { force: true, recursive: true });
});

function newFixture(): PluginFixture {
  const fixture = makePluginFixture();
  disposable.push(fixture.root);
  return fixture;
}

function newHome(): string {
  const home = mkdtempSync(join(tmpdir(), `regression-356-${process.pid}-`));
  disposable.push(home);
  return home;
}

function stubCodex(home: string): string {
  const binDir = join(home, "stub-bin");
  mkdirSync(binDir, { recursive: true });
  const stub = join(binDir, "codex");
  writeFileSync(stub, `#!/usr/bin/env bash\nexec node "${FAKE_CODEX}" "$@"\n`);
  chmodSync(stub, 0o755);
  return binDir;
}

function run(script: string, home: string) {
  const result = spawnSync("bash", [script], {
    encoding: "utf8",
    env: { ...process.env, HOME: home, PATH: `${stubCodex(home)}:${process.env.PATH ?? ""}` },
  });
  return {
    status: result.status ?? -1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}`,
  };
}

const cacheRoot = (home: string) =>
  join(home, ".codex", "plugins", "cache", "team-dev", "team");
const cachedVersions = (home: string) =>
  existsSync(cacheRoot(home)) ? readdirSync(cacheRoot(home)).sort() : [];

/**
 * Register `team-dev` from a throwaway checkout, then delete it — the state a
 * merged-and-removed worktree leaves behind.
 */
function registerThenDeleteRoot(home: string): string {
  const doomed = newFixture();
  const binDir = stubCodex(home);
  const added = spawnSync(
    "bash",
    ["-c", `"${binDir}/codex" plugin marketplace add "${doomed.root}"`],
    { encoding: "utf8", env: { ...process.env, HOME: home } },
  );
  expect(added.status).toBe(0);
  rmSync(doomed.root, { force: true, recursive: true });
  return doomed.root;
}

describe("regression #356: a marketplace root that is gone reports itself", () => {
  test("install names the broken root and the recovery command", () => {
    const fixture = newFixture();
    const home = newHome();
    const goneRoot = registerThenDeleteRoot(home);

    const { status, output } = run(fixture.install, home);

    expect(status).not.toBe(0);
    // What Codex said, verbatim enough to identify the marketplace at fault.
    expect(output).toContain("team-dev");
    expect(output).toContain(goneRoot);
    expect(output).toContain("codex plugin marketplace remove team-dev");
    // Not a parser complaining about the empty stdout behind that failure.
    expect(output).not.toContain("Unexpected end of JSON input");
    expect(output).not.toContain("SyntaxError");
  });

  test("a failed read leaves the tracked manifest and the cache untouched", () => {
    const fixture = newFixture();
    const before = readFileSync(fixture.manifest, "utf8");
    const home = newHome();
    registerThenDeleteRoot(home);

    expect(run(fixture.install, home).status).not.toBe(0);

    expect(readFileSync(fixture.manifest, "utf8")).toBe(before);
    expect(cachedVersions(home)).toHaveLength(0);
  });

  test("uninstall drops the stale registration and the cache", () => {
    const fixture = newFixture();
    const home = newHome();
    registerThenDeleteRoot(home);
    // A cached copy from before the root went away.
    mkdirSync(join(cacheRoot(home), "0.96.0+codex.20200101000000"), { recursive: true });

    const { status, output } = run(fixture.uninstall, home);

    expect(status).toBe(0);
    expect(output).toContain("Uninstalled Team for Codex");
    expect(existsSync(join(home, ".codex", "plugins", "cache", "team-dev"))).toBe(false);
    expect(output).not.toContain("Unexpected end of JSON input");

    // The registration is gone, so Codex can list again.
    const listed = spawnSync(
      "bash",
      ["-c", `"${join(home, "stub-bin", "codex")}" plugin marketplace list --json`],
      { encoding: "utf8", env: { ...process.env, HOME: home } },
    );
    expect(listed.status).toBe(0);
    expect(listed.stdout).not.toContain("team-dev");
  });

  // The pre-existing advice — run script/dev-uninstall from the other checkout
  // — is a dead end when that path holds no Team checkout to run it from.
  test("install points at the registration when the other root is not Team's", () => {
    const fixture = newFixture();
    const home = newHome();
    const foreign = join(newHome(), "not-a-team-checkout");
    mkdirSync(join(foreign, ".agents", "plugins"), { recursive: true });
    writeFileSync(
      join(foreign, ".agents", "plugins", "marketplace.json"),
      `${JSON.stringify({ name: "team-dev", plugins: [] }, null, 2)}\n`,
    );
    const binDir = stubCodex(home);
    spawnSync("bash", ["-c", `"${binDir}/codex" plugin marketplace add "${foreign}"`], {
      env: { ...process.env, HOME: home },
    });

    const { status, output } = run(fixture.install, home);

    expect(status).not.toBe(0);
    expect(output).toContain(foreign);
    expect(output).toContain("codex plugin marketplace remove team-dev");
    expect(output).not.toContain("dev-uninstall");
  });
});
