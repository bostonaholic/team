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
// Ceiling on the skill's length. A skill this long stops being loadable, and
// nothing else in the suite caps it: groom-backlog is deliberately outside the
// NEW_SKILLS list whose 500-line cap tests/thin-agents.test.ts enforces.
//
// Raised 450 -> 585 when dependency analysis landed: the skill grew a fifth
// mutation class with its own discovery method, its own REST surface, and its
// own hard rule. That put it past the 500-line cap every other new skill lives
// under, which is a real signal and not a free one — the next feature that
// needs room should EXTRACT the method into a loadable methodology skill
// (the capability-vs-fragment doctrine) rather than raise this number again.
const LINE_CEILING = 585;

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

describe("groom-backlog skill: length budget", () => {
  test(`the skill body stays at or under ${LINE_CEILING} lines`, () => {
    const lines = body().split("\n").length - 1;
    // Guard: a missing file yields 0 and must fail, not vacuously pass.
    expect(lines).toBeGreaterThan(0);
    expect(lines).toBeLessThanOrEqual(LINE_CEILING);
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

describe("groom-backlog skill: plan file before approval question", () => {
  test("the board pass writes the plan file before it asks the approval question", () => {
    const pass = flat(section("## The board-level pass"));
    const planWriteIdx = pass.search(
      /writ(e|es|ing|ten)[^.]{0,100}plan file|plan file[^.]{0,80}(is |gets )?writt?en/i,
    );
    const questionIdx = pass.search(
      /approval question|ask(s|ing)?[^.]{0,80}(the )?(four|consequential) question/i,
    );
    expect(planWriteIdx).toBeGreaterThanOrEqual(0);
    expect(questionIdx).toBeGreaterThan(planWriteIdx);
  });
});

// Scoped to prose(), not body(): the frontmatter description states the
// plan-ask-wait contract for the trigger cue, and an assertion satisfied by
// that restatement alone would pass on a skill whose method dropped the rule.
describe("groom-backlog skill: nothing mutates before the user answers", () => {
  test("no tracker mutation happens before the user answers", () => {
    const t = flat(prose());
    expect(
      /(nothing|no mutation|never|not)[^.]{0,200}(before|until)[^.]{0,100}(the user answers|answers|approv)/i.test(
        t,
      ),
    ).toBe(true);
  });

  test("the read-and-plan phase stops before any mutation", () => {
    const t = flat(prose());
    expect(/stops? before any mutation/i.test(t)).toBe(true);
  });

  test("the run waits for the user's approval instead of proceeding on its own", () => {
    const t = flat(prose());
    expect(
      /wait(s|ing)?[^.]{0,120}(the user'?s? |an? )?(answer|approval)|wait(s|ing)? for the user/i.test(
        t,
      ),
    ).toBe(true);
  });
});

describe("groom-backlog skill: the bulk load refuses a partial board", () => {
  test("the bulk load passes an explicit --limit", () => {
    expect(prose()).toContain("--limit");
  });

  test("the bulk load asserts totalCount equals the number fetched", () => {
    const t = flat(prose());
    expect(t).toContain("totalCount");
    expect(/totalCount[^.]{0,100}(==|equals?|match(es)?)[^.]{0,60}fetch/i.test(t)).toBe(true);
  });

  test("each bare-array query is checked against the limit it was given", () => {
    const t = flat(prose());
    // A bare JSON array carries no count, so `totalCount` cannot cover it —
    // the fetched length is compared against the limit instead.
    expect(/--argjson limit/.test(t)).toBe(true);
    expect(/bare arrays? [^.]{0,80}no count|no count at all/i.test(t)).toBe(true);
  });

  test("the comment-fetch cap is stated as a number", () => {
    const t = flat(prose());
    expect(/one page of 100 comments per issue/i.test(t)).toBe(true);
    expect(/unloaded-threads/i.test(t)).toBe(true);
  });

  test("a shortfall fails loudly instead of grooming a partial board", () => {
    const t = flat(prose());
    expect(/partial board/i.test(t)).toBe(true);
    expect(
      /(fail|stop)[^.]{0,160}(loud|partial board)|partial board[^.]{0,160}(fail|stop)/i.test(t),
    ).toBe(true);
  });
});

describe("groom-backlog skill: issue bodies and comments are untrusted data", () => {
  test("issue bodies and comments are named untrusted data", () => {
    const t = flat(prose());
    expect(/untrusted/i.test(t)).toBe(true);
    expect(
      /issue bod(y|ies)[^,.]{0,80}comment|comment[^,.]{0,80}issue bod(y|ies)/i.test(t),
    ).toBe(true);
  });

  test("an embedded imperative is reported as content, never executed", () => {
    const t = flat(prose());
    expect(/reported as content, never executed/i.test(t)).toBe(true);
  });

  // The rule has to reach promotion mode, which reads one body plus every
  // comment on it and folds the thread into a rewritten description — and which
  // runs none of the numbered board steps.
  test("the untrusted-data rule is a hard rule, not a step-local aside", () => {
    const rules = flat(section("## Hard rules"));
    expect(rules.length).toBeGreaterThan(0);
    expect(/untrusted data/i.test(rules)).toBe(true);
    expect(/reported as content, never executed/i.test(rules)).toBe(true);
    expect(/no approval relaxes this rule|never relaxes/i.test(rules)).toBe(true);
  });

  test("the untrusted-data rule is restated inside the promotion standard", () => {
    const promotion = flat(section("## The promotion standard"));
    expect(promotion.length).toBeGreaterThan(0);
    expect(/untrusted data/i.test(promotion)).toBe(true);
    expect(/reported as content, never executed/i.test(promotion)).toBe(true);
  });

  test("mutations stay bound to the planned item and rewrites are authored, not lifted", () => {
    const t = flat(prose());
    expect(/bound to the (one )?item/i.test(t)).toBe(true);
    expect(/never lifted verbatim|never lift(ed)?[^.]{0,60}verbatim/i.test(t)).toBe(true);
  });
});

describe("groom-backlog skill: tracker text never reaches a shell argument", () => {
  test("a hard rule forbids interpolating tracker-derived text into a command", () => {
    const rules = flat(section("## Hard rules"));
    expect(rules.length).toBeGreaterThan(0);
    expect(/never interpolate[^.]{0,80}shell command/i.test(rules)).toBe(true);
  });

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
    expect(/no cached pre-image does not run|cache the (current|original) body/i.test(t)).toBe(
      true,
    );
  });
});

describe("groom-backlog skill: the approval prompt covers what the plan contains", () => {
  test("questions are one per mutation class, not a fixed count", () => {
    const t = flat(prose());
    expect(/one question per mutation class/i.test(t)).toBe(true);
    expect(/never a fixed count/i.test(t)).toBe(true);
  });

  test("filing a new issue needs its own explicit answer", () => {
    const t = flat(prose());
    expect(
      /fil(e|ing) a new issue[^.]{0,80}own question|new issue[^.]{0,80}own answer/i.test(t),
    ).toBe(true);
    expect(/only on an explicit answer/i.test(t)).toBe(true);
  });

  test("the completion template is scoped by mode", () => {
    const completion = flat(section("## Completion"));
    expect(completion.length).toBeGreaterThan(0);
    expect(/\*\*Board mode\.\*\*/.test(completion)).toBe(true);
    expect(/\*\*Promotion mode\.\*\*/.test(completion)).toBe(true);
    // "the four questions" was the board-mode-only wording a promotion run was
    // told to print; the count must not come back.
    expect(/the four questions/i.test(completion)).toBe(false);
  });
});

describe("groom-backlog skill: every hard rule present", () => {
  test("decision, investigation, and spike tickets stay open", () => {
    const t = flat(body());
    expect(
      /(never|do not|don'?t)[^.]{0,60}close[^.]{0,120}(decision|investigation|spike)/i.test(t),
    ).toBe(true);
    expect(/leave(s)? it open|stays? open|left open/i.test(t)).toBe(true);
  });

  test("label writes are additive and the surviving labels are verified", () => {
    const t = flat(body());
    expect(/label writes are additive/i.test(t)).toBe(true);
    expect(/verify[^.]{0,120}labels? survived|labels? survived/i.test(t)).toBe(true);
  });

  test("a split ticket's original description is never rewritten", () => {
    const t = flat(body());
    expect(
      /(never|do not|don'?t)[^.]{0,80}rewrite[^.]{0,80}split ticket/i.test(t),
    ).toBe(true);
  });

  test("no priority, assignee, or state change on someone else's in-flight work", () => {
    const t = flat(body());
    expect(/priority, assignee, or state/i.test(t)).toBe(true);
    expect(/in[- ]flight/i.test(t)).toBe(true);
    // "someone else" and "in flight" are only decidable against named inputs:
    // the authenticated login, and the board's in-progress states.
    expect(/gh api user/.test(t)).toBe(true);
    expect(/in-progress states/i.test(t)).toBe(true);
  });

  test("scope is never invented; a missing issue is asked about first", () => {
    const t = flat(body());
    expect(/(do not|don'?t|never) invent scope/i.test(t)).toBe(true);
    expect(/ask[^.]{0,80}before[^.]{0,60}fil(e|ing)/i.test(t)).toBe(true);
  });

  test("no comments or project updates without explicit approval", () => {
    const t = flat(body());
    expect(
      /(do not|don'?t|never)[^.]{0,60}post comments or project updates/i.test(t),
    ).toBe(true);
    expect(/without[^.]{0,60}explicit approval/i.test(t)).toBe(true);
  });

  test("tickets are written for the audience the tracker serves", () => {
    const t = flat(body());
    expect(/for the audience the tracker serves/i.test(t)).toBe(true);
    expect(/implementation[- ]notes/i.test(t)).toBe(true);
  });

  test("a target date in the past is worse than no date", () => {
    const t = flat(body());
    expect(/date in the past is worse than no date/i.test(t)).toBe(true);
  });
});

describe("groom-backlog skill: promotion contract", () => {
  test("a bug is never promoted and its card never moves", () => {
    const t = flat(body());
    expect(/never promoted to `?Ready`?/i.test(t)).toBe(true);
    // `Bugs` is already the ready-to-pull state for a bug, so there is nothing
    // to promote it into (docs/project-tracking.md).
    expect(/ready-to-pull state/i.test(t)).toBe(true);
    expect(/the card never moves|never moves? the card/i.test(t)).toBe(true);
  });

  test("Ready at exactly 5 swaps a card back to Backlog and never exceeds the cap", () => {
    const t = flat(body());
    expect(/limited to 5|capped at 5/i.test(t)).toBe(true);
    expect(/swap(ping|s)? a card back to `?Backlog`?/i.test(t)).toBe(true);
    expect(/never exceed(ing|s)? the cap/i.test(t)).toBe(true);
  });

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

  test("a Ready already above the cap is reported as a pre-existing breach, not added to", () => {
    const t = flat(body());
    expect(/pre-existing breach/i.test(t)).toBe(true);
    expect(/add nothing/i.test(t)).toBe(true);
  });

  test("promotion mode skips the nine board steps and does the narrow load instead", () => {
    const t = flat(body());
    expect(/skips?[^.]{0,80}steps 1[–-]9/i.test(t)).toBe(true);
    expect(/narrow load/i.test(t)).toBe(true);
  });

  test("an open blocker drops the card move but keeps the rewrite and the priority", () => {
    const promotion = flat(section("## The promotion standard"));
    expect(promotion.length).toBeGreaterThan(0);
    expect(/a blocked item is not ready/i.test(promotion)).toBe(true);
    // The card move is move 4; the other three still stand, so a blocked
    // ticket still gets clarified while it waits.
    expect(/drops move 4/i.test(promotion)).toBe(true);
    // A closed blocker is satisfied, not missing — state decides, not presence.
    expect(/check state, not presence/i.test(promotion)).toBe(true);
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

  test("a missing, non-numeric, or repeated --promote value stops before any read", () => {
    const t = flat(body());
    expect(
      /missing, non-numeric, or (repeated|given more than once)[^.]{0,60}stops? before any read/i.test(
        t,
      ),
    ).toBe(true);
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
    // The whole point of using these fields: no N+1 walk over the board.
    expect(/never a per-issue call|no per-issue call/i.test(flat(load))).toBe(true);
  });

  test("a short link connection is recorded, not silently treated as unlinked", () => {
    const t = flat(prose());
    // Same completeness doctrine the board and comment loads already carry.
    expect(t).toContain("unloaded-links");
    expect(/totalCount/.test(section("### Step 1 — Load once, in bulk"))).toBe(true);
  });

  test("the gap inventory computes dependency hygiene rather than eyeballing it", () => {
    const inventory = flat(section("### Step 2 — Compute the gap inventory, do not eyeball it"));
    expect(inventory.length).toBeGreaterThan(0);
    // The inversion the board most needs caught: advertised-but-unstartable work.
    expect(/blocker still open|declared blocker/i.test(inventory)).toBe(true);
    expect(/cycle/i.test(inventory)).toBe(true);
  });

  test("undeclared dependencies are discovered from text and structure", () => {
    const step = section("### Step 4 — Find the dependencies, then propose the links");
    expect(step.length).toBeGreaterThan(0);
    const t = flat(step);
    expect(/declared/i.test(t)).toBe(true);
    expect(/undeclared/i.test(t)).toBe(true);
    // A bare cross-reference is a citation, not a dependency — the single
    // most common false positive this step can produce.
    expect(/citation,\s+not\s+a\s+dependency/i.test(t)).toBe(true);
  });

  test("dependency analysis runs before the plan is written", () => {
    const [dependencyStart] = sectionSpan("### Step 4 — Find the dependencies, then propose the links");
    const [planStart] = sectionSpan("### Step 5 — Write the plan to a file");
    expect(dependencyStart).toBeGreaterThan(-1);
    expect(planStart).toBeGreaterThan(dependencyStart);
  });

  test("an inferred link is a proposal that needs its own answer", () => {
    const t = flat(prose());
    expect(/proposal/i.test(t)).toBe(true);
    // Dependency links are a named question class, so the plan cannot fold
    // them into an adjacent approval.
    const ask = flat(section("### Step 6 — Present the consequential choices and wait"));
    expect(ask.length).toBeGreaterThan(0);
    expect(/\*\*dependency links\*\*/i.test(ask)).toBe(true);
  });

  test("a hard rule fixes link direction and forbids drawing one unapproved", () => {
    const rules = flat(section("## Hard rules"));
    expect(rules.length).toBeGreaterThan(0);
    expect(/never draw a dependency link[^.]{0,80}never draw one backwards/i.test(rules)).toBe(
      true,
    );
    // Direction is decided by completion, not by which issue was filed first.
    expect(/cannot be \*finished\*[^.]{0,40}lands/i.test(rules)).toBe(true);
    expect(/never close a cycle/i.test(rules)).toBe(true);
    // A link the pass did not propose carries a rationale the cache lacks.
    expect(/never delete a link[^.]{0,60}did not propose/i.test(rules)).toBe(true);
  });

  test("the link recipe resolves a database id and sends it as an integer", () => {
    const recipes = section("## Tracker recipes");
    expect(recipes.length).toBeGreaterThan(0);
    expect(recipes).toContain("dependencies/blocked_by");
    // The endpoint is keyed by database id; the issue number and the cached
    // GraphQL node id are both wrong, and only one of them fails loudly.
    expect(recipes).toContain("--jq .id");
    expect(/database id, not issue number/i.test(flat(recipes))).toBe(true);
    // `-f issue_id=` sends a string and the endpoint rejects it 422.
    expect(recipes).toContain("-F issue_id=");
    expect(/-f\s+issue_id=/.test(recipes)).toBe(false);
  });

  test("a link is verified by direction, not by the mere existence of an edge", () => {
    const t = flat(prose());
    expect(/confirm(ing)?\s+the\s+direction/i.test(t)).toBe(true);
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
