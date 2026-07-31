// tests/groom-backlog-skill.test.ts
//
// L2 tripwire (free, deterministic): fences the `groom-backlog` RUNTIME skill
// (skills/groom-backlog/SKILL.md) — the fourth standalone utility distributed
// to Team's users. It grooms a project backlog: it loads the whole board in
// bulk, computes a gap inventory, clusters open issues by outcome, writes a
// plan file, asks the consequential questions with a recommendation each, and
// stops. Nothing on the tracker changes before the user answers.
//
// L2 and not L5: grooming drives a live tracker over the network and mutates
// shared state — the same heavy external state that keeps `shipit`,
// `pr-open-comments`, and `pr-watch` off L5. It cannot be honestly driven in
// one offline `claude -p` run, so its load-bearing rules are pinned here as
// prose assertions, where they cost milliseconds and nothing.
//
// Every assertion is guarded so a not-yet-existing skill file yields a failed
// expect(), never an uncaught ENOENT — the mechanical gate rejects crashes,
// not clean assertion failures.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";

const REPO_ROOT = process.cwd();
// groom-backlog is a RUNTIME skill — under skills/ (distributed), not .claude/.
const SKILL = join(REPO_ROOT, "skills", "groom-backlog", "SKILL.md");
// The canonical standalone-utility progress-tracking pointer lives here.
const SHIPIT_SKILL = join(REPO_ROOT, "skills", "shipit", "SKILL.md");
// The board doc is the stated source of truth for the `Ready` WIP limit.
const PROJECT_TRACKING = join(REPO_ROOT, "docs", "project-tracking.md");
// Defensive read: missing file → "" so content assertions FAIL (not throw).
function body(): string {
  return existsSync(SKILL) ? read(SKILL) : "";
}
function fm(): string {
  return existsSync(SKILL) ? frontmatter(read(SKILL)) : "";
}
// The skill with its frontmatter stripped. The `description:` field restates
// several load-bearing rules for the trigger cue, so an assertion that must
// land in the method itself reads this instead of the whole file. Missing
// frontmatter → "" so scoped assertions fail, never vacuously pass.
function prose(): string {
  const text = body();
  const front = frontmatter(text);
  if (!front) return "";
  const end = text.indexOf(front) + front.length;
  return text.slice(end);
}
// Flatten newlines so multi-line prose can be matched in one regex.
function flat(text: string): string {
  return text.replace(/\n/g, " ");
}

// The two contiguous pointer lines from skills/shipit/SKILL.md, derived rather
// than hardcoded so drift in either file fails loudly. Missing file or missing
// pointer → "" so the containment assertion fails, never throws.
function shipitPointer(): string {
  if (!existsSync(SHIPIT_SKILL)) return "";
  const lines = read(SHIPIT_SKILL).split("\n");
  const start = lines.findIndex((line) =>
    line.startsWith("> Follow `skills/progress-tracking/SKILL.md`"),
  );
  if (start < 0 || start + 1 >= lines.length) return "";
  return `${lines[start]}\n${lines[start + 1]}`;
}

// Byte offsets [start, end) of a `## ` section, so one section's position can
// be compared against another's and a substring can be proved to fall inside
// one. Missing heading → [-1, -1] so ordering assertions fail, never throw.
function sectionSpan(heading: string): [number, number] {
  const text = body();
  const start = text.indexOf(`${heading}\n`);
  if (start < 0) return [-1, -1];
  const rest = text.slice(start + heading.length);
  const end = rest.indexOf("\n## ");
  return [start, end < 0 ? text.length : start + heading.length + end];
}

// The slice of the skill from a `## ` heading up to the next `## ` heading,
// derived from sectionSpan so the two cannot drift apart. Missing heading → ""
// so scoped assertions fail, never throw.
function section(heading: string): string {
  const [start, end] = sectionSpan(heading);
  if (start < 0) return "";
  return body().slice(start + heading.length, end);
}

// The `Ready` WIP limit, read out of the board doc that declares itself the
// source of truth. Missing file or pattern → "" so assertions fail, never throw.
function readyWipLimit(): string {
  if (!existsSync(PROJECT_TRACKING)) return "";
  return read(PROJECT_TRACKING).match(/capped at \*\*(\d+)\*\* cards/)?.[1] ?? "";
}

