// tests/pr-open-comments-skill.test.ts
//
// L2 tripwire (free, deterministic): fences the `pr-open-comments` RUNTIME
// skill (skills/pr-open-comments/SKILL.md) — a standalone review-triage
// utility distributed to Team's users (docs/plans/2026-07-24-pr-watch-loop).
// It fetches every unresolved review thread on a PR via GraphQL, verifies
// each comment against the current code (trust but verify), and presents a
// globally numbered punch list with options and one recommendation per item.
// Default mode is present-then-stop; the Authorized Execution path (push →
// 🤖 reply → resolve) activates only on explicit user authorization.
//
// Every assertion is guarded so a not-yet-existing skill file yields a failed
// expect(), never an uncaught ENOENT — the mechanical gate rejects crashes,
// not clean assertion failures.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";

const REPO_ROOT = process.cwd();
// pr-open-comments is a RUNTIME skill — under skills/ (distributed), not .claude/.
const SKILL = join(REPO_ROOT, "skills", "pr-open-comments", "SKILL.md");

// Defensive read: missing file → "" so content assertions FAIL (not throw).
function body(): string {
  return existsSync(SKILL) ? read(SKILL) : "";
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

  test("description carries the trigger-phrase convention incl. /pr-open-comments", () => {
    const f = flat(fm());
    expect(/description:.*Trigger on/i.test(f)).toBe(true);
    expect(f).toContain("/pr-open-comments");
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
    expect(
      /(never|do not|don't)[^.]{0,160}--json reviews|--json reviews[^.]{0,160}(resolution|resolved)/i.test(
        t,
      ),
    ).toBe(true);
  });
});

describe("pr-open-comments skill: present-then-stop Hard Rules", () => {
  test("Hard Rule: no edits to the working tree during triage", () => {
    expect(/no edits/i.test(flat(body()))).toBe(true);
  });

  test("Hard Rule: no replies posted during triage", () => {
    expect(/no replies/i.test(flat(body()))).toBe(true);
  });

  test("Hard Rule: no thread resolution during triage", () => {
    expect(/no resolution/i.test(flat(body()))).toBe(true);
  });

  test("Hard Rule: present the punch list, then stop and wait for the user", () => {
    const t = flat(body());
    expect(/present,?\s*then stop/i.test(t)).toBe(true);
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

  test("behavioral claims must be proven with a specific named test", () => {
    const t = flat(body());
    expect(/named test/i.test(t)).toBe(true);
    expect(/(reproduction|throwaway)[^.]{0,40}test/i.test(t)).toBe(true);
  });

  test("throwaway reproduction tests are deleted before the punch list is presented", () => {
    const t = flat(body());
    expect(/delete[d]?[^.]{0,160}(present|punch list|stag|commit)/i.test(t)).toBe(true);
  });
});

describe("pr-open-comments skill: Authorized Execution path", () => {
  test("activates only on explicit user authorization", () => {
    const t = flat(body());
    expect(/explicit(ly)?[^.]{0,120}(authoriz|direct|told)/i.test(t)).toBe(true);
  });

  test("per-comment order is push, then reply, then resolve", () => {
    const section = authorizedSection();
    const pushIdx = section.search(/push the (change|commit)/i);
    const replyIdx = section.search(/reply to the thread/i);
    const resolveIdx = section.search(/resolve the thread/i);
    expect(pushIdx).toBeGreaterThanOrEqual(0);
    expect(replyIdx).toBeGreaterThan(pushIdx);
    expect(resolveIdx).toBeGreaterThan(replyIdx);
  });

  test("replies carry the 🤖 AI-agent prefix", () => {
    expect(body()).toContain("🤖");
  });

  test("replies cite the commit SHA as bare text", () => {
    const t = flat(body());
    expect(/(commit )?SHA as bare text|bare[- ]text[^.]{0,40}SHA/i.test(t)).toBe(true);
  });

  test("names the resolveReviewThread mutation", () => {
    expect(body()).toContain("resolveReviewThread");
  });

  test("carve-out: declined / won't-fix items are never auto-resolved", () => {
    const t = flat(body());
    expect(/declined|won'?t[- ]fix/i.test(t)).toBe(true);
  });

  test("carve-out: needs-clarification items go back to the reviewer", () => {
    const t = flat(body());
    expect(/needs[- ]clarification/i.test(t)).toBe(true);
  });

  test("carve-out: could-not-apply — never reply \"done\" or resolve without landed code", () => {
    const t = flat(body());
    expect(/(don'?t|never)[^.]{0,60}reply[^.]{0,20}["“']?done["”']?/i.test(t)).toBe(true);
  });
});

describe("pr-open-comments skill: input resolution + fail fast", () => {
  test("accepts a PR number, a full URL, or nothing (current branch's PR)", () => {
    const t = flat(body());
    expect(/current branch/i.test(t)).toBe(true);
    expect(/URL/i.test(t)).toBe(true);
    expect(t).toContain("gh pr view");
  });

  test("fails fast with a clear message when no PR resolves from branch or argument", () => {
    const t = flat(body());
    expect(
      /(fail[s]? fast|clear message)[^.]{0,160}(no PR|PR)|no PR[^.]{0,160}(fail[s]? fast|stop|clear message)/i.test(
        t,
      ),
    ).toBe(true);
  });

  test("reports a malformed PR number or URL instead of guessing", () => {
    expect(/malformed/i.test(flat(body()))).toBe(true);
  });
});

describe("pr-open-comments skill: punch-list deliverable", () => {
  test("blocks are globally numbered and grouped by file", () => {
    const t = flat(body());
    expect(/globally number/i.test(t)).toBe(true);
    expect(/group(ed)?[^.]{0,60}by file/i.test(t)).toBe(true);
  });

  test("each item offers 2–4 tailored options and exactly one recommendation", () => {
    const t = flat(body());
    expect(/2[–-]4[^.]{0,60}option/i.test(t)).toBe(true);
    expect(/recommendation/i.test(t)).toBe(true);
  });
});
