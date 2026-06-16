// tests/version-consistency.test.ts
//
// L2 tripwire: the land-time versioning contract (docs/versioning.md).
// The version string lives in four places across three files; on any honest
// feature branch those four must always agree and be strict semver. Free,
// deterministic — the invariant that holds at every commit, not just at land.
//
// The released-changelog invariants (a dated `## [X.Y.Z]` section, the footer
// compare links, an empty `[Unreleased]` body) are NOT asserted here: under the
// land-time model a drafted branch accumulates bullets under `[Unreleased]` and
// carries no released section until the dev `version-bump` skill cuts it at land
// time. Those released-section invariants are re-asserted by `version-bump`
// step 5 after the cut (the land-time consistency assertion that replaced
// version-gate.yml).

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

const version: string = plugin.version;

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

describe("version consistency: drift guard (land-time model)", () => {
  // Lock the rewrite: the dropped released-changelog invariants must not creep
  // back into this tripwire. They live with `version-bump`'s land-time assertion
  // now, because they only hold after the cut — never on a drafted feature branch.
  const self = readFileSync(
    join(ROOT, "tests", "version-consistency.test.ts"),
    "utf8",
  );

  test("no longer asserts a dated released-section regex", () => {
    expect(/\^## \\\[/.test(self)).toBe(false);
  });

  test("no longer asserts the dropped released-section invariants", () => {
    // The removed block keyed on a `## \[` released-section regex and a
    // `compare/v…HEAD` footer literal. The needles are assembled from parts so
    // this guard cannot match itself — a re-introduction restores the literal
    // form and trips the guard.
    const sectionRe = ["##", " ", "\\\\[" + "$"].join("");
    const footerLiteral = ["compare/v", "${version}", "...HEAD"].join("");
    expect(self).not.toContain(sectionRe);
    expect(self).not.toContain(footerLiteral);
  });
});