describe("groom-backlog skill: frontmatter", () => {
  test("skill file lives under runtime skills/ (distributed)", () => {
    expect(existsSync(SKILL)).toBe(true);
  });

  test("frontmatter declares name: groom-backlog", () => {
    expect(/^name:\s*groom-backlog\s*$/m.test(fm())).toBe(true);
  });

  test("description carries a trigger sentence naming /groom-backlog", () => {
    const f = flat(fm());
    expect(/description:.*Trigger on/i.test(f)).toBe(true);
    expect(f).toContain("/groom-backlog");
  });

  test("frontmatter carries argument-hint (the board reference)", () => {
    expect(/^argument-hint:/m.test(fm())).toBe(true);
  });

  test("frontmatter pins effort: high (judgment-heavy, like pr-open-comments)", () => {
    expect(/^effort: high$/m.test(fm())).toBe(true);
  });

  test("frontmatter does NOT set disable-model-invocation (model-invocable by design)", () => {
    const f = fm();
    // Guard: an empty frontmatter must fail, not vacuously pass the absence check.
    expect(f.length).toBeGreaterThan(0);
    expect(/^disable-model-invocation:/m.test(f)).toBe(false);
  });
});

describe("groom-backlog skill: pointer copied from shipit", () => {
  test("carries the standalone-utility progress-tracking pointer byte-for-byte", () => {
    const pointer = shipitPointer();
    // Guard: a pointer we failed to extract must fail, not vacuously pass.
    expect(pointer.length).toBeGreaterThan(0);
    expect(body()).toContain(pointer);
  });
});

describe("groom-backlog skill: the bulk load refuses a partial board", () => {
  test("the bulk load passes an explicit --limit", () => {
    expect(prose()).toContain("--limit");
  });

  test("the bulk load asserts totalCount equals the number fetched", () => {
    const t = flat(prose());
    expect(t).toContain("totalCount");
  });

  test("each bare-array query is checked against the limit it was given", () => {
    const t = flat(prose());
    // A bare JSON array carries no count, so `totalCount` cannot cover it —
    // the fetched length is compared against the limit instead.
    expect(/--argjson limit/.test(t)).toBe(true);
  });
});

