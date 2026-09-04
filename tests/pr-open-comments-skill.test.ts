// tests/pr-open-comments-skill.test.ts
//
// L2 tripwire (free, deterministic): fences the `pr-open-comments` RUNTIME
// skill (skills/pr-open-comments/SKILL.md) — a standalone review-triage
// utility distributed to Team's users.
// It fetches every unresolved review thread on a PR through GraphQL, verifies
// each comment against the current code (trust but verify), rates
// confidence in one recommendation per item after verification, and
// presents a globally numbered punch list for everything below the bar.
// Default mode auto-runs the full Authorized Execution path (apply → push
// → reply → resolve) for items above 90% confidence that pass every
// hard rule; carve-outs are absolute at any confidence; explicit user
// authorization applies the whole batch regardless of confidence.
//
// Every assertion is guarded so a not-yet-existing skill file yields a failed
// expect(), never an uncaught ENOENT — the mechanical gate rejects crashes,
// not clean assertion failures.

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";

const REPO_ROOT = process.cwd();
// pr-open-comments is a RUNTIME skill — under skills/ (distributed), not .claude/.
const SKILL = join(REPO_ROOT, "skills", "pr-open-comments", "SKILL.md");
const REFERENCES = join(REPO_ROOT, "skills", "pr-open-comments", "references");

// Defensive read: missing file → "" so content assertions FAIL (not throw).
function body(): string {
  if (!existsSync(SKILL) || !existsSync(REFERENCES)) return "";
  return [
    read(SKILL),
    ...readdirSync(REFERENCES)
      .filter((name) => /^\d\d-.*\.md$/.test(name))
      .sort()
      .map((name) => read(join(REFERENCES, name))),
  ].join("\n");
}
function fm(): string {
  return existsSync(SKILL) ? frontmatter(read(SKILL)) : "";
}
// Flatten newlines so multi-line prose can be matched in one regex.
function flat(text: string): string {
  return text.replace(/\n/g, " ");
}
// The Authorized Execution section, or "" when absent — ordering assertions
// against "" fail cleanly (every index is -1).
function authorizedSection(): string {
  const text = body();
  const start = text.search(/authorized execution/i);
  return start >= 0 ? text.slice(start) : "";
}

describe("pr-open-comments skill: runtime standalone utility frontmatter", () => {
  test("skill file lives under runtime skills/ (distributed)", () => {
    expect(existsSync(SKILL)).toBe(true);
  });

  test("frontmatter declares name: pr-open-comments", () => {
    expect(/^name:\s*pr-open-comments\s*$/m.test(fm())).toBe(true);
  });

  test("frontmatter carries argument-hint (PR number or URL)", () => {
    expect(/^argument-hint:/m.test(fm())).toBe(true);
  });

  test("frontmatter carries effort", () => {
    expect(/^effort:/m.test(fm())).toBe(true);
  });

  test("frontmatter does NOT set disable-model-invocation (model-invocable by design)", () => {
    const f = fm();
    // Guard: an empty frontmatter must fail, not vacuously pass the absence check.
    expect(f.length).toBeGreaterThan(0);
    expect(/^disable-model-invocation:/m.test(f)).toBe(false);
  });
});

describe("pr-open-comments skill: unresolved-thread fetch mechanics", () => {
  test("fetches reviewThreads via GraphQL filtered on isResolved", () => {
    const t = body();
    expect(t).toContain("reviewThreads");
    expect(t).toContain("isResolved");
    expect(/graphql/i.test(t)).toBe(true);
  });

  test("carries the >100-threads pagination note (after: cursors)", () => {
    const t = flat(body());
    expect(t).toContain("after:");
    expect(/100\s*threads|>\s*100/i.test(t)).toBe(true);
  });

  test("pins the pitfall: never rely on --json reviews for resolution state", () => {
    const t = flat(body());
    expect(t).toContain("--json reviews");
  });
});

describe("pr-open-comments skill: trust-but-verify verdicts", () => {
  test("names all four verification verdicts", () => {
    const t = body();
    expect(t).toContain("STILL RELEVANT");
    expect(t).toContain("ALREADY ADDRESSED");
    expect(t).toContain("STALE");
    expect(t).toContain("INACCURATE");
  });
});

describe("pr-open-comments skill: Authorized Execution path", () => {
  test("names the resolveReviewThread mutation", () => {
    expect(body()).toContain("resolveReviewThread");
  });

  test("the commit stages only the anchored files — never git add -A or commit -a", () => {
    expect(body()).toContain("git add -A");
  });
});

describe("pr-open-comments skill: input resolution + fail fast", () => {
  test("accepts a PR number, a full URL, or nothing (current branch's PR)", () => {
    expect(body()).toContain("gh pr view");
  });
});

describe("pr-open-comments skill: punch-list deliverable", () => {
  test("the report separates Auto-applied (confidence + SHA) from Needs your decision", () => {
    const t = body();
    expect(t).toContain("Auto-applied");
    expect(t).toContain("Needs your decision");
  });
});
