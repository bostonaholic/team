// tests/dev-install-codex.test.ts
//
// Acceptance tests for the Codex half of the dev install,
// `script/dev-install-codex` and `script/dev-uninstall-codex`.
//
// L3 subprocess-snapshot. Every test isolates with HOME=<tempdir>, puts
// tests/helpers/fake-codex.mjs first on PATH as `codex`, and runs the scripts
// from a disposable copy of the plugin root
// (tests/helpers/codex-plugin-fixture.ts) — the install stamps the manifest,
// and no test may mutate the tracked one.
//
// The install follows Codex's documented local-development loop: rewrite the
// manifest version to `<base>+codex.<cachebuster>`, then `codex plugin add`,
// because the version string is the plugin cache key. Three properties follow,
// and these tests hold each of them down:
//
// - The stamp never survives the run. `.codex-plugin/plugin.json` carries one
//   of Team's six pinned version strings, so a cachebuster left behind turns
//   `bun test` red.
// - Exactly one cached copy survives. Each run mints a new version, so without
//   a prune the cache grows by a full copy of the plugin per install.
// - `~/.agents/skills/team` does not survive. That collection symlink, which
//   an earlier version of this script created, exposes the checkout's whole
//   skills/ tree as one nested standalone skill, so Codex registers every
//   skill a second time and halves the description budget each one is
//   rendered with.

import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fixtureBaseVersion,
  makePluginFixture,
  type PluginFixture,
} from "./helpers/codex-plugin-fixture";

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
  const home = mkdtempSync(join(tmpdir(), `codex-dev-${process.pid}-`));
  disposable.push(home);
  return home;
}

/** Put the fake `codex` first on PATH. Returns the directory to prepend. */
function stubCodex(home: string): string {
  const binDir = join(home, "stub-bin");
  mkdirSync(binDir, { recursive: true });
  const stub = join(binDir, "codex");
  writeFileSync(stub, `#!/usr/bin/env bash\nexec node "${FAKE_CODEX}" "$@"\n`);
  chmodSync(stub, 0o755);
  return binDir;
}