describe("groom-backlog skill: tracker text never reaches a shell argument", () => {
  test("the write recipes pass every body by file or on stdin", () => {
    const recipes = section("## Tracker recipes");
    expect(recipes.length).toBeGreaterThan(0);
    // The two write shapes that carry prose: an issue body and a request body.
    expect(recipes).toContain("--body-file");
    expect(recipes).toContain("--input");
    // Stdin, the shape pr-open-comments uses for reply text.
    expect(recipes).toContain("-F body=@-");
    // A cached title reaches the command as a variable, never as pasted prose.
    expect(recipes).toContain("jq -r");
  });

  test("no write recipe interpolates a body or description into a quoted argument", () => {
    const recipes = section("## Tracker recipes");
    expect(recipes.length).toBeGreaterThan(0);
    // `-f description="…"` / `--body "…"` are the shapes that splice prose into
    // the command line, where a backtick or $(…) in the text would execute.
    expect(/-f\s+(description|title|body)=/.test(recipes)).toBe(false);
    expect(/--body\s+"/.test(recipes)).toBe(false);
  });

  test("a description rewrite caches the pre-image first", () => {
    const t = flat(prose());
    expect(/original-body-/.test(t)).toBe(true);
  });
});

describe("groom-backlog skill: the approval prompt covers what the plan contains", () => {
  test("the completion template is scoped by mode", () => {
    const completion = flat(section("## Completion"));
    expect(completion.length).toBeGreaterThan(0);
    expect(/\*\*Board mode\.\*\*/.test(completion)).toBe(true);
    expect(/\*\*Promotion mode\.\*\*/.test(completion)).toBe(true);
  });
});

describe("groom-backlog skill: promotion contract", () => {
  // The cap is duplicated: docs/project-tracking.md declares it and the skill
  // quotes it as its worked example. Derive the numeral from the doc so a change
  // there fails here rather than leaving the skill promoting into a stale cap.
  test("the promotion cap is the same numeral docs/project-tracking.md declares", () => {
    const limit = readyWipLimit();
    expect(limit.length).toBeGreaterThan(0);
    const promotion = flat(section("## The promotion standard"));
    expect(promotion).toContain(`limited to ${limit}`);
    expect(promotion).toContain(`above ${limit}`);
  });

});

describe("groom-backlog skill: mode dispatch and the extraction seam", () => {
  // Half two is loadable methodology: it states its own inputs and its own
  // standard, so a future grooming agent can load the section verbatim.
  const UPWARD_REFERENCES = ["$ARGUMENTS", "--promote", "cluster", "board-level pass"];

  test("the promotion standard makes no upward reference", () => {
    const promotion = section("## The promotion standard");
    // Guard: a missing section must fail, not vacuously pass the absence checks.
    expect(promotion.length).toBeGreaterThan(0);
    for (const reference of UPWARD_REFERENCES) {
      expect(promotion).not.toContain(reference);
    }
  });

  test("the promotion standard sits below both sections that reach it", () => {
    const [promotionStart] = sectionSpan("## The promotion standard");
    const [inputStart] = sectionSpan("## Input");
    const [passStart] = sectionSpan("## The board-level pass");
    expect(inputStart).toBeGreaterThan(-1);
    expect(passStart).toBeGreaterThan(-1);
    expect(promotionStart).toBeGreaterThan(inputStart);
    expect(promotionStart).toBeGreaterThan(passStart);
  });

  test("## Input is the only section that reads $ARGUMENTS", () => {
    const text = body();
    const [inputStart, inputEnd] = sectionSpan("## Input");
    expect(inputStart).toBeGreaterThan(-1);
    expect(inputEnd).toBeGreaterThan(inputStart);
    let index = text.indexOf("$ARGUMENTS");
    // Guard: an absent token must fail, not vacuously pass the loop below.
    expect(index).toBeGreaterThan(-1);
    while (index >= 0) {
      expect(index).toBeGreaterThanOrEqual(inputStart);
      expect(index).toBeLessThan(inputEnd);
      index = text.indexOf("$ARGUMENTS", index + 1);
    }
  });
});

// Dependency analysis is the one mutation class whose failure mode is silent
// and inverted: a link drawn backwards parks startable work behind a
// non-prerequisite, and the board reads as if someone checked. These pin the
// rules that make that failure impossible to reach accidentally.
describe("groom-backlog skill: dependency analysis", () => {
  test("declared links ride the bulk load instead of a per-issue call", () => {
    const load = section("### Step 1 — Load once, in bulk");
    expect(load.length).toBeGreaterThan(0);
    // The gh field names, so a rename upstream fails here rather than at runtime.
    expect(load).toContain("blockedBy");
    expect(load).toContain("blocking");
  });

  test("a short link connection is recorded, not silently treated as unlinked", () => {
    const t = flat(prose());
    // Same completeness doctrine the board and comment loads already carry.
    expect(t).toContain("unloaded-links");
    expect(/totalCount/.test(section("### Step 1 — Load once, in bulk"))).toBe(true);
  });

  test("dependency analysis runs before the plan is written", () => {
    const [dependencyStart] = sectionSpan("### Step 4 — Find the dependencies, then propose the links");
    const [planStart] = sectionSpan("### Step 5 — Write the plan to a file");
    expect(dependencyStart).toBeGreaterThan(-1);
    expect(planStart).toBeGreaterThan(dependencyStart);
  });

  test("an inferred link is a proposal that needs its own answer", () => {
    // Dependency links are a named question class, so the plan cannot fold
    // them into an adjacent approval.
    const ask = flat(section("### Step 6 — Present the consequential choices and wait"));
    expect(ask.length).toBeGreaterThan(0);
    expect(/\*\*dependency links\*\*/i.test(ask)).toBe(true);
  });

  test("the link recipe resolves a database id and sends it as an integer", () => {
    const recipes = section("## Tracker recipes");
    expect(recipes.length).toBeGreaterThan(0);
    expect(recipes).toContain("dependencies/blocked_by");
    // The endpoint is keyed by database id; the issue number and the cached
    // GraphQL node id are both wrong, and only one of them fails loudly.
    expect(recipes).toContain("--jq .id");
    // `-f issue_id=` sends a string and the endpoint rejects it 422.
    expect(recipes).toContain("-F issue_id=");
    expect(/-f\s+issue_id=/.test(recipes)).toBe(false);
  });

});

describe("groom-backlog skill: sanctioned vocabulary", () => {
  test("never claims a human gate, a human contract, or a design gate", () => {
    const t = body();
    // Guard: an empty body must fail, not vacuously pass the absence check.
    expect(t.length).toBeGreaterThan(0);
    expect(
      /human[ -]gate|human (approval|design) gate|human contract|design[ -]gate/i.test(t),
    ).toBe(false);
  });
});
