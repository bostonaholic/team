// tests/team-pr-screenshots.test.ts
//
// L2 tripwires (free, deterministic): fence the Screenshots contract in the
// team-pr RUNTIME skill (skills/team-pr/SKILL.md), per
// docs/plans/2026-07-20-pr-ui-screenshots. team-pr renders a `## Screenshots`
// PR-body section from ux-reviewer's capture manifest (slice 2), then uploads
// the PNGs through GitHub's user-attachments pipeline and embeds inline image
// URLs (slice 3). Every degradation branch ends with an open PR and a visible
// note — the PR phase is not a human gate.
//
// Every assertion is guarded so a not-yet-existing skill section yields a
// failed expect(), never an uncaught ENOENT — the mechanical gate rejects
// crashes, not clean assertion failures.

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { read } from "./helpers/text";
import { loadsSkill } from "./helpers/skill-refs";

const REPO_ROOT = process.cwd();
// team-pr is a RUNTIME skill — it lives under skills/ (distributed).
const TEAM_PR_SKILL = join(REPO_ROOT, "skills", "team-pr", "SKILL.md");
const REFERENCES = join(REPO_ROOT, "skills", "team-pr", "references");

// Defensive read: missing file → "" so content assertions FAIL (not throw).
function body(): string {
  if (!existsSync(TEAM_PR_SKILL) || !existsSync(REFERENCES)) return "";
  return [
    read(TEAM_PR_SKILL),
    ...readdirSync(REFERENCES)
      .filter((name) => /^\d\d-.*\.md$/.test(name))
      .sort()
      .map((name) => read(join(REFERENCES, name))),
  ].join("\n");
}
// Flatten newlines so multi-line prose can be matched in one regex.
function flat(text: string): string {
  return text.replace(/\n/g, " ");
}
// Slice of `text` from the first `## `-level heading matching `headingRe` to
// the next `## ` heading (or EOF). Missing heading → "" so dependent
// assertions fail, not skip.
function section(text: string, headingRe: RegExp): string {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => headingRe.test(line));
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## /.test(line));
  return rest.slice(0, end === -1 ? rest.length : end).join("\n");
}

describe("team-pr Screenshots section rendering (slice 2)", () => {
  test("team-pr template carries a conditional Screenshots section", () => {
    const t = flat(body());
    expect(body()).toContain("## Screenshots");
    // Reads the manifest ux-reviewer wrote.
    expect(t).toContain("screenshots/manifest.md");
  });

});

describe("team-pr Screenshots refresh on every push", () => {
  // The refresh-on-push rule already names Summary/Changes/How-to-Verify as
  // sections that must track the branch, and the footer + `## Companion PRs`
  // as sections that survive the rewrite. Screenshots need both halves:
  // preserved when the push left the UI alone, re-rendered when it did not.
  test("a UI-changing push defers re-capture to the ux-reviewer procedure", () => {
    // Re-capture is ux-reviewer's procedure — loaded, not restated.
    expect(loadsSkill(body(), "verifying-ux")).toBe(true);
  });
});

describe("team-pr screenshot upload via user-attachments (slice 3)", () => {
  test("team-pr upload sequencing is PR-first", () => {
    // Ordering tripwire: the upload procedure must run (1) draft PR exists →
    // (2) upload through the PR page → (3) `gh pr edit --body`. Scoped to the
    // upload section — `gh pr edit --body` also appears earlier in Execution.
    const uploadSection = flat(section(body(), /^## .*upload/i));
    const draftIndex = uploadSection.search(/draft PR/i);
    const uploadIndex = uploadSection.search(/textarea|file input/i);
    const editIndex = uploadSection.indexOf("gh pr edit --body");
    expect(draftIndex).toBeGreaterThanOrEqual(0);
    expect(uploadIndex).toBeGreaterThan(draftIndex);
    expect(editIndex).toBeGreaterThan(uploadIndex);
    // The upload extracts GitHub's user-attachments asset URLs for embedding.
    expect(uploadSection).toContain("user-attachments/assets");
  });
});
