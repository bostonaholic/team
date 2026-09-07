// tests/team-pr-screenshots.test.ts
//
// L2 tripwires (free, deterministic): fence the CALLER half of the Screenshots
// contract in the team-pr RUNTIME skill (skills/team-pr/). team-pr renders a
// `## Screenshots` PR-body section from ux-reviewer's capture manifest, then
// delegates every upload mechanic to the `pr-screenshots` skill
// (docs/plans/2026-09-06-pr-screenshot-upload-skill). team-pr decides WHETHER
// to call, WHEN, and WHICH manifest entries qualify; it owns no `--attach`
// loop and no attachment-host knowledge. The mechanics and their L1 tests live
// in tests/pr-screenshots-skill.test.ts. Every degradation branch still ends
// with an open PR and a visible note — the PR phase is not a human gate.
//
// Tests are grouped by slice so a single slice runs in isolation:
//
//     bun test tests/team-pr-screenshots.test.ts -t "Slice 2"
//     bun test tests/team-pr-screenshots.test.ts -t "Slice 3"
//
// Every assertion is guarded so a not-yet-existing skill section yields a
// failed expect(), never an uncaught ENOENT — the mechanical gate rejects
// crashes, not clean assertion failures. Absence assertions are preceded by a
// length guard and every offender-detector is fired at a planted positive, so
// a renamed heading or a blind regex cannot pass them vacuously
// (docs/testing.md, "Prove a negative check can find a positive").

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { read, squash } from "./helpers/text";
import { loadsSkill } from "./helpers/skill-refs";

const REPO_ROOT = process.cwd();
// team-pr is a RUNTIME skill — it lives under skills/ (distributed).
const TEAM_PR_DIR = join(REPO_ROOT, "skills", "team-pr");
const TEAM_PR_SKILL = join(TEAM_PR_DIR, "SKILL.md");
const REFERENCES = join(TEAM_PR_DIR, "references");

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
function fileOr(path: string): string {
  return existsSync(path) ? read(path) : "";
}
const uploadRef = () => fileOr(join(REFERENCES, "04-screenshot-upload.md"));
const templateRef = () => fileOr(join(REFERENCES, "03-pr-body-template.md"));

// Every markdown file team-pr ships, for the mechanics sweep.
function teamPrMarkdown(): string[] {
  const out: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      if (entry.isFile() && entry.name.endsWith(".md")) out.push(path);
    }
  };
  if (existsSync(TEAM_PR_DIR)) visit(TEAM_PR_DIR);
  return out;
}

// Every fenced block in `text`: the commands the skill tells the model to EMIT.
// Prose that names a rejected form is discussion, not emission, so a
// forbidden-pattern sweep belongs on the fences alone. Mirrors the helper in
// tests/pr-screenshots-skill.test.ts.
function fencedBlocks(text: string): string[] {
  const blocks: string[] = [];
  let open = false;
  let buffer: string[] = [];
  for (const line of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      if (open) {
        blocks.push(buffer.join("\n"));
        buffer = [];
      }
      open = !open;
      continue;
    }
    if (open) buffer.push(line);
  }
  return blocks;
}

