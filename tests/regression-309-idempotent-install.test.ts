// Regression test for issue #309.
//
// `script/dev-install-claude` was not idempotent: a second run against an
// already-installed checkout could leave the cache in a state Claude could not
// serve from, and an older installed version was never moved off.
//
// The bug is pinned here; its expression moved. #309 was fixed while the
// installer replaced Claude's copy with a symlink to the checkout, so these
// tests used to assert that a re-run restored that symlink. #355 removed the
// symlink — it made Claude report a version that did not describe what it
// loaded — so convergence is now expressed as "exactly one served copy, and it
// is the one Claude reports".
//
// L3 subprocess-snapshot: an isolated HOME, the fake `claude` from
// tests/helpers/fake-claude.ts on PATH, and a disposable plugin root, because
// the install stamps the manifests.

import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
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

import {
  type ClaudePluginFixture,
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
  const home = mkdtempSync(join(tmpdir(), `team-install-${process.pid}-`));
  tempDirs.push(home);
  writeFakeClaude(home);
  return home;
}

function run(install: string, home: string) {
  const result = spawnSync("bash", [install], {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      PATH: `${join(home, "bin")}:${process.env.PATH ?? ""}`,
    },
  });
  return {
    status: result.status ?? -1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}`,
  };
}

const cacheRoot = (home: string) =>
  join(home, ".claude", "plugins", "cache", "team-dev", "team");
const statePath = (home: string, name: string) => join(home, "state", name);
const reportedVersion = (home: string) =>
  readFileSync(statePath(home, "installed-version"), "utf8");

describe("regression #309: Claude dev installation is idempotent", () => {
  test("a repeated install converges on one copy Claude can serve", () => {
    const fixture = newFixture();
    const home = newHome();
    expect(run(fixture.install, home).status).toBe(0);

    // Corrupt what Claude serves: a directory with none of the plugin in it.
    const served = join(cacheRoot(home), reportedVersion(home).replace("+", "-"));
    rmSync(served, { force: true, recursive: true });
    mkdirSync(served, { recursive: true });
    writeFileSync(join(served, "not-the-plugin"), "junk\n");
    // Each run stamps a 14-digit second-resolution timestamp, so two runs in
    // the same second would mint the same version and copy nothing.
    spawnSync("sleep", ["1.1"]);

    const second = run(fixture.install, home);

    expect(second.status).toBe(0);
    const versions = readdirSync(cacheRoot(home));
    expect(versions).toHaveLength(1);
    const [current = ""] = versions;
    expect(current).toBe(reportedVersion(home).replace("+", "-"));
    expect(existsSync(join(cacheRoot(home), current, "skills", "team", "SKILL.md"))).toBe(true);
    expect(existsSync(join(cacheRoot(home), current, "not-the-plugin"))).toBe(false);
  });

  test("a repeated install moves an older installed version off", () => {
    const fixture = newFixture();
    const home = newHome();
    mkdirSync(join(home, "state"), { recursive: true });
    writeFileSync(statePath(home, "marketplace-path"), fixture.root);
    writeFileSync(statePath(home, "catalog-version"), "0.0.1");
    writeFileSync(statePath(home, "installed-version"), "0.0.1");
    mkdirSync(join(cacheRoot(home), "0.0.1"), { recursive: true });

    const result = run(fixture.install, home);

    expect(result.status).toBe(0);
    expect(reportedVersion(home)).toMatch(/\+claude\.\d{14}$/);
    expect(existsSync(join(cacheRoot(home), "0.0.1"))).toBe(false);
    // The catalog is a snapshot, so refreshing it is what makes the update
    // see a new version at all. Ordering is the whole fix.
    const calls = readFileSync(statePath(home, "calls"), "utf8");
    expect(calls.indexOf("plugin marketplace update team-dev")).toBeLessThan(
      calls.indexOf("plugin update team@team-dev"),
    );
  });

  test("an existing marketplace for another checkout is refused", () => {
    const fixture = newFixture();
    const home = newHome();
    const foreign = join(home, "other-team-checkout");
    mkdirSync(join(home, "state"), { recursive: true });
    writeFileSync(statePath(home, "marketplace-path"), foreign);

    const result = run(fixture.install, home);

    expect(result.status).not.toBe(0);
    expect(result.output).toContain("different checkout");
    // Refused before the stamp, so there is nothing to undo.
    expect(result.output).not.toContain("Cachebuster:");
    expect(readFileSync(statePath(home, "marketplace-path"), "utf8")).toBe(foreign);
    expect(existsSync(cacheRoot(home))).toBe(false);
  });
});
