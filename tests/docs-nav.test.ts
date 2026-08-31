// tests/docs-nav.test.ts
//
// L2 tripwire (free, deterministic): the docs site's top nav is data-driven
// from two front-matter keys — `audience` decides which of the two nav groups
// a page lands in, and `nav_order` decides its position inside that group.
// Nothing else checks it: .github/workflows/pages.yml has no `pull_request`
// trigger, so a page that silently drops out of the nav, or a `nav_order` tie
// that silently reorders a menu, still builds green and ships unnoticed.
//
// Values are compared whole, never as substrings, because Liquid's `contains`
// on a list tests element equality — `[user-facing]` is not `user`.
//
// Each absence assertion is paired with a presence assertion on the same page,
// so a deleted or misspelled `audience` line FAILS instead of vacuously
// passing the absence check.
//
// Defensive reads: a missing file → "" so assertions FAIL cleanly rather than
// throwing ENOENT (the mechanical gate rejects crashes).

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";

const REPO_ROOT = process.cwd();
const INDEX_MD = join(REPO_ROOT, "docs", "index.md");
const VISION_MD = join(REPO_ROOT, "docs", "vision.md");
const ETHOS_MD = join(REPO_ROOT, "docs", "ethos.md");
const ARCHITECTURE_MD = join(REPO_ROOT, "docs", "architecture.md");
const SKILLS_MD = join(REPO_ROOT, "docs", "skills.md");
const VERSIONING_MD = join(REPO_ROOT, "docs", "versioning.md");
const PROJECT_TRACKING_MD = join(REPO_ROOT, "docs", "project-tracking.md");
const TESTING_MD = join(REPO_ROOT, "docs", "testing.md");
const PORTABILITY_MD = join(REPO_ROOT, "docs", "cross-host-portability.md");
const SCREENSHOTS_MD = join(REPO_ROOT, "docs", "screenshots-in-prs.md");

function readIf(path: string): string {
  return existsSync(path) ? read(path) : "";
}

// The whole values of one front-matter key, read off the raw frontmatter slice
// (no YAML parser: adding one would raise the >=1.0.0 bun engine floor).
// Match the key anchored at the start of a line, drop a trailing inline
// comment and any flow-sequence brackets, split on commas, then trim
// whitespace and wrapping quotes off each piece. A missing line yields no
// values, so the caller's assertion fails rather than skipping.
function frontMatterValues(path: string, key: string): string[] {
  const line = new RegExp(`^${key}:(.*)$`, "m").exec(frontmatter(readIf(path)));
  if (line === null) return [];
  return (line[1] ?? "")
    .replace(/\s#.*$/, "")
    .replace(/[[\]]/g, "")
    .split(",")
    .map((piece) => piece.trim().replace(/^["']|["']$/g, ""))
    .filter((piece) => piece.length > 0);
}

// The page's `nav_order` as an integer. A missing, multi-valued, or
// non-integer value yields NaN, which fails the integer assertion.
function navOrder(path: string): number {
  const values = frontMatterValues(path, "nav_order");
  const only = values.length === 1 ? (values[0] ?? "") : "";
  return /^-?\d+$/.test(only) ? Number(only) : Number.NaN;
}

// Values that are not integers, so a failure names the offending entry.
function nonIntegers(values: number[]): number[] {
  return values.filter((value) => !Number.isInteger(value));
}

// Values appearing more than once, so a failure names the colliding number.
function duplicates(values: number[]): number[] {
  const repeated = values.filter((value, index) => values.indexOf(value) !== index);
  return [...new Set(repeated)].sort((a, b) => a - b);
}

describe("docs site nav: membership and ordering are data-driven from audience + nav_order front matter", () => {
  test("dropdown membership: moved pages name developer and not user", () => {
    const screenshots = frontMatterValues(SCREENSHOTS_MD, "audience");
    const testing = frontMatterValues(TESTING_MD, "audience");

    expect(screenshots).toContain("developer");
    expect(screenshots).not.toContain("user");
    expect(testing).toContain("developer");
    expect(testing).not.toContain("user");
  });

  test("primary row: the five remaining pages keep user", () => {
    expect(frontMatterValues(INDEX_MD, "audience")).toContain("user");
    expect(frontMatterValues(VISION_MD, "audience")).toContain("user");
    expect(frontMatterValues(ETHOS_MD, "audience")).toContain("user");
    expect(frontMatterValues(ARCHITECTURE_MD, "audience")).toContain("user");
    expect(frontMatterValues(SKILLS_MD, "audience")).toContain("user");
  });

  test("dropdown nav_order values are distinct", () => {
    const orders = [
      navOrder(VERSIONING_MD),
      navOrder(PROJECT_TRACKING_MD),
      navOrder(TESTING_MD),
      navOrder(PORTABILITY_MD),
      navOrder(SCREENSHOTS_MD),
    ];

    expect(nonIntegers(orders)).toEqual([]);
    expect(duplicates(orders)).toEqual([]);
  });
});
