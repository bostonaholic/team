import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function skill(name: string): string {
  return readFileSync(join(ROOT, "skills", name, "SKILL.md"), "utf8");
}

function expectForbiddenClaimAbsent(text: string, pattern: RegExp, control: string): void {
  expect(pattern.test(control)).toBe(true);
  expect(pattern.test(text)).toBe(false);
}

function expectForbiddenTextAbsent(text: string, forbidden: string): void {
  expect(`positive control: ${forbidden}`).toContain(forbidden);
  expect(text).not.toContain(forbidden);
}

describe("redesigned methodology contracts", () => {
  test("QUESTION consumes the WORKTREE task schema without restoring the old task template", () => {
    const text = skill("decomposing-intent");
    expect(text).toContain("## Request");
    expect(text).toContain("workflow: team");
    expectForbiddenTextAbsent(text, "### 1-task.md");
    expectForbiddenTextAbsent(text, "## Stated goal");
    expectForbiddenTextAbsent(text, "## Inferred goal");
    expectForbiddenTextAbsent(text, "## Acceptance signals");
  });

  test("conditional PRDs are discovered as sibling artifacts", () => {
    const prd = skill("product-requirements-doc");
    const design = skill("authoring-designs");
    expect(prd).toContain("docs/plans/<id>/3-prd.md");
    expect(design).toContain("`3-prd.md`");
    expectForbiddenClaimAbsent(
      prd,
      /reference it from `1-task\.md`/,
      "Write the PRD and reference it from `1-task.md`.",
    );
    expectForbiddenClaimAbsent(
      design,
      /referenced `3-prd\.md`/,
      "Read any referenced `3-prd.md`.",
    );
  });

  test("design review uses the redesigned task section", () => {
    const text = skill("cross-model-review");
    expect(text).toContain("`## Request` section of `1-task.md`");
    expectForbiddenTextAbsent(text, "`## Stated goal`");
    expectForbiddenTextAbsent(text, "`## Inferred goal`");
    expectForbiddenTextAbsent(text, "`## Acceptance signals`");
  });

  test("IMPLEMENT records review completion before the coordinator advances", () => {
    const severity = skill("review-severity-tiers");
    expect(severity).toContain("`9-implementation.md`");
    expect(severity).toContain("`## Review notes`");
    expectForbiddenClaimAbsent(severity, /proceed to SHIP/, "PASS and proceed to SHIP");
    expect(skill("implementing-slices")).toContain("`team-implement`");
  });

  test("internal phase modules own their artifact writes", () => {
    expect(skill("researching-codebases")).toContain("`team-research`");
    expect(skill("product-thinking")).toContain("`## Request`");
  });
});