function run(script: string, home: string, options: { codex?: boolean } = {}) {
  const withCodex = options.codex ?? true;
  const result = spawnSync("bash", [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      PATH: withCodex
        ? `${stubCodex(home)}:${process.env.PATH ?? ""}`
        : // A PATH with no `codex` on it, but still enough to run the script.
          "/usr/bin:/bin",
    },
  });
  return {
    status: result.status ?? -1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}`,
  };
}

const teamLink = (home: string) => join(home, ".agents", "skills", "team");
const cacheRoot = (home: string) =>
  join(home, ".codex", "plugins", "cache", "team-dev", "team");
const cachedVersions = (home: string) =>
  existsSync(cacheRoot(home)) ? readdirSync(cacheRoot(home)).sort() : [];
const calls = (home: string) =>
  existsSync(join(home, ".fake-codex-calls"))
    ? readFileSync(join(home, ".fake-codex-calls"), "utf8")
    : "";
const manifestVersion = (fixture: PluginFixture) =>
  JSON.parse(readFileSync(fixture.manifest, "utf8")).version;

/** Plant the collection symlink the old installer created. */
function plantLegacyLink(home: string, target = join(REPO_ROOT, "skills")) {
  mkdirSync(join(home, ".agents", "skills"), { recursive: true });
  symlinkSync(target, teamLink(home));
}

describe("dev install: codex harness", () => {
  test("install registers the marketplace and adds the plugin", () => {
    const fixture = newFixture();
    const home = newHome();

    const { status, output } = run(fixture.install, home);

    expect(status).toBe(0);
    expect(calls(home)).toContain(`plugin marketplace add ${fixture.root}`);
    expect(calls(home)).toContain("plugin add team@team-dev");
    expect(output).toContain("Installed Team for Codex");
  });

  // Codex keys its plugin cache on the version string, and its plugin-creator
  // reference prescribes `<base>+codex.<cachebuster>` to force a re-copy.
  test("install stamps a cachebuster onto the base version", () => {
    const fixture = newFixture();
    const base = fixtureBaseVersion(fixture);
    const home = newHome();

    const { status, output } = run(fixture.install, home);

    expect(status).toBe(0);
    expect(cachedVersions(home)).toHaveLength(1);
    const installed = cachedVersions(home)[0];
    expect(installed).toStartWith(`${base}+codex.`);
    expect(installed).toMatch(/\+codex\.\d{14}$/);
    expect(output).toContain(installed);
  });

  test("install leaves the tracked manifest byte-identical", () => {
    const fixture = newFixture();
    const before = readFileSync(fixture.manifest, "utf8");
    const home = newHome();

    expect(run(fixture.install, home).status).toBe(0);

    expect(readFileSync(fixture.manifest, "utf8")).toBe(before);
    expect(manifestVersion(fixture)).not.toContain("+codex.");
  });

  // The stamp is written before `codex plugin add` runs, so a failure there
  // must not strand it in a tracked file.
  test("a failed install still restores the manifest", () => {
    const fixture = newFixture();
    const before = readFileSync(fixture.manifest, "utf8");
    const home = newHome();
    // A marketplace registered from another root makes `codex plugin add`
    // resolve a different plugin, so the version check fails after the stamp.
    const binDir = stubCodex(home);
    const decoy = newFixture();
    spawnSync("bash", ["-c", `"${binDir}/codex" plugin marketplace add "${decoy.root}"`], {
      env: { ...process.env, HOME: home },
    });

    const { status } = run(fixture.install, home);

    expect(status).not.toBe(0);
    expect(readFileSync(fixture.manifest, "utf8")).toBe(before);
  });

  // Every install mints a version, so without a prune the cache grows by a
  // full copy of the plugin per run. Both shapes it can hold are covered: the
  // plain version an end-user `codex plugin add` writes, and the cachebusted
  // one a previous dev install left.
  test("install prunes every cached copy but its own", () => {
    const fixture = newFixture();
    const base = fixtureBaseVersion(fixture);
    const home = newHome();
    const stale = [base, `${base}+codex.20200101000000`];
    for (const version of stale) {
      mkdirSync(join(cacheRoot(home), version), { recursive: true });
      writeFileSync(join(cacheRoot(home), version, "marker"), `${version}\n`);
    }

    const { status, output } = run(fixture.install, home);

    expect(status).toBe(0);
    expect(cachedVersions(home)).toHaveLength(1);
    for (const version of stale) {
      expect(output).toContain(`Pruned stale cache: ${version}`);
    }
  });

  test("install prunes a stale symlink without following it", () => {
    const fixture = newFixture();
    const home = newHome();
    mkdirSync(cacheRoot(home), { recursive: true });
    symlinkSync(fixture.root, join(cacheRoot(home), "0.0.1-stale"));

    expect(run(fixture.install, home).status).toBe(0);

    expect(cachedVersions(home)).toHaveLength(1);
    expect(existsSync(fixture.manifest)).toBe(true);
    expect(existsSync(join(REPO_ROOT, "skills", "team", "SKILL.md"))).toBe(true);
  });

  test("install removes the legacy collection symlink", () => {
    const fixture = newFixture();
    const home = newHome();
    plantLegacyLink(home);

    const { status, output } = run(fixture.install, home);

    expect(status).toBe(0);
    expect(lstatSync(teamLink(home), { throwIfNoEntry: false })).toBeUndefined();
    expect(output).toContain("Removed the legacy skill link");
    // The parents can be a user-owned dotfiles checkout — never removed.
    expect(existsSync(join(home, ".agents", "skills"))).toBe(true);
  });

  test("install removes a legacy link whose target is gone", () => {
    const fixture = newFixture();
    const home = newHome();
    plantLegacyLink(home, join(home, "deleted-checkout", "skills"));

    const { status, output } = run(fixture.install, home);

    expect(status).toBe(0);
    expect(lstatSync(teamLink(home), { throwIfNoEntry: false })).toBeUndefined();
    expect(output).toContain("dangling");
  });

  test("install refuses a legacy path it did not create", () => {
    const fixture = newFixture();
    const home = newHome();
    const target = teamLink(home);
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "USER_DATA.md"), "not ours\n");

    const { status, output } = run(fixture.install, home);

    expect(status).not.toBe(0);
    expect(output).toContain("not a symlink");
    expect(readFileSync(join(target, "USER_DATA.md"), "utf8")).toBe("not ours\n");
    // Nothing installed: the migration is a precondition, not a side effect.
    expect(cachedVersions(home)).toHaveLength(0);
  });

  test("install refuses a legacy link that points outside a Team checkout", () => {
    const fixture = newFixture();
    const home = newHome();
    const foreign = join(newHome(), "somebody-elses-skills");
    mkdirSync(foreign, { recursive: true });
    plantLegacyLink(home, foreign);

    const { status, output } = run(fixture.install, home);

    expect(status).not.toBe(0);
    expect(output).toContain("does not point at a Team checkout");
    expect(lstatSync(teamLink(home)).isSymbolicLink()).toBe(true);
    expect(cachedVersions(home)).toHaveLength(0);
  });

  test("install reports when codex is not installed", () => {
    const fixture = newFixture();
    const home = newHome();

    const { status, output } = run(fixture.install, home, { codex: false });

    expect(status).not.toBe(0);
    expect(output).toContain("codex");
    expect(cachedVersions(home)).toHaveLength(0);
  });

  test("install refuses a team-dev marketplace from another checkout", () => {
    const fixture = newFixture();
    const other = newFixture();
    const home = newHome();
    const binDir = stubCodex(home);
    spawnSync("bash", ["-c", `"${binDir}/codex" plugin marketplace add "${other.root}"`], {
      env: { ...process.env, HOME: home },
    });

    const { status, output } = run(fixture.install, home);

    expect(status).not.toBe(0);
    expect(output).toContain(other.root);
    expect(output).toContain("dev-uninstall");
  });
});

describe("dev uninstall: codex harness", () => {
  test("uninstall removes the plugin, the marketplace, and the cache", () => {
    const fixture = newFixture();
    const home = newHome();
    expect(run(fixture.install, home).status).toBe(0);

    const { status, output } = run(fixture.uninstall, home);

    expect(status).toBe(0);
    expect(calls(home)).toContain("plugin remove team@team-dev");
    expect(calls(home)).toContain("plugin marketplace remove team-dev");
    expect(output).toContain("Uninstalled Team for Codex");
    expect(existsSync(join(home, ".codex", "plugins", "cache", "team-dev"))).toBe(false);
  });

  test("uninstall removes the legacy collection symlink too", () => {
    const fixture = newFixture();
    const home = newHome();
    plantLegacyLink(home);

    const { status } = run(fixture.uninstall, home);

    expect(status).toBe(0);
    expect(lstatSync(teamLink(home), { throwIfNoEntry: false })).toBeUndefined();
    // The parents can be a user-owned dotfiles checkout — never removed.
    expect(existsSync(join(home, ".agents", "skills"))).toBe(true);
  });

  test("uninstall is idempotent", () => {
    const fixture = newFixture();
    const home = newHome();

    const absent = run(fixture.uninstall, home);

    expect(absent.status).toBe(0);
    expect(absent.output).toContain("Nothing to do");
  });

  test("uninstall refuses a legacy path it did not create", () => {
    const fixture = newFixture();
    const home = newHome();
    const target = teamLink(home);
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "USER_DATA.md"), "not ours\n");

    const { status, output } = run(fixture.uninstall, home);

    expect(status).not.toBe(0);
    expect(output).toContain("not a symlink");
    expect(existsSync(join(target, "USER_DATA.md"))).toBe(true);
  });
});
