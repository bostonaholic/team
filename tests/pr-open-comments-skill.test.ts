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

import { frontmatter, read, squash } from "./helpers/text";

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

// decision-making has no test file of its own — its one-way-door rule is
// exercised only through this call site, so its SKILL.md is read directly
// here, the same guarded-single-file pattern pr-watch-as-author-skill.test.ts
// uses for skills/team-pr/SKILL.md.
const DECISION_MAKING_SKILL = join(REPO_ROOT, "skills", "decision-making", "SKILL.md");
function decisionMakingBody(): string {
  return existsSync(DECISION_MAKING_SKILL) ? read(DECISION_MAKING_SKILL) : "";
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

// Regression: the reaction used to land at verdict time, so a punch-list item
// carried a public 👍 keyed to the agent's own verdict before the user had
// picked anything. A user who then judged the comment invalid could not
// retract it. The reaction is now a consequence of the chosen option, and the
// menu states which reaction each option places.
describe("pr-open-comments skill: the reaction follows the user's decision", () => {
  // The verification step, bounded by the next numbered step heading. "" when
  // either anchor moves, so the absence assertions below fail rather than pass
  // vacuously.
  function verifyStep(): string {
    const text = existsSync(join(REFERENCES, "04-execution.md")) ? read(join(REFERENCES, "04-execution.md")) : "";
    const start = text.indexOf("### Step 4");
    const end = text.indexOf("### Step 5");
    return start >= 0 && end > start ? text.slice(start, end) : "";
  }

  test("verification places no reaction — nothing is posted before the user picks", () => {
    const step = verifyStep();
    // Guard: a moved step heading must fail, not vacuously pass the absences.
    expect(step.length).toBeGreaterThan(0);
    expect(step).not.toContain("THUMBS_UP");
    expect(step).not.toContain("THUMBS_DOWN");
    expect(step).not.toContain("addReaction");
  });

  // The standard option menu's letters, read off the bullet list in step 7.
  function menuLetters(text: string): string[] {
    return [...text.matchAll(/^- \*\*([A-Z])\. /gm)].map((m) => m[1]!);
  }

  // The option-to-reaction table's letters, read off its rows.
  function tableLetters(text: string): string[] {
    return [...text.matchAll(/^\| ([A-Z])\. .*\|/gm)].map((m) => m[1]!);
  }

  test("the reaction table has one row per standard option, and no extras", () => {
    const text = existsSync(join(REFERENCES, "04-execution.md")) ? read(join(REFERENCES, "04-execution.md")) : "";
    const menu = menuLetters(text);
    // Guard: an unparsed menu must fail, not vacuously match an empty table.
    expect(menu.length).toBeGreaterThan(1);
    expect(tableLetters(text)).toEqual(menu);
  });

  test("every table row names the reaction its option places", () => {
    const text = existsSync(join(REFERENCES, "04-execution.md")) ? read(join(REFERENCES, "04-execution.md")) : "";
    const rows = [...text.matchAll(/^\| [A-Z]\. [^|]*\|([^|]*)\|/gm)].map((m) => m[1]!);
    expect(rows.length).toBeGreaterThan(1);
    for (const reaction of rows) {
      expect(/THUMBS_UP|THUMBS_DOWN|none/.test(reaction)).toBe(true);
    }
  });

  test("only one option is the clarification ask — C answers, G asks", () => {
    const text = existsSync(join(REFERENCES, "04-execution.md")) ? read(join(REFERENCES, "04-execution.md")) : "";
    // The two options both post a reply and touch no code, so a shared name in
    // their labels makes them read as duplicates. Only G's is the ask, and only
    // G is a Hard Rule 3 exclusion.
    const labels = [...text.matchAll(/^- \*\*([A-Z])\. ([^*]*)\*\*/gm)].map((m) => ({ letter: m[1]!, label: m[2]! }));
    expect(labels.length).toBeGreaterThan(1);
    expect(labels.filter((o) => /clarif/i.test(o.label)).map((o) => o.letter)).toEqual(["G"]);
  });

  test("both reaction content values appear in the option-to-reaction mapping", () => {
    const t = body();
    expect(t).toContain("THUMBS_UP");
    expect(t).toContain("THUMBS_DOWN");
  });

  test("the punch-list block reports the reaction as pending, never as already placed", () => {
    const t = body();
    expect(t.length).toBeGreaterThan(0);
    // `Reacted:` is the past-tense field the verdict-time reaction printed.
    expect(t).not.toContain("Reacted:");
  });

  test("an auto-applied item still reacts — the agent is authorized above the bar", () => {
    const text = existsSync(join(REFERENCES, "04-execution.md")) ? read(join(REFERENCES, "04-execution.md")) : "";
    const start = text.indexOf("### Step 6");
    const end = text.indexOf("### Step 7");
    const step = start >= 0 && end > start ? text.slice(start, end) : "";
    expect(step.length).toBeGreaterThan(0);
    expect(step).toContain("THUMBS_UP");
  });
});

// A one-way-door dispute this skill cannot settle routes to the user through
// the existing option G, instead of decision-making picking a side.
describe("pr-open-comments skill: a one-way-door dispute routes to the user through option G", () => {
  test("decision-making returns the framed choice, options, and classification instead of picking when the caller names an owner and the choice is a one-way door", () => {
    const t = squash(decisionMakingBody());
    expect(t).toContain("decision owner other than itself");
    expect(t).toContain("classifies as a one-way door");
    expect(t).toContain("return the framed choice, the options, and the classification");
    expect(t).toContain("Do not pick");
  });

  test("a two-way door keeps today's fast pick unchanged", () => {
    expect(squash(decisionMakingBody())).toContain("Two-way doors keep today's fast pick");
  });

  test("the pr-open-comments call site names the user as the decision owner", () => {
    const t = squash(body());
    const idx = t.indexOf("Call the Skill tool with `decision-making`");
    expect(idx).toBeGreaterThan(-1);
    const window = t.slice(idx, idx + 300);
    expect(window).toContain("decision owner");
  });

  test("a returned one-way-door choice's menu carries option G as the recommendation", () => {
    const t = squash(body());
    const idx = t.indexOf("Call the Skill tool with `decision-making`");
    expect(idx).toBeGreaterThan(-1);
    const window = t.slice(idx, idx + 500);
    expect(window).toContain("option G");
  });

  test("the option-G menu line keeps its bold label and widens who it asks", () => {
    const text = existsSync(join(REFERENCES, "04-execution.md")) ? read(join(REFERENCES, "04-execution.md")) : "";
    const t = squash(text);
    expect(t).toContain("**G. Needs clarification**");
    const idx = t.indexOf("G. Needs clarification");
    const line = t.slice(idx, idx + 200);
    expect(line).toContain("ask the reviewer when the ask itself is unclear");
    expect(line).toContain("present the choice to the user when the user owns it");
  });

  test("the authorized-execution G exclusion carries the same widened recipient text", () => {
    const text = existsSync(join(REFERENCES, "06-authorized-execution.md"))
      ? read(join(REFERENCES, "06-authorized-execution.md"))
      : "";
    const t = squash(text);
    const idx = t.indexOf("NEEDS CLARIFICATION");
    expect(idx).toBeGreaterThan(-1);
    const window = t.slice(idx, idx + 200);
    expect(window).toContain("ask the reviewer when the ask itself is unclear");
    expect(window).toContain("present the choice to the user when the user owns it");
  });
});
