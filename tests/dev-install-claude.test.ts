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

import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import {
  type ClaudePluginFixture,
  fixtureBaseVersion,
  makeClaudePluginFixture,
} from "./helpers/claude-plugin-fixture";
import { writeFakeClaude } from "./helpers/fake-claude";
import { writeFixtureStat } from "./helpers/fixture-stat";

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

describe("Slice 2: installed resources: claude", () => {
  const samples = [
    "skills/team/SKILL.md",
    "skills/team/playbooks/design.md",
    "skills/team/principles/verified-results.md",
    "skills/team/references/design-template.md",
    "skills/team/registry.json",
    "skills/team/discover-topic.sh",
  ];
  const reader = String.raw`
    const { readFileSync, realpathSync } = require("node:fs");
    const { join } = require("node:path");
    const { createHash } = require("node:crypto");
    const root = realpathSync(process.argv[1]);
    const records = JSON.parse(process.argv[2]).map(path => {
      const resolvedPath = realpathSync(join(root, path));
      const bytes = readFileSync(resolvedPath);
      return {
        path, resolvedPath, bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    });
    process.stdout.write(JSON.stringify(records));
  `;
  let owned: string[] = [];
  let fixture: ClaudePluginFixture;
  let home: string;
  let consumer: string;
  let revision: string;
  let caseName: string;
  let environment: NodeJS.ProcessEnv;

  function observe(
    operation: string,
    command: string,
    args: string[],
    expected: unknown,
    cwd = consumer,
  ) {
    const start = performance.now();
    const result = spawnSync(command, args, {
      cwd,
      encoding: "utf8",
      env: environment,
      timeout: 15_000,
      killSignal: "SIGKILL",
    });
    const actual = {
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      error: result.error?.message ?? null,
      signal: result.signal,
    };
    console.log(JSON.stringify({
      host: "claude", case: caseName, revision, operation, command, args, cwd,
      expected, actual, durationMs: performance.now() - start,
    }));
    expect(actual.error, operation).toBeNull();
    expect(actual.signal, operation).toBeNull();
    return actual;
  }

  beforeEach(() => {
    owned = [];
    caseName = "setup";
    revision = "";
    fixture = newFixture();
    owned.push(fixture.root);
    home = newHome();
    owned.push(home);
    consumer = mkdtempSync(join(tmpdir(), "team-claude-consumer-"));
    owned.push(consumer);
    mkdirSync(join(home, "tmp"));
    environment = {
      ...process.env, HOME: home, TMPDIR: join(home, "tmp"),
      CODEX_HOME: join(home, ".codex"), CLAUDE_CONFIG_DIR: join(home, ".claude"),
      PATH: `${join(home, "bin")}:${process.env.PATH ?? ""}`, FAKE_CLAUDE_FAIL: "", LANG: "C", LC_ALL: "C", TZ: "UTC",
    };
    const source = observe("source revision", "git", ["rev-parse", "HEAD"], { status: 0 }, join(import.meta.dir, ".."));
    expect(source.status, source.stderr).toBe(0);
    revision = source.stdout.trim();
    rmSync(fixture.skills, { recursive: true });
    mkdirSync(join(fixture.root, "skills"), { recursive: true });
    for (const name of ["team"]) {
      cpSync(join(import.meta.dir, "..", "skills", name), join(fixture.root, "skills", name), { recursive: true });
    }
  });

  afterEach(() => {
    const failures: unknown[] = [];
    for (const path of owned) {
      try {
        rmSync(path, { recursive: true, force: true });
        console.log(JSON.stringify({
          host: "claude", case: caseName, revision, operation: "cleanup",
          path, expected: "absent", actual: existsSync(path) ? "present" : "absent",
        }));
        expect(existsSync(path), path).toBe(false);
      } catch (error) {
        console.log(JSON.stringify({
          host: "claude", case: caseName, revision, operation: "cleanup",
          path, expected: "absent", error: String(error),
        }));
        failures.push(error);
      }
    }
    owned = [];
    if (failures.length > 0) throw new AggregateError(failures, "Installed resource fixture cleanup failed");
  });

  function install(name: string) {
    caseName = name;
    const result = observe("install", "bash", [fixture.install], { status: 0 });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const served = join(cacheRoot(home), reportedVersion(home).replace("+", "-"));
    return realpathSync(served);
  }

  function sourceRecords() {
    return samples.map(path => {
      const bytes = readFileSync(join(fixture.root, path));
      return { path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    });
  }

  function installedRecords(root: string, stage: string, expected: ReturnType<typeof sourceRecords>, paths = samples) {
    const result = observe(stage, "node", ["-e", reader, root, JSON.stringify(paths)], expected);
    expect(result.status, result.stderr).toBe(0);
    const records: Array<{ path: string; resolvedPath: string; bytes: number; sha256: string }> =
      JSON.parse(result.stdout);
    for (const record of records) {
      expect(relative(root, record.resolvedPath), record.resolvedPath).toBe(record.path);
    }
    return records.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }));
  }

  function seedDesign(topic: string, review: string) {
    const directory = join(consumer, "docs", "plans", topic);
    mkdirSync(directory, { recursive: true });
    for (const [file, phase] of [
      ["1-task.md", "task"], ["2-questions.md", "question"],
      ["5-research.md", "research"], ["6-design.md", "design"],
    ] as const) {
      writeFileSync(join(directory, file), [
        "---", `topic: ${topic}`, "date: 2026-09-11", `phase: ${phase}`,
        "---", "", "# Installed discovery fixture", "",
      ].join("\n"));
    }
    writeFileSync(join(directory, "design-review-1.md"), review);
  }

  test("Installed resource bytes survive source removal", () => {
    const expected = sourceRecords();
    const installedRoot = install("Installed resource bytes survive source removal");

    expect(installedRecords(installedRoot, "before source removal", expected)).toEqual(expected);
    rmSync(fixture.root, { recursive: true });
    expect(existsSync(fixture.root), fixture.root).toBe(false);
    expect(installedRecords(installedRoot, "after source removal", expected)).toEqual(expected);
  }, 60_000);

  describe.each([
    {
      scenario: "approved design",
      topic: "GH-369-approved",
      review: "---\ntopic: approved\ndate: 2026-09-11\nphase: design-review\nverdict: APPROVE\n---\n\n# Review\n",
      selected: "docs/plans/GH-369-approved/\n",
    },
    {
      scenario: "missing verdict",
      topic: "GH-369-missing-verdict",
      review: "---\ntopic: missing-verdict\ndate: 2026-09-11\nphase: design-review\n---\n\n# Review\n",
      selected: "",
    },
  ])("$scenario", ({ topic, review, selected }) => {
    test("Installed discovery observes the review requirement", () => {
      const installedRoot = install("Installed discovery observes the review requirement");
      seedDesign(topic, review);
      environment.PATH = `${writeFixtureStat(consumer)}:${environment.PATH ?? ""}`;

      const result = observe("discovery (fixture stat: actual file mtimes)", "bash", [
        join(installedRoot, "skills", "team", "discover-topic.sh"),
        "", "6-design.md", "--require-passing-review",
      ], { status: 0, stdout: selected, stderr: "" });

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toBe(selected);
      expect(result.stderr).toBe("");
    }, 60_000);
  });

  test("Missing installed resources fail without checkout fallback", () => {
    const expected = sourceRecords();
    const installedRoot = install("Missing installed resources fail without checkout fallback");
    const missing = join(installedRoot, "skills", "team", "references", "design-template.md");
    expect(installedRecords(installedRoot, "before resource removal", expected)).toEqual(expected);
    rmSync(missing);

    const result = observe("missing installed resource", "node", [
      "-e", reader, installedRoot, JSON.stringify(samples),
    ], { status: 1, missingPath: missing });

    expect(result.status, result.stderr).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("ENOENT");
    expect(result.stderr).toContain(missing);
    expect(existsSync(join(fixture.root, "skills", "team", "references", "design-template.md"))).toBe(true);
  }, 60_000);

  describe("Installed resource delivery", () => {
    function contractRecord(path: string) {
      expect(existsSync(join(fixture.root, path)), path).toBe(true);
      const bytes = readFileSync(join(fixture.root, path));
      return [{ path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }];
    }

    test.each(["artifacts.md", "external-data.md"])("%s preserves its digest outside the checkout after source removal", (name) => {
      const path = join("skills", "team", "references", name);
      const expected = contractRecord(path);
      const installedRoot = install(name);
      expect(installedRecords(installedRoot, "before source removal", expected, [path])).toEqual(expected);

      rmSync(fixture.root, { recursive: true });

      expect(existsSync(fixture.root)).toBe(false);
      expect(installedRecords(installedRoot, "after source removal", expected, [path])).toEqual(expected);
    });

    test.each(["artifacts.md", "external-data.md"])("missing installed %s reports its path while the source remains readable", (name) => {
      const path = join("skills", "team", "references", name);
      const expected = contractRecord(path);
      const installedRoot = install(name);
      expect(installedRecords(installedRoot, "before resource removal", expected, [path])).toEqual(expected);
      const missing = join(installedRoot, path);

      rmSync(missing);
      const result = observe("missing installed contract", "node", ["-e", reader, installedRoot, JSON.stringify([path])], { status: 1, missingPath: missing });

      expect(result.status, result.stderr).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(missing);
      expect(contractRecord(path)).toEqual(expected);
    });
  });

});
