// tests/ux-reviewer-screenshots.test.ts
//
// L2 tripwires (free, deterministic): fence the screenshot-capture contract in
// the ux-reviewer's RUNTIME reviewer brief
// (skills/code-review/references/ux-reviewer.md — the thin agent wrapper reads
// it by path), per docs/plans/2026-07-20-pr-ui-screenshots. ux-reviewer
// captures one PNG per affected page/state during its existing boot-verify
// window and writes a manifest to docs/plans/<id>/screenshots/manifest.md
// that team-pr consumes.
//
// Every assertion is guarded so a not-yet-existing prompt section yields a
// failed expect(), never an uncaught ENOENT — the mechanical gate rejects
// crashes, not clean assertion failures.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { read } from "./helpers/text";

const REPO_ROOT = process.cwd();
// The capture procedure lives in the UX reviewer brief; the agent file is a
// thin wrapper that reads it by path (see tests/thin-agents.test.ts).
const UX_REVIEWER_BRIEF = join(REPO_ROOT, "skills", "code-review", "references", "ux-reviewer.md");

// Defensive read: missing file → "" so content assertions FAIL (not throw).
function body(): string {
  return existsSync(UX_REVIEWER_BRIEF) ? read(UX_REVIEWER_BRIEF) : "";
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
    expect(/any branch or worktree/i.test(t)).toBe(true);
    // UI-rendering surfaces stay named.
    const surfaces =
      /components[^.]{0,40}templates[^.]{0,40}pages[^.]{0,40}routes[^.]{0,40}styles/i.test(t);
    expect(surfaces).toBe(true);
  });

  test("ux-reviewer prompt captures a backend change that alters the interface", () => {
    const t = flat(body());
    // A backend, data, or configuration change that changes what renders counts.
    const backendCounts =
      /(backend|data|configuration)[^.]{0,80}(interface|rendered|output|navigation)/i.test(t);
    expect(backendCounts).toBe(true);
    // The detector fires on a planted positive.
    expect(
      /(backend|data|configuration)[^.]{0,80}(interface|rendered|output|navigation)/i.test(
        "a backend change that alters rendered output",
      ),
    ).toBe(true);
  });

  test("ux-reviewer prompt defaults to capture when UI impact is uncertain", () => {
    const t = flat(body());
    const defaultsToCapture = /uncertain[^.]{0,120}captur/i.test(t) || /default[^.]{0,80}captur/i.test(t);
    expect(defaultsToCapture).toBe(true);
    // The detector fires on a planted positive.
    expect(/uncertain[^.]{0,120}captur/i.test("When UI impact is uncertain, capture.")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Slice 3 (pr-rebase-ux-reviewer-fixes): native iOS/Android capture and
// Playwright locator scoping.
// ---------------------------------------------------------------------------
describe("ux-reviewer native capture and locator scope (slice 3)", () => {
  test("the brief documents the native capture and locator command tokens", () => {
    const t = flat(body());
    expect(t).toContain("xcrun simctl");
    expect(t).toContain("xcrun simctl io");
    expect(t).toContain("adb reverse");
    expect(t).toContain("adb exec-out screencap");
    expect(t).toContain("adb shell input tap");
    expect(t).toContain("uiautomator");
    expect(t).toContain("ANDROID_HOME");
    expect(t).toContain("ANDROID_SDK_ROOT");
    expect(t).toContain("getByRole");
    expect(t).toContain("exact");
    expect(t).toContain(".check()");
  });

  test("a Surfaces section records both entry modes and keeps curl in the browser path", () => {
    const t = flat(body());
    const surfaces = t.indexOf("## Surfaces");
    expect(surfaces).toBeGreaterThan(-1);
    const after = t.slice(surfaces);
    // The browser path keeps its HTTP probe; the native path records its tools.
    expect(after).toContain("curl");
    expect(after).toMatch(/\b(?:xcrun|adb)\b/);
  });

  test("the Surfaces section splits native failure severity and names the zero-shot status", () => {
    const t = flat(body());
    const surfaces = t.indexOf("## Surfaces");
    expect(surfaces).toBeGreaterThan(-1);
    const after = t.slice(surfaces);
    // A branch-caused build failure is Broken; an unavailable toolchain is a note.
    expect(after).toContain("Broken");
    expect(after).toMatch(/Could[-\s]Improve/);
    // The zero-shot case records the manifest status that stops team-pr's recapture.
    expect(after).toContain("status: partial");
  });
});
