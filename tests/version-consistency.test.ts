// tests/version-consistency.test.ts
//
// L2 tripwire: the per-PR versioning contract (docs/versioning.md).
// The version string lives in four places across three files; every PR
// rolls its own released CHANGELOG section. Free, deterministic — the
// authoritative in-tree half of the contract. The git-context half
// (bumped vs base, open-PR collisions) lives in
// .github/workflows/version-gate.yml.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

const plugin = JSON.parse(
  readFileSync(join(ROOT, ".claude-plugin", "plugin.json"), "utf8"),
);
const marketplace = JSON.parse(
  readFileSync(join(ROOT, ".claude-plugin", "marketplace.json"), "utf8"),
);
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const changelog = readFileSync(join(ROOT, "CHANGELOG.md"), "utf8");

const version: string = plugin.version;
const esc = version.replace(/\./g, "\\.");

describe("version consistency: the four version strings", () => {
  test("plugin.json version is strict 3-part semver", () => {
    expect(version).toMatch(SEMVER_RE);
  });

  test("all four version strings agree", () => {
    expect(marketplace.metadata.version).toBe(version);
    expect(marketplace.plugins[0].version).toBe(version);
    expect(pkg.version).toBe(version);
  });
});

describe("version consistency: changelog", () => {
  test("has a dated released section for the current version", () => {
    expect(changelog).toMatch(
      new RegExp(`^## \\[${esc}\\] - \\d{4}-\\d{2}-\\d{2}$`, "m"),
    );
  });

  test("footer has a compare link for the current version", () => {
    expect(changelog).toMatch(new RegExp(`^\\[${esc}\\]: https://`, "m"));
  });

  test("[Unreleased] footer link compares from the current version", () => {
    expect(changelog).toContain(
      `[Unreleased]: https://github.com/bostonaholic/team/compare/v${version}...HEAD`,
    );
  });

  test("[Unreleased] section body is empty (each PR rolls its own section)", () => {
    const match = changelog.match(
      /^## \[Unreleased\]\n([\s\S]*?)^## \[/m,
    );
    expect(match).not.toBeNull();
    expect((match as RegExpMatchArray)[1].trim()).toBe("");
  });
});
