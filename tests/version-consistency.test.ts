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
const codexPlugin = JSON.parse(
  readFileSync(join(ROOT, ".codex-plugin", "plugin.json"), "utf8"),
);
const codexMarketplace = JSON.parse(
  readFileSync(join(ROOT, ".agents", "plugins", "marketplace.json"), "utf8"),
);

const version: string = plugin.version;

describe("version consistency: the five version strings", () => {
  test("plugin.json version is strict 3-part semver", () => {
    expect(version).toMatch(SEMVER_RE);
  });

  test("all five version strings agree", () => {
    expect(marketplace.metadata.version).toBe(version);
    expect(marketplace.plugins[0].version).toBe(version);
    expect(pkg.version).toBe(version);
    expect(codexPlugin.version).toBe(version);
  });
});

// Each host reads its own manifest — Codex prefers .codex-plugin/ and
// .agents/plugins/ over .claude-plugin/. If the names drift, the two hosts
// disagree about what the plugin is called, and the Codex skill namespace
// (which comes from the plugin manifest's `name`) silently diverges from the
// documented `team:<skill>`. Nothing else catches that.
describe("manifest consistency: hosts agree on names", () => {
  test("plugin name matches across host manifests", () => {
    expect(codexPlugin.name).toBe(plugin.name);
  });

  test("marketplace name matches across host manifests", () => {
    expect(codexMarketplace.name).toBe(marketplace.name);
  });

  test("the marketplace's plugin entry matches the plugin manifest", () => {
    expect(codexMarketplace.plugins[0].name).toBe(plugin.name);
    expect(marketplace.plugins[0].name).toBe(plugin.name);
  });
});

// One description, everywhere a user can read it. Each host renders its own
// manifest in its own plugin listing, so a drifted string means the same
// release describes itself differently depending on where it was installed
// from. `release-on-merge.yml` extends the same check to the GitHub repo
// description, which no test can reach.
describe("manifest consistency: one description", () => {
  const description: string = plugin.description;

  test("the description is non-empty", () => {
    expect(description.length).toBeGreaterThan(0);
  });

  test("every manifest and package.json carries the same description", () => {
    expect(marketplace.metadata.description).toBe(description);
    expect(marketplace.plugins[0].description).toBe(description);
    expect(codexPlugin.description).toBe(description);
    expect(codexMarketplace.plugins[0].description).toBe(description);
    expect(pkg.description).toBe(description);
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
