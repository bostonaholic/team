// tests/ux-reviewer-screenshots.test.ts
//
// L2 tripwires (free, deterministic): fence the screenshot-capture contract in
// the ux-reviewer RUNTIME agent prompt (agents/ux-reviewer.md), per
// docs/plans/2026-07-20-pr-ui-screenshots. ux-reviewer captures one PNG per
// affected page/state during its existing boot-verify window and writes a
// manifest to docs/plans/<id>/screenshots/manifest.md that team-pr consumes.
//
// Every assertion is guarded so a not-yet-existing prompt section yields a
// failed expect(), never an uncaught ENOENT — the mechanical gate rejects
// crashes, not clean assertion failures.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { read } from "./helpers/text";

const REPO_ROOT = process.cwd();
// ux-reviewer is a RUNTIME agent — it lives under agents/ (distributed).
const UX_REVIEWER = join(REPO_ROOT, "agents", "ux-reviewer.md");

// Defensive read: missing file → "" so content assertions FAIL (not throw).
function body(): string {
  return existsSync(UX_REVIEWER) ? read(UX_REVIEWER) : "";
}
// Flatten newlines so multi-line prose can be matched in one regex.
function flat(text: string): string {
  return text.replace(/\n/g, " ");
}

describe("ux-reviewer screenshot capture (slice 1)", () => {
  test("ux-reviewer prompt defines the manifest contract", () => {
    const t = flat(body());
    // Manifest location: docs/plans/<id>/screenshots/manifest.md.
    expect(t).toContain("screenshots/manifest.md");
    // Frontmatter fields the manifest must carry.
    expect(/status:/.test(t)).toBe(true);
    expect(/round:/.test(t)).toBe(true);
    expect(/seeded:/.test(t)).toBe(true);
    // The four status values, exactly as team-pr will branch on them.
    expect(t).toContain("captured");
    expect(t).toContain("partial");
    expect(t).toContain("skipped-server-start");
    expect(t).toContain("skipped-no-tool");
    // Per-shot bullets: route / state / caption, with the three state values.
    expect(/route:/.test(t)).toBe(true);
    expect(/state:/.test(t)).toBe(true);
    expect(/caption:/.test(t)).toBe(true);
    expect(/populated[^.]{0,20}empty[^.]{0,20}error/i.test(t)).toBe(true);
  });

  test("ux-reviewer prompt keeps capture inside the server lifecycle", () => {
    const t = flat(body());
    // Wipe-and-recapture: screenshots/ is emptied before each round's capture,
    // so stale images from earlier rounds can never reach the PR.
    const wipeBeforeCapture =
      /(wipe|delete)[^.]{0,120}screenshots[^.]{0,120}(before|prior to)[^.]{0,40}captur/i.test(t) ||
      /(before|prior to)[^.]{0,40}captur[^.]{0,120}(wipe|delete)[^.]{0,120}screenshots/i.test(t);
    expect(wipeBeforeCapture).toBe(true);
    // Caps: 10 shots per round, 5-minute round budget, 30s per-shot timeout.
    expect(/10\s*(screen)?shots/i.test(t)).toBe(true);
    expect(/5[- ]min(ute)?/i.test(t)).toBe(true);
    expect(/30\s*s(ec(ond)?s?)?[^.]{0,60}(per[- ]shot|shot|timeout)|per[- ]shot[^.]{0,60}30\s*s/i.test(t)).toBe(true);
    // Pre-existing lifecycle rules survive the edit verbatim.
    expect(body()).toContain("ALWAYS stop the dev server");
    expect(/60\s*seconds/i.test(t)).toBe(true);
  });

  test("ux-reviewer prompt forbids committing screenshots and gates on UI-impact", () => {
    const t = flat(body());
    // Never commit screenshots — to any branch or worktree.
    const neverCommit =
      /never[^.]{0,80}commit[^.]{0,80}screenshots?|screenshots?[^.]{0,80}never[^.]{0,60}commit/i.test(t);
    expect(neverCommit).toBe(true);
    expect(/any branch or worktree/i.test(t)).toBe(true);
    // UI-impact gate is two conditions: UI project type AND a diff touching
    // UI-rendering surfaces (components/templates/pages/routes/styles).
    const surfaces =
      /components[^.]{0,40}templates[^.]{0,40}pages[^.]{0,40}routes[^.]{0,40}styles/i.test(t);
    expect(surfaces).toBe(true);
    const conjunction =
      /UI\b[^.]{0,120}\band\b[^.]{0,160}(touch|diff|commit)/i.test(t) ||
      /both[^.]{0,60}(hold|conditions|must)/i.test(t);
    expect(conjunction).toBe(true);
  });
});
