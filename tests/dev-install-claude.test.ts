// tests/dev-install-claude.test.ts
//
// Acceptance tests for `script/dev-install-claude`.
//
// Claude Code copies a plugin into a path that carries its version, and
// `claude plugin update` no-ops when the version has not moved. A dev install
// therefore has to move the version to make the copy happen, and has to sweep
// the copies it leaves behind. This suite pins that loop: the cachebuster
// stamp, the restore of the tracked manifests, and the prune.
//
// L3 subprocess-snapshot. HOME is a tempdir, the fake `claude` from
// tests/helpers/fake-claude.ts is first on PATH, and the script runs against a
// disposable plugin root because it rewrites manifests. The version drift the
// old symlink produced is pinned separately by
// tests/regression-355-claude-install-version-drift.test.ts.

import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
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
  type ClaudePluginFixture,
  fixtureBaseVersion,
  makeClaudePluginFixture,
} from "./helpers/claude-plugin-fixture";
import { writeFakeClaude } from "./helpers/fake-claude";

const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { force: true, recursive: true });
});

function newFixture(): ClaudePluginFixture {
  const fixture = makeClaudePluginFixture();
  tempDirs.push(fixture.root);
  return fixture;
}

function newHome(): string {
  const home = mkdtempSync(join(tmpdir(), `claude-install-${process.pid}-`));
  tempDirs.push(home);
  writeFakeClaude(home);
  return home;
}

