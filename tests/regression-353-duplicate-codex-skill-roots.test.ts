// Regression test for issue #353.
//
// `script/dev-install-codex` used to link `~/.agents/skills/team` at the
// checkout's whole `skills/` directory. Codex reads that link as one nested
// standalone skill root, so with a plugin install also present it finds every
// Team skill under two roots and renders each one twice — a doubled catalog in
// which each description truncates to roughly a quarter of its length. The
// same nesting is what kept Team out of Nexus's index, which found only the
// Claude plugin copy and labelled every skill `claude`.
//
// The single fact this pins: after an install, exactly one root serves Team's
// skills, and it is the plugin's own. `~/.agents/skills/team` is gone, and the
// cache holds one version directory rather than one per install.
//
// L3 subprocess-snapshot: an isolated HOME, the fake `codex` from
// tests/helpers/fake-codex.mjs on PATH, and a disposable copy of the plugin
// root, because the install stamps the manifest. Codex's own catalog rendering
// is its concern; what is testable here is how many roots survive.

import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { makePluginFixture } from "./helpers/codex-plugin-fixture";

const REPO_ROOT = join(import.meta.dir, "..");
const FAKE_CODEX = join(REPO_ROOT, "tests", "helpers", "fake-codex.mjs");

const disposable: string[] = [];

afterAll(() => {
  for (const dir of disposable) rmSync(dir, { force: true, recursive: true });
});

const cacheRoot = (home: string) =>
  join(home, ".codex", "plugins", "cache", "team-dev", "team");

/** Install into a fresh HOME, starting from the state the old installer left. */
function installIntoFreshHome(): string {
  const fixture = makePluginFixture();
  disposable.push(fixture.root);
  const home = mkdtempSync(join(tmpdir(), `regression-353-${process.pid}-`));
  disposable.push(home);

  const binDir = join(home, "stub-bin");
  mkdirSync(binDir, { recursive: true });
  const stub = join(binDir, "codex");
  writeFileSync(stub, `#!/usr/bin/env bash\nexec node "${FAKE_CODEX}" "$@"\n`);
  chmodSync(stub, 0o755);

  // The collection symlink the old installer created.
  mkdirSync(join(home, ".agents", "skills"), { recursive: true });
  symlinkSync(join(REPO_ROOT, "skills"), join(home, ".agents", "skills", "team"));

  const result = spawnSync("bash", [fixture.install], {
    encoding: "utf8",
    env: { ...process.env, HOME: home, PATH: `${binDir}:${process.env.PATH ?? ""}` },
  });
  expect(`${result.stdout ?? ""}${result.stderr ?? ""}`).toContain("Installed Team for Codex");
  expect(result.status).toBe(0);
  return home;
}

describe("regression #353: Team's skills are served by exactly one Codex root", () => {
  test("the collection symlink does not survive the install", () => {
    const home = installIntoFreshHome();

    const legacy = join(home, ".agents", "skills", "team");
    expect(lstatSync(legacy, { throwIfNoEntry: false })).toBeUndefined();
    // The parent stays: it is often a user-owned dotfiles checkout.
    expect(existsSync(join(home, ".agents", "skills"))).toBe(true);
  });

  test("one cached version carries every skill", () => {
    const home = installIntoFreshHome();

    const versions = readdirSync(cacheRoot(home));
    expect(versions).toHaveLength(1);

    const skills = join(cacheRoot(home), versions[0], "skills");
    // Every skill is reachable through that one root, so none needs a link of
    // its own and a new one needs no sync step.
    for (const name of ["team", "team-design", "why"]) {
      expect(existsSync(join(skills, name, "SKILL.md"))).toBe(true);
    }
    expect(readdirSync(skills).length).toBe(readdirSync(join(REPO_ROOT, "skills")).length);
  });
});
