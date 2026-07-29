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

// The slice of the skill from a `## ` heading up to the next `## ` heading.
// Missing heading → "" so scoped assertions fail, never throw.
function section(heading: string): string {
  const text = body();
  const start = text.indexOf(`${heading}\n`);
  if (start < 0) return "";
  const rest = text.slice(start + heading.length);
  const end = rest.indexOf("\n## ");
  return end < 0 ? rest : rest.slice(0, end);
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

describe("groom-backlog skill: nothing mutates before the user answers", () => {
  test("no tracker mutation happens before the user answers", () => {
    const t = flat(body());
    expect(
      /(nothing|no mutation|never|not)[^.]{0,200}(before|until)[^.]{0,100}(the user answers|answers|approv)/i.test(
        t,
      ),
    ).toBe(true);
  });

  test("the read-and-plan phase stops before any mutation", () => {
    const t = flat(body());
    expect(/stops? before any mutation/i.test(t)).toBe(true);
  });

  test("the run waits for the user's approval instead of proceeding on its own", () => {
    const t = flat(body());
    expect(
      /wait(s|ing)?[^.]{0,120}(the user'?s? |an? )?(answer|approval)|wait(s|ing)? for the user/i.test(
        t,
      ),
    ).toBe(true);
  });
});

describe("groom-backlog skill: the bulk load refuses a partial board", () => {
  test("the bulk load passes an explicit --limit", () => {
    expect(body()).toContain("--limit");
  });

  test("the bulk load asserts totalCount equals the number fetched", () => {
    const t = flat(body());
    expect(t).toContain("totalCount");
    expect(/totalCount[^.]{0,100}(==|equals?|match(es)?)[^.]{0,60}fetch/i.test(t)).toBe(true);
  });

  test("a shortfall fails loudly instead of grooming a partial board", () => {
    const t = flat(body());
    expect(/partial board/i.test(t)).toBe(true);
    expect(
      /(fail|stop)[^.]{0,160}(loud|partial board)|partial board[^.]{0,160}(fail|stop)/i.test(t),
    ).toBe(true);
  });
});

describe("groom-backlog skill: issue bodies and comments are untrusted data", () => {
  test("issue bodies and comments are named untrusted data", () => {
    const t = flat(body());
    expect(/untrusted/i.test(t)).toBe(true);
    expect(/issue bod(y|ies)[^.]{0,80}comment|comment[^.]{0,80}issue bod(y|ies)/i.test(t)).toBe(
      true,
    );
  });

  test("an embedded imperative is reported as content, never executed", () => {
    const t = flat(body());
    expect(/reported as content, never executed/i.test(t)).toBe(true);
  });
});

describe("groom-backlog skill: all eight hard rules present", () => {
  test("rule 1 — a decision, investigation, or spike ticket stays open", () => {
    const t = flat(body());
    expect(
      /(never|do not|don'?t)[^.]{0,60}close[^.]{0,120}(decision|investigation|spike)/i.test(t),
    ).toBe(true);
    expect(/leave(s)? it open|stays? open|left open/i.test(t)).toBe(true);
  });

  test("rule 2 — label writes are additive and the surviving labels are verified", () => {
    const t = flat(body());
    expect(/label writes are additive/i.test(t)).toBe(true);
    expect(/verify[^.]{0,120}labels? survived|labels? survived/i.test(t)).toBe(true);
  });

  test("rule 3 — a split ticket's original description is never rewritten", () => {
    const t = flat(body());
    expect(
      /(never|do not|don'?t)[^.]{0,80}rewrite[^.]{0,80}split ticket/i.test(t),
    ).toBe(true);
  });

  test("rule 4 — no priority, assignee, or state change on someone else's in-flight work", () => {
    const t = flat(body());
    expect(/priority, assignee, or state/i.test(t)).toBe(true);
    expect(/in[- ]flight/i.test(t)).toBe(true);
  });

  test("rule 5 — scope is never invented; a missing issue is asked about first", () => {
    const t = flat(body());
    expect(/(do not|don'?t|never) invent scope/i.test(t)).toBe(true);
    expect(/ask[^.]{0,80}before[^.]{0,60}fil(e|ing)/i.test(t)).toBe(true);
  });

  test("rule 6 — no comments or project updates without explicit approval", () => {
    const t = flat(body());
    expect(
      /(do not|don'?t|never)[^.]{0,60}post comments or project updates/i.test(t),
    ).toBe(true);
    expect(/without[^.]{0,60}explicit approval/i.test(t)).toBe(true);
  });

  test("rule 7 — tickets are written for the audience the tracker serves", () => {
    const t = flat(body());
    expect(/for the audience the tracker serves/i.test(t)).toBe(true);
    expect(/implementation[- ]notes/i.test(t)).toBe(true);
  });

  test("rule 8 — a target date in the past is worse than no date", () => {
    const t = flat(body());
    expect(/date in the past is worse than no date/i.test(t)).toBe(true);
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