// Flatten newlines so multi-line prose can be matched in one regex.
function flat(text: string): string {
  return text.replace(/\n/g, " ");
}
// The multi-repo policy block: from the line that opens it to the next `## `
// heading or bold label, whichever comes first. "" when absent.
function multiRepoBlock(): string {
  const lines = uploadRef().split("\n");
  const start = lines.findIndex((line) => /multi-repo/i.test(line));
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^(## |\*\*[A-Z])/.test(line));
  return [lines[start], ...rest.slice(0, end === -1 ? rest.length : end)].join("\n");
}

// The number of Skill-tool loads of `name` in `text`. A count, not a boolean,
// because "one call, never one per repo" is a countable contract. Mirrors the
// clause walk in tests/helpers/skill-refs.ts.
function loadCount(text: string, name: string): number {
  const squashed = squash(text);
  let count = 0;
  for (const match of squashed.matchAll(/call the Skill tool with\b/gi)) {
    const tail = squashed.slice((match.index ?? 0) + match[0].length);
    const clause = tail.split(/(?<=[.:;!?])\s/)[0] ?? tail;
    if (clause.includes(`\`${name}\``)) count++;
  }
  return count;
}

// Offender detector: an upload mechanic team-pr must no longer name.
const UPLOAD_MECHANICS = /user-attachments|--attach/;
// Offender detector: a per-repo call described as a runtime branch.
const RUNTIME_FALLBACK = /fall(s|ing|en)?[ -]?back|fallback/i;

describe("Slice 2: team-pr Screenshots section rendering", () => {
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

describe("Slice 2: team-pr delegates screenshot upload to pr-screenshots", () => {
  test("the upload procedure delegates to pr-screenshots", () => {
    const upload = uploadRef();
    expect(upload.length).toBeGreaterThan(0);
    // A LOAD, not a citation: the caller hands the work to the skill.
    expect(loadsSkill(upload, "pr-screenshots")).toBe(true);
  });

  test("team-pr names no upload mechanics", () => {
    // The PRD acceptance criterion: the mechanics live in exactly one place.
    const files = teamPrMarkdown();
    // Blindness guard: an empty or mis-scoped walk would pass vacuously.
    expect(files.length).toBeGreaterThan(3);
    const offenders = files
      .filter((path) => UPLOAD_MECHANICS.test(read(path)))
      .map((path) => relative(REPO_ROOT, path));
    expect(offenders).toEqual([]);
    // The detector fires on a planted positive.
    expect(UPLOAD_MECHANICS.test('gh pr edit "$N" --repo "$R" --attach "$P"')).toBe(true);
  });

  test("entries-file construction survives in team-pr", () => {
    // Decision 10: which manifest entries qualify stays caller-side.
    const t = body();
    expect(t).toContain("screenshots/manifest.md");
    expect(t).toContain("skipped-");
    expect(t).toContain("status: partial");

    const upload = uploadRef();
    expect(upload.length).toBeGreaterThan(0);
    // The one input the skill takes, and the discrepancy channel.
    expect(upload).toContain("--entries");
    expect(upload).toContain("notes");
  });

  test("the body template cites pr-screenshots for the section wording", () => {
    // The duplicated contract is deleted, not forked. The entries-file
    // conditionals stay; the rendering restatement goes, and the second
    // ("upload failed or unavailable") wording goes with it — team-pr renders
    // the section once, at open time, and never edits it again.
    const template = templateRef();
    expect(template.length).toBeGreaterThan(0);
    expect(template).toContain("skills/pr-screenshots/references/02-upload-and-body-edit.md");
    expect(template).not.toContain("**<caption>** (<state>)");
    expect(template).not.toContain("upload failed or unavailable");
  });
});

describe("Slice 3: companion PRs get the same section, each verified", () => {
  test("multi-repo calls pr-screenshots once, on the home PR", () => {
    // Decision 12: one call, never one per repo. The count is the contract.
    const upload = uploadRef();
    expect(upload.length).toBeGreaterThan(0);
    expect(loadCount(upload, "pr-screenshots")).toBe(1);

    const multiRepo = multiRepoBlock();
    expect(multiRepo.length).toBeGreaterThan(0);
    // Companions are served by the committed splice, not by a second call.
    expect(multiRepo).toContain("skills/pr-screenshots/splice.mjs");
  });

  test("a non-null section is copied verbatim into each companion", () => {
    const multiRepo = multiRepoBlock();
    expect(multiRepo.length).toBeGreaterThan(0);
    // The result.json field, not the English word.
    expect(multiRepo).toContain("`section`");
    expect(multiRepo).toContain("splice.mjs");
    expect(multiRepo).toContain("--body-file");
    // Splice first, then the single write.
    expect(multiRepo.indexOf("splice.mjs")).toBeLessThan(multiRepo.indexOf("--body-file"));
  });

  test("a null section touches no companion body", () => {
    // An identifier-value pair, not a sentence: `section` null means the
    // open-time degraded note stays in every companion body.
    const multiRepo = multiRepoBlock();
    expect(multiRepo.length).toBeGreaterThan(0);
    expect(/`?section`?[^A-Za-z]{0,12}(is )?`?null`?/.test(squash(multiRepo))).toBe(true);
  });

  test("each companion write gets its own body_html read-back", () => {
    // Decision 12 closes the unverified-companion finding: the write that
    // could fail to render is the write that gets checked, against that
    // companion's own owner/repo/number.
    const multiRepo = multiRepoBlock();
    expect(multiRepo.length).toBeGreaterThan(0);
    expect(multiRepo).toContain("body_html");
    expect(multiRepo).toContain("application/vnd.github.full+json");
    expect(multiRepo).toContain("--repo");
  });

  test("no per-repo call is described as a runtime fallback", () => {
    // Decision 12 rejects the per-repo call. It is the design change a real
    // cross-repo rendering failure would force, never a branch the run takes
    // at runtime.
    const multiRepo = multiRepoBlock();
    expect(multiRepo.length).toBeGreaterThan(0);
    expect(RUNTIME_FALLBACK.test(multiRepo)).toBe(false);
    // The detector fires on a planted positive.
    expect(RUNTIME_FALLBACK.test("if the read-back fails, fall back to a per-repo call")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The companion splice recipe.
// ---------------------------------------------------------------------------

// A splice invocation whose stdout is redirected straight onto the final body
// file. `>` truncates BEFORE the command runs and a refusal prints nothing, so
// this form leaves a zero-byte file for the next step to hand
// `gh pr edit --body-file` — blanking that companion's body.
const UNGUARDED_REDIRECT = /splice\.mjs[\s\S]{0,240}?>\s*"\$NEW_BODY_FILE"\s*$/m;

describe("Slice 3: the companion recipe guards its own redirect", () => {
  test("the multi-repo splice never redirects straight onto the body file", () => {
    const multiRepo = multiRepoBlock();
    expect(multiRepo.length).toBeGreaterThan(0);
    expect(UNGUARDED_REDIRECT.test(multiRepo)).toBe(false);
    // The detector fires on a planted positive.
    expect(
      UNGUARDED_REDIRECT.test('node "d/splice.mjs" --body-file "$C" > "$NEW_BODY_FILE"'),
    ).toBe(true);
  });

  test("the companion pre-image read is guarded by exit AND by envelope", () => {
    // The companion read was the bare `gh pr view … --json body --jq .body`
    // form the home path spent eighteen lines replacing: on a rate limit it
    // binds "", the splice then returns the `## Screenshots` section as the
    // WHOLE body, and step 4 writes it — blanking a live companion PR's entire
    // description.
    const multiRepo = multiRepoBlock();
    expect(multiRepo.length).toBeGreaterThan(0);
    expect(multiRepo).toContain('jq -e \'has("body") and (.body | type == "string")\'');
    // The unguarded form the loop shipped is gone.
    expect(multiRepo).not.toContain("--json body --jq .body");
    // The read fails the run rather than continuing on "".
    const read = multiRepo.indexOf('PRE_JSON="$(gh pr view');
    expect(read).toBeGreaterThanOrEqual(0);
    expect(multiRepo.slice(read, read + 400)).toContain("|| exit 2");
  });

  test("a companion write is gated on the pre-image still being current", () => {
    // Nothing on the companion path guarded a lost update at all, so a
    // companion edited between the read and the write had that edit
    // overwritten by a body computed before it existed.
    const multiRepo = multiRepoBlock();
    expect(multiRepo.length).toBeGreaterThan(0);
    expect(multiRepo).toContain('NOW_JSON="$(gh pr view');
    // The comparison gates the edit, and the edit is inside the gate.
    const compare = multiRepo.indexOf('NOW_JSON="$(gh pr view');
    const edit = multiRepo.indexOf('gh pr edit "$NUMBER"');
    expect(edit).toBeGreaterThan(compare);
    expect(multiRepo).toContain('= "$(printf \'%s\' "$PRE_JSON" | jq -r .body)"');
  });

  test("every companion temporary is bound per companion, and a refusal clears both", () => {
    // `$NEW_BODY_FILE` was never bound to a per-companion path, so from the
    // second companion onward a refusal left the FIRST companion's spliced
    // body on disk — its summary, its footer, its `Part of` line — for the
    // unconditional write below to put on this companion's description.
    const multiRepo = multiRepoBlock();
    expect(multiRepo.length).toBeGreaterThan(0);
    expect(multiRepo).toContain('COMPANION_DIR="$(mktemp -d)"');
    expect(multiRepo).toContain('NEW_BODY_FILE="$COMPANION_DIR/new-body.md"');
    expect(multiRepo).toContain('COMPANION_BODY_FILE="$COMPANION_DIR/pre-image.md"');
    // The binding comes before the splice that writes into it.
    expect(multiRepo.indexOf('NEW_BODY_FILE="$COMPANION_DIR')).toBeLessThan(multiRepo.indexOf("splice.mjs"));
    // The refusal arm removes the promoted path too, which is what makes its
    // own comment ("step 4 cannot run") true on the second iteration.
    expect(multiRepo).toContain('rm -f "$NEW_BODY_FILE.tmp" "$NEW_BODY_FILE"');
    expect(multiRepo).not.toContain('rm -f "$NEW_BODY_FILE.tmp"  ');
  });

  test("every companion call carries the host the companion lives on", () => {
    // `--repo "$OWNER/$REPO"` resolves against whichever host `gh` considers
    // default and a bare `gh api repos/…` does the same, so on Enterprise
    // every companion edit and read-back silently targeted github.com — and
    // the read-back then asserted against an unrelated PR, which is
    // verification evidence about something else.
    const multiRepo = multiRepoBlock();
    expect(multiRepo.length).toBeGreaterThan(0);
    expect(multiRepo).toContain('COMPANION_SPEC="$COMPANION_HOST/$OWNER/$REPO"');
    // No EMITTED command may use the hostless spec. The sweep runs on the
    // fences, because the prose beside them names the rejected form on purpose.
    const emitted = fencedBlocks(multiRepo).join("\n");
    expect(emitted.length).toBeGreaterThan(0);
    expect(emitted).not.toContain('--repo "$OWNER/$REPO"');
    // The sweep fires on a planted positive — the form that shipped.
    expect(fencedBlocks('```bash\ngh pr edit "$NUMBER" --repo "$OWNER/$REPO"\n```').join("\n")).toContain(
      '--repo "$OWNER/$REPO"',
    );
    // Every `gh pr view`/`gh pr edit` in the block carries the host-bearing one.
    const calls = emitted.match(/gh pr (?:view|edit) "\$NUMBER"[^\n]*/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(calls.filter((call) => !call.includes('--repo "$COMPANION_SPEC"'))).toEqual([]);
    // And the read-back names the host explicitly.
    expect(multiRepo).toContain('gh api --hostname "$COMPANION_HOST"');
  });

  test("the section the companion splice reads is written, not assumed", () => {
    // `--section-file "$SECTION_FILE"` was expanded here and bound nowhere
    // under skills/team-pr/: no step wrote `result.json`'s `.section` to a
    // file, so the one variable carrying the section into the companion write
    // was one the session had to invent. It is also the one place
    // caller-derived text — captions carrying `\[`, `\]`, `\!`, `\<`, `\>` —
    // crosses from JSON into a shell-visible file, so an improvised heredoc
    // there breaks `principle-never-interpolate`.
    const multiRepo = multiRepoBlock();
    expect(multiRepo.length).toBeGreaterThan(0);
    expect(multiRepo).toContain('SECTION_FILE="$COMPANION_DIR/section.md"');
    // `jq -r` moves the string; nothing re-types it. `-e` plus `select` refuses
    // a null or empty section rather than writing the four bytes `null`.
    expect(multiRepo).toContain("jq -e -r '.section | select(type == \"string\" and length > 0)'");
    // Written before the splice that reads it, and per companion.
    const write = multiRepo.indexOf('>"$SECTION_FILE"');
    const readBack = multiRepo.indexOf('--section-file "$SECTION_FILE"');
    expect(write).toBeGreaterThan(multiRepo.indexOf('SECTION_FILE="$COMPANION_DIR'));
    expect(readBack).toBeGreaterThan(write);

    // And the file it is read out of is bound where the skill wrote it.
    expect(uploadRef()).toContain('RESULT_FILE="$ENTRIES_DIR/result.json"');
    expect(uploadRef()).toContain('ENTRIES_DIR="$(mktemp -d)"');
  });

  test("the companion split is shown, charset tests included", () => {
    // `COMPANION_HOST`, `OWNER`, `REPO`, and `NUMBER` feed three `gh` calls
    // below, and the split that binds them was cited rather than shown — so
    // the charset tests that keep a hostile segment out of `--repo` and
    // `--hostname` were a paragraph away from the fence that needs them.
    const multiRepo = multiRepoBlock();
    expect(multiRepo.length).toBeGreaterThan(0);
    expect(multiRepo).toContain("https://*/*/*/pull/[0-9]*");
    expect(multiRepo).toContain('COMPANION_HOST="${REST%%/*}"');
    expect(multiRepo).toContain('case "$COMPANION_HOST$OWNER$REPO" in *[!A-Za-z0-9._-]*)');
    expect(multiRepo).toContain('case "$NUMBER" in ""|*[!0-9]*)');
    // The split runs before the spec that carries its output into `gh`.
    expect(multiRepo.indexOf('COMPANION_HOST="${REST%%/*}"')).toBeLessThan(
      multiRepo.indexOf('COMPANION_SPEC="$COMPANION_HOST/$OWNER/$REPO"'),
    );
  });

  test("the companion splice passes the landed-asset count and names exit 2", () => {
    // The count is what keeps rule 4's no-downgrade guard from being
    // satisfiable by caller-supplied note text, and exit 2 is a fault rather
    // than the refusal exit 1 means.
    const multiRepo = multiRepoBlock();
    expect(multiRepo.length).toBeGreaterThan(0);
    expect(multiRepo).toContain("--landed");
    // And `$LANDED_COUNT` is bound in a visible fence, from result.json's own
    // `assets`, rather than left as prose for the session to reconstruct.
    expect(multiRepo).toContain("LANDED_COUNT=\"$(jq '[.assets[] | select(.url != null)] | length'");
    expect(multiRepo).toContain("exit 2");
    expect(multiRepo).toContain("unchanged: <reason>");
  });
});
