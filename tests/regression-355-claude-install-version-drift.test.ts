// Regression test for issue #355.
//
// `script/dev-install-claude` used to install through Claude Code's own
// commands and then delete the copied cache directory, replacing it with a
// symlink to the checkout. The cache path carries the version, so the
// directory name was fixed at install time while its contents followed the
// checkout. Claude reported the version its directory was named after, not the
// one the loaded manifest declared: on a branch that bumped the version, it ran
// the new content under the old number.
//
// The two facts this pins:
//   1. What Claude serves is a copy. Editing the checkout after an install does
//      not change it, so the served tree and the version reported for it always
//      describe each other.
//   2. Nothing under the cache root points back into the checkout.
//
// L3 subprocess-snapshot: an isolated HOME, the fake `claude` from
// tests/helpers/fake-claude.ts on PATH, and a disposable plugin root, because
// the install stamps the manifests.

import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
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
  fixtureBaseVersion,
  makeClaudePluginFixture,
} from "./helpers/claude-plugin-fixture";
import { writeFakeClaude } from "./helpers/fake-claude";

const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { force: true, recursive: true });
});

const cacheRoot = (home: string) =>
  join(home, ".claude", "plugins", "cache", "team-dev", "team");

function install(): { fixture: ClaudePluginFixture; home: string } {
  const fixture = makeClaudePluginFixture();
  const home = mkdtempSync(join(tmpdir(), `claude-drift-${process.pid}-`));
  tempDirs.push(fixture.root, home);
  writeFakeClaude(home);

  const result = spawnSync("bash", [fixture.install], {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      PATH: `${join(home, "bin")}:${process.env.PATH ?? ""}`,
    },
  });
  expect(result.status).toBe(0);
  return { fixture, home };
}

const servedPath = (home: string) => {
  const [entry = ""] = readdirSync(cacheRoot(home));
  return join(cacheRoot(home), entry);
};

describe("regression #355: Claude serves a copy, not the checkout", () => {
  test("the served tree does not follow the checkout after the install", () => {
    const { fixture, home } = install();
    const served = servedPath(home);

    // Positive control: the skill the install copied is there to be found, so
    // the absence assertion below cannot pass by looking in the wrong place.
    expect(existsSync(join(served, "skills", "team", "SKILL.md"))).toBe(true);

    writeFileSync(
      join(fixture.skills, "team", "SKILL.md"),
      "---\nname: team\ndescription: edited after install\n---\n\nEDITED\n",
    );

    expect(readFileSync(join(served, "skills", "team", "SKILL.md"), "utf8")).not.toContain(
      "EDITED",
    );
  });

  test("the version Claude reports describes the tree it serves", () => {
    const { fixture, home } = install();
    const served = servedPath(home);
    const reported = readFileSync(
      join(home, "state", "installed-version"),
      "utf8",
    );

    const manifest = JSON.parse(
      readFileSync(join(served, ".claude-plugin", "plugin.json"), "utf8"),
    );
    expect(manifest.version).toBe(reported);
    expect(reported).toStartWith(`${fixtureBaseVersion(fixture)}+claude.`);
  });

  test("no cache entry links back into the checkout", () => {
    const { home } = install();

    for (const entry of readdirSync(cacheRoot(home))) {
      expect(lstatSync(join(cacheRoot(home), entry)).isSymbolicLink()).toBe(
        false,
      );
    }
  });
});