function run(install: string, home: string, failOn?: string) {
  const result = spawnSync("bash", [install], {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      PATH: `${join(home, "bin")}:${process.env.PATH ?? ""}`,
      ...(failOn ? { FAKE_CLAUDE_FAIL: failOn } : {}),
    },
  });
  return {
    status: result.status ?? -1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}`,
  };
}

const cacheRoot = (home: string) =>
  join(home, ".claude", "plugins", "cache", "team-dev", "team");

const cachedVersions = (home: string) =>
  existsSync(cacheRoot(home)) ? readdirSync(cacheRoot(home)).sort() : [];

const reportedVersion = (home: string) =>
  readFileSync(join(home, "state", "installed-version"), "utf8");

describe("dev install: claude", () => {
  // Claude keys its plugin cache on the version string, so a source edit at an
  // unchanged version never reaches the cache.
  test("install stamps a cachebuster onto the base version", () => {
    const fixture = newFixture();
    const base = fixtureBaseVersion(fixture);
    const home = newHome();

    const { status, output } = run(fixture.install, home);

    expect(status).toBe(0);
    const installed = reportedVersion(home);
    expect(installed).toStartWith(`${base}+claude.`);
    expect(installed).toMatch(/\+claude\.\d{14}$/);
    expect(output).toContain(installed);
  });

  // All three Claude-side version strings drive the install: the plugin
  // manifest, and both copies in the marketplace catalog. Stamping only some
  // of them leaves the catalog reporting the old version, and the update
  // no-ops.
  test("the stamp reaches every Claude-side version string", () => {
    const fixture = newFixture();
    const home = newHome();

    expect(run(fixture.install, home).status).toBe(0);

    const installed = reportedVersion(home);
    const served = join(cacheRoot(home), installed.replace("+", "-"));
    const plugin = JSON.parse(
      readFileSync(join(served, ".claude-plugin", "plugin.json"), "utf8"),
    );
    const marketplace = JSON.parse(
      readFileSync(join(served, ".claude-plugin", "marketplace.json"), "utf8"),
    );
    expect(plugin.version).toBe(installed);
    expect(marketplace.metadata.version).toBe(installed);
    expect(marketplace.plugins[0].version).toBe(installed);
  });

  test("install leaves the tracked manifests byte-identical", () => {
    const fixture = newFixture();
    const before = {
      plugin: readFileSync(fixture.pluginManifest, "utf8"),
      marketplace: readFileSync(fixture.marketplaceManifest, "utf8"),
    };
    const home = newHome();

    expect(run(fixture.install, home).status).toBe(0);

    expect(readFileSync(fixture.pluginManifest, "utf8")).toBe(before.plugin);
    expect(readFileSync(fixture.marketplaceManifest, "utf8")).toBe(
      before.marketplace,
    );
  });

  // The stamp is a mutation of tracked files carrying pinned version strings.
  // A run that dies partway must still put them back, or `bun test` goes red
  // on a working tree nobody edited.
  test("an install that dies after the stamp still restores the manifests", () => {
    const fixture = newFixture();
    const before = {
      plugin: readFileSync(fixture.pluginManifest, "utf8"),
      marketplace: readFileSync(fixture.marketplaceManifest, "utf8"),
    };
    const home = newHome();

    // Fail the copy itself, which runs after the stamp — the case the plain
    // refusals never reach, and the only one where the trap does any work.
    const { status, output } = run(
      fixture.install,
      home,
      "plugin install team@team-dev",
    );

    expect(status).not.toBe(0);
    expect(output).toContain("Cachebuster:");
    expect(readFileSync(fixture.pluginManifest, "utf8")).toBe(before.plugin);
    expect(readFileSync(fixture.marketplaceManifest, "utf8")).toBe(
      before.marketplace,
    );
    expect(readFileSync(fixture.marketplaceManifest, "utf8")).not.toContain(
      "+claude.",
    );
  });

  test("each install prunes the copies the earlier ones left", () => {
    const fixture = newFixture();
    const base = fixtureBaseVersion(fixture);
    const home = newHome();
    // Two shapes a previous run could have left: the plain base version, and
    // an earlier cachebuster.
    for (const stale of [base, `${base}-claude.20200101000000`]) {
      const dir = join(cacheRoot(home), stale);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "marker"), `${stale}\n`);
    }

    const { status, output } = run(fixture.install, home);

    expect(status).toBe(0);
    expect(cachedVersions(home)).toHaveLength(1);
    expect(output).toContain(base);
    expect(output).toContain("20200101000000");
  });

  // The stale entry an older dev install left is a symlink into the checkout.
  // Pruning must unlink it, never descend it.
  test("a stale symlink into the checkout is unlinked, not followed", () => {
    const fixture = newFixture();
    const home = newHome();
    mkdirSync(cacheRoot(home), { recursive: true });
    symlinkSync(fixture.root, join(cacheRoot(home), "0.81.0"));

    expect(run(fixture.install, home).status).toBe(0);

    expect(
      lstatSync(join(cacheRoot(home), "0.81.0"), { throwIfNoEntry: false }),
    ).toBeUndefined();
    expect(existsSync(join(fixture.root, "skills", "team", "SKILL.md"))).toBe(
      true,
    );
    expect(existsSync(fixture.pluginManifest)).toBe(true);
  });

  test("repeated installs converge on exactly one served version", () => {
    const fixture = newFixture();
    const home = newHome();

    expect(run(fixture.install, home).status).toBe(0);
    // A second within the same clock second would mint the same stamp, which
    // is a no-op rather than a second copy. Sleep past it.
    spawnSync("sleep", ["1.1"]);
    expect(run(fixture.install, home).status).toBe(0);

    const versions = cachedVersions(home);
    expect(versions).toHaveLength(1);
    const [served = ""] = versions;
    expect(served).toBe(reportedVersion(home).replace("+", "-"));
  });
});

describe("dev uninstall: claude", () => {
  test("uninstall leaves no cache, marketplace entry, or install", () => {
    const fixture = newFixture();
    const home = newHome();
    expect(run(fixture.install, home).status).toBe(0);
    expect(cachedVersions(home)).toHaveLength(1);

    const { status } = run(fixture.uninstall, home);

    expect(status).toBe(0);
    expect(
      existsSync(join(home, ".claude", "plugins", "cache", "team-dev")),
    ).toBe(false);
    expect(existsSync(join(home, "state", "marketplace-path"))).toBe(false);
    expect(existsSync(join(home, "state", "installed-version"))).toBe(false);
  });

  // An install from before #355 left a symlink to the checkout at a
  // version-named path. Removing the tree must unlink it, not follow it.
  test("a legacy symlink into the checkout is unlinked, not followed", () => {
    const fixture = newFixture();
    const home = newHome();
    mkdirSync(cacheRoot(home), { recursive: true });
    symlinkSync(fixture.root, join(cacheRoot(home), "0.81.0"));

    expect(run(fixture.uninstall, home).status).toBe(0);

    expect(
      existsSync(join(home, ".claude", "plugins", "cache", "team-dev")),
    ).toBe(false);
    expect(existsSync(join(fixture.root, "skills", "team", "SKILL.md"))).toBe(
      true,
    );
    expect(existsSync(fixture.pluginManifest)).toBe(true);
  });

  test("uninstalling nothing reports nothing to do", () => {
    const fixture = newFixture();
    const home = newHome();

    const { status, output } = run(fixture.uninstall, home);

    expect(status).toBe(0);
    expect(output).toContain("Nothing to do");
  });
});
