import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { read } from "./helpers/text";

const REPO_ROOT = process.cwd();

// The shared defining clause is the contract: decision 5 mandates byte-identical
// wording across all three files. Plan.md ("Shared assets") gives the verbatim
// string, including the em-dashes. Each file is asserted to contain it.
const DEFINING_CLAUSE =
  "a comment that exists only because of the act of editing — describing the " +
  "change, the process, or a temporary state — and that must be cleaned up later";

// The bad-example cluster, drawn from the single shared example vocabulary
// (plan.md "Example vocabulary"). Every touched file shows this cluster.
const BAD_EXAMPLES = ["// added this", "// TODO remove later", "// changed from X", "// for now"];

// The verbatim escalation phrasing reused from code-reviewer.md's existing
// **Test files** bullet (design.md 68–70). Slice 3 reuses it for ephemeral
// comments.
const ESCALATION_PHRASING =
  "A single occurrence is a `suggestion:`; multiple occurrences across the diff become `issue:`.";

const SKILL_FILE = join(REPO_ROOT, "skills", "engineering-standards", "SKILL.md");
const IMPLEMENTER = join(REPO_ROOT, "agents", "implementer.md");
const CODE_REVIEWER = join(REPO_ROOT, "agents", "code-reviewer.md");

// Isolates the single `**Comments**:` definition-list item from the Clean Code
// Principles list: the lines from the `**Comments**` label up to (but not
// including) the next `- **` definition-list entry. Keeps the assertion scoped
// to the sharpened rule, not the whole file.
function commentsRule(text: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.includes("- **Comments**"));
  if (start === -1) return "";
  const out: string[] = [lines[start] ?? ""];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^- \*\*/.test(line)) break;
    out.push(line);
  }
  return out.join("\n");
}

describe("Slice 1: engineering-standards comment standard", () => {
  test('engineering-standards: comments rule names "ephemeral" and carries the shared defining clause', () => {
    const rule = commentsRule(read(SKILL_FILE));
    expect(rule).toContain("ephemeral");
    expect(rule).toContain(DEFINING_CLAUSE);
  });

  test("engineering-standards: rule shows bad and good examples", () => {
    const rule = commentsRule(read(SKILL_FILE));
    for (const bad of BAD_EXAMPLES) {
      expect(rule).toContain(bad);
    }
    // A durable "why" counter-example so the rule does not read as "strip all
    // comments" (design.md 144–145). Assert tokens unique to the good-example
    // sentence ("an invariant, workaround rationale, or business rule") so the
    // test fails if that sentence is stripped — "why" alone false-passes
    // because it appears in pre-existing rule text.
    expect(rule.toLowerCase()).toContain("invariant");
    expect(rule.toLowerCase()).toContain("workaround");
  });
});

describe("Slice 2: implementer ephemeral-comment rule", () => {
  test("implementer: code-quality has a named ephemeral-comment rule", () => {
    const text = read(IMPLEMENTER);
    expect(text).toContain("ephemeral");
    expect(text).toContain(DEFINING_CLAUSE);
  });

  test("implementer: rule scopes cleanup to the changed lines only", () => {
    const text = read(IMPLEMENTER).toLowerCase();
    // The rule must scope cleanup to the slice's own changed lines/functions
    // and leave pre-existing comments outside that scope alone (decision 4).
    expect(text).toContain("pre-existing");
    expect(text).toMatch(/within (the )?(lines|changed|scope)/);
  });

  test("implementer: rule shows bad and good examples", () => {
    const text = read(IMPLEMENTER);
    for (const bad of BAD_EXAMPLES) {
      expect(text).toContain(bad);
    }
    // Assert tokens unique to the good-example sentence so the test fails if
    // the durable counter-example is stripped (see Slice 1 rationale).
    expect(text.toLowerCase()).toContain("invariant");
    expect(text.toLowerCase()).toContain("workaround");
  });
});

describe("Slice 3: code-reviewer ephemeral-comment criterion", () => {
  test("code-reviewer: step 4 has an ephemeral-comment inspection criterion", () => {
    const text = read(CODE_REVIEWER);
    expect(text).toContain("ephemeral");
    expect(text).toContain(DEFINING_CLAUSE);
  });

  test("code-reviewer: criterion states the suggestion→issue threshold", () => {
    const text = read(CODE_REVIEWER);
    // The new criterion reuses the verbatim escalation phrasing. The phrasing
    // already exists once (the **Test files** bullet); the criterion adds a
    // second occurrence, so the count must exceed one.
    const occurrences = text.split(ESCALATION_PHRASING).length - 1;
    expect(occurrences).toBeGreaterThan(1);
  });

  test("code-reviewer: criterion distinguishes durable TODOs from ephemeral notes", () => {
    const text = read(CODE_REVIEWER);
    // A tracked, intent-bearing TODO is durable and allowed — the false-positive
    // guard (design.md 139–143). The `TODO(` token marks the tracked form.
    expect(text).toContain("TODO(ISSUE-123)");
  });
});
