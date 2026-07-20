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
import { existsSync } from "node:fs";
import { join } from "node:path";

import { read } from "./helpers/text";

const REPO_ROOT = process.cwd();
// team-pr is a RUNTIME skill — it lives under skills/ (distributed).
const TEAM_PR_SKILL = join(REPO_ROOT, "skills", "team-pr", "SKILL.md");

// Defensive read: missing file → "" so content assertions FAIL (not throw).
function body(): string {
  return existsSync(TEAM_PR_SKILL) ? read(TEAM_PR_SKILL) : "";
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
    // Omit-when-no-manifest: non-UI changes are never forced to include one.
    const omitRule =
      /manifest[^.]{0,60}(absent|missing|does not exist|no manifest)[^.]{0,160}(omit|omitted|no [^.]{0,30}section|section[^.]{0,60}omit)/i.test(t) ||
      /(no|absent|missing)[^.]{0,20}manifest[^.]{0,160}(omit|omitted|section[^.]{0,60}(omitted|absent))/i.test(t);
    expect(omitRule).toBe(true);
  });

  test("team-pr degradation contract is stated", () => {
    const t = flat(body());
    // Branch 1: capture failed (any skipped-* manifest status) → one-line note
    // naming the reason.
    const captureFailedNote =
      /skipped-[^.]{0,200}(note|capture[- ]failure)/i.test(t) ||
      /capture[- ]fail[^.]{0,200}note/i.test(t);
    expect(captureFailedNote).toBe(true);
    // Branch 2: malformed manifest → same visible note, never a crash or block.
    expect(/malformed[^.]{0,240}(note|capture[- ]failure)/i.test(t)).toBe(true);
    // Branch 3: manifest entry whose PNG is missing → entry skipped, the
    // discrepancy noted in the section.
    const missingPngNoted =
      /(PNG|image|file)[^.]{0,80}(missing|does not exist|absent)[^.]{0,240}(skipped|note|discrepanc)/i.test(t) ||
      /(missing|absent)[^.]{0,40}(PNG|image|file)[^.]{0,240}(skipped|note|discrepanc)/i.test(t);
    expect(missingPngNoted).toBe(true);
    // Degradation never blocks the PR; the prose cites the existing rule in
    // the screenshots context (a second occurrence beyond Execution step 6).
    const neverBlocks =
      /(never|do not|don't)[^.]{0,80}(block|delay)[^.]{0,80}(the )?(PR|pull request)/i.test(t);
    expect(neverBlocks).toBe(true);
    const humanGateCitations = body().match(/not a human gate/gi) ?? [];
    expect(humanGateCitations.length).toBeGreaterThanOrEqual(2);
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

  test("team-pr upload degradation is stated", () => {
    const t = flat(body());
    // No authenticated session → fail fast, keep the degraded note + local
    // paths; never blocks the PR.
    const noSessionFastFail =
      /(no|missing|absent)[^.]{0,80}(authenticated|signed[- ]in)[^.]{0,60}(session|browser)[^.]{0,240}(skip|fail|degrad)/i.test(t) ||
      /(session|signed[- ]in)[^.]{0,120}(absent|missing|fail)[^.]{0,240}(skip|degrad)/i.test(t);
    expect(noSessionFastFail).toBe(true);
    expect(/local (file )?paths?/i.test(t)).toBe(true);
    // Partial success → embed what succeeded, list failures by caption + path.
    const partialSuccess =
      /partial[^.]{0,240}(embed|succeed)/i.test(t) ||
      /embed[^.]{0,80}succeeded[^.]{0,240}fail/i.test(t);
    expect(partialSuccess).toBe(true);
    // Oversize (>10MB) files are skipped at upload and noted.
    expect(/(oversize|10\s*MB)[^.]{0,240}(skip|noted)/i.test(t)).toBe(true);
    // Every branch ends with an open PR — upload problems never block it.
    const alwaysOpens =
      /(never[^.]{0,80}block|always[^.]{0,80}open)[^.]{0,120}(PR|pull request)|(PR|pull request)[^.]{0,80}(stays|remains)[^.]{0,40}open/i.test(t);
    expect(alwaysOpens).toBe(true);
  });

  test("team-pr multi-repo reuses upload URLs", () => {
    const t = flat(body());
    // Upload once, on the home-repo PR.
    expect(/upload[^.]{0,60}once[^.]{0,120}home[- ]repo/i.test(t)).toBe(true);
    // Companion PRs embed the same URLs — never re-upload per repo.
    expect(/companion[^.]{0,160}same URLs/i.test(t)).toBe(true);
    expect(/(never|no|not)[^.]{0,60}re-?upload/i.test(t)).toBe(true);
  });
});
