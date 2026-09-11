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

import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
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
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

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
    const versions = cachedVersions(home);
    expect(versions).toHaveLength(1);
    const [installed = ""] = versions;
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

describe("Slice 2: installed resources: codex", () => {
  const samples = [
    "skills/team/SKILL.md",
    "skills/authoring-designs/SKILL.md",
    "skills/principle-fail-closed/SKILL.md",
    "skills/authoring-designs/references/design-template.md",
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
  let fixture: PluginFixture;
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
      host: "codex", case: caseName, revision, operation, command, args, cwd,
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
    consumer = mkdtempSync(join(tmpdir(), "team-codex-consumer-"));
    owned.push(consumer);
    mkdirSync(join(home, "tmp"));
    environment = {
      ...process.env, HOME: home, TMPDIR: join(home, "tmp"),
      CODEX_HOME: join(home, ".codex"), CLAUDE_CONFIG_DIR: join(home, ".claude"),
      PATH: `${stubCodex(home)}:${process.env.PATH ?? ""}`, FAKE_CLAUDE_FAIL: "", LANG: "C", LC_ALL: "C", TZ: "UTC",
    };
    const source = observe("source revision", "git", ["rev-parse", "HEAD"], { status: 0 }, REPO_ROOT);
    expect(source.status, source.stderr).toBe(0);
    revision = source.stdout.trim();
    unlinkSync(join(fixture.root, "skills"));
    mkdirSync(join(fixture.root, "skills"), { recursive: true });
    for (const name of ["team", "authoring-designs", "principle-fail-closed"]) {
      cpSync(join(REPO_ROOT, "skills", name), join(fixture.root, "skills", name), { recursive: true });
    }
  });

  afterEach(() => {
    const failures: unknown[] = [];
    for (const path of owned) {
      try {
        rmSync(path, { recursive: true, force: true });
        console.log(JSON.stringify({
          host: "codex", case: caseName, revision, operation: "cleanup",
          path, expected: "absent", actual: existsSync(path) ? "present" : "absent",
        }));
        expect(existsSync(path), path).toBe(false);
      } catch (error) {
        console.log(JSON.stringify({
          host: "codex", case: caseName, revision, operation: "cleanup",
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
    const versions = cachedVersions(home);
    expect(versions).toHaveLength(1);
    const [version = ""] = versions;
    const served = join(cacheRoot(home), version);
    return realpathSync(served);
  }

  function sourceRecords() {
    return samples.map(path => {
      const bytes = readFileSync(join(fixture.root, path));
      return { path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    });
  }

  function installedRecords(root: string, stage: string, expected: ReturnType<typeof sourceRecords>) {
    const result = observe(stage, "node", ["-e", reader, root, JSON.stringify(samples)], expected);
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

      const result = observe("discovery", "bash", [
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
    const missing = join(installedRoot, "skills", "authoring-designs", "references", "design-template.md");
    expect(installedRecords(installedRoot, "before resource removal", expected)).toEqual(expected);
    rmSync(missing);

    const result = observe("missing installed resource", "node", [
      "-e", reader, installedRoot, JSON.stringify(samples),
    ], { status: 1, missingPath: missing });

    expect(result.status, result.stderr).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("ENOENT");
    expect(result.stderr).toContain(missing);
    expect(existsSync(join(fixture.root, "skills", "authoring-designs", "references", "design-template.md"))).toBe(true);
  }, 60_000);
});
