// tests/pr-screenshots-skill.test.ts
//
// Acceptance tests for the `pr-screenshots` RUNTIME skill,
// skills/pr-screenshots/ (docs/plans/2026-09-06-pr-screenshot-upload-skill).
// Two layers, one file, grouped by slice so a single slice runs in isolation:
//
//     bun test tests/pr-screenshots-skill.test.ts -t "Slice 1"
//     bun test tests/pr-screenshots-skill.test.ts -t "Slice 4"
//
// L1 (pure unit, hermetic): skills/pr-screenshots/splice.mjs. The body
// transform is `f(body, section) -> {body, changed, reason}` — no network, no
// I/O — so docs/testing.md ("L1: Pure unit") puts its five rules here rather
// than in prose, exactly as tests/reflect-skill.test.ts covers its bundled
// scripts.
//
// L2 (static-invariant tripwires): the load-bearing contracts of the skill's
// prose. These assert COMMANDS, FLAGS, ENUM VALUES, FIELD NAMES, NUMBERS, and
// PATHS — never a sentence and never a proximity span (docs/testing.md, "A
// tripwire asserts a contract, never a wording"). A prose rewrite that keeps
// the contracts intact stays green.
//
// Every assertion is guarded so a not-yet-existing skill file yields a failed
// expect(), never an uncaught ENOENT — the mechanical gate rejects crashes,
// not clean assertion failures. splice.mjs is loaded through a COMPUTED
// specifier for the same reason: a static import of an absent module aborts
// the whole file with ERR_MODULE_NOT_FOUND before a single test runs. Absence
// assertions are preceded by a length guard, and every offender-detector is
// fired at a planted positive, so a renamed heading or a blind regex cannot
// pass them vacuously (docs/testing.md, "Prove a negative check can find a
// positive").

import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import { read, squash } from "./helpers/text";

const REPO_ROOT = process.cwd();
// pr-screenshots is a RUNTIME skill — under skills/ (distributed), not .claude/.
const SKILL_DIR = join(REPO_ROOT, "skills", "pr-screenshots");
const SKILL = join(SKILL_DIR, "SKILL.md");
const REFERENCES = join(SKILL_DIR, "references");
const SPLICE = join(SKILL_DIR, "splice.mjs");

// ---------------------------------------------------------------------------
// L1 plumbing: load splice.mjs without letting its absence abort the file.
// ---------------------------------------------------------------------------

type SpliceResult = { body: string; changed: boolean; reason: string };
type SpliceOptions = { landed?: number };
type SpliceFn = (body: string, section: string, options?: SpliceOptions) => SpliceResult;

// A computed specifier, so TypeScript never resolves the path and Node never
// throws at parse time. The module is imported only when it is on disk.
const spliceModule: Record<string, unknown> | null = existsSync(SPLICE)
  ? ((await import(pathToFileURL(SPLICE).href)) as Record<string, unknown>)
  : null;

// Stand-in used until slice 1 ships the module. Every field is the empty /
// falsy value, so no assertion below can pass against it: a `body` check
// compares "" to the fixture, and a `reason` check compares "" to non-empty.
const NOT_LOADED: SpliceResult = { body: "", changed: false, reason: "" };

const splice: SpliceFn =
  typeof spliceModule?.splice === "function"
    ? (spliceModule.splice as SpliceFn)
    : () => NOT_LOADED;

// The pre-image half of the transform, exported so the caller can run it in
// step A — before the first attach — rather than only after.
// Absent, it reports "" (no refusal), which fails every assertion below that
// expects a named one.
type BodyRefusalFn = (body: string) => string;
const bodyRefusal: BodyRefusalFn =
  typeof spliceModule?.bodyRefusal === "function" ? (spliceModule.bodyRefusal as BodyRefusalFn) : () => "";

// ---------------------------------------------------------------------------
// L2 plumbing: defensive reads. A missing file reads as "" so content
// assertions FAIL (not throw), and length guards below catch the vacuum.
// ---------------------------------------------------------------------------

function fileOr(path: string): string {
  return existsSync(path) ? read(path) : "";
}
function reference(name: string): string {
  return fileOr(join(REFERENCES, name));
}
const inputRef = () => reference("01-input-and-result.md");
const uploadRef = () => reference("02-upload-and-body-edit.md");
const verifyRef = () => reference("03-verify.md");
const rejectedRef = () => reference("04-rejected-approaches.md");
const spliceSource = () => fileOr(SPLICE);

// SKILL.md + every reference + the script source: the whole skill as one
// haystack, for contracts that may legitimately live in any of them.
function corpus(): string {
  const references = existsSync(REFERENCES)
    ? readdirSync(REFERENCES)
        .filter((name) => name.endsWith(".md"))
        .sort()
        .map((name) => read(join(REFERENCES, name)))
    : [];
  return [fileOr(SKILL), ...references, spliceSource()].join("\n");
}

// Every fenced block (``` or ~~~) in `text`. Fenced blocks are what the skill
// tells the model to EMIT — commands and body templates — so they are the
// surface a forbidden-pattern sweep belongs on. Prose that names a rejected
// form is discussion, not emission, and stays out of the sweep.
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

// The fenced blocks that are `## Screenshots` body templates: the markdown the
// skill writes into a PR body. A template OPENS with the heading — the shell
// recipe that writes one to a file carries the same heading inside a heredoc,
// and it is a command rather than a template.
function sectionTemplates(): string[] {
  return fencedBlocks(uploadRef()).filter((block) => block.trimStart().startsWith("## Screenshots"));
}

// `text` with every fenced block removed. The refusal sweep below runs over
// prose only: a `result.json` sample carries `refused`, `path`, and `caption`
// together, so leaving fences in would let one example satisfy requirements
// the prose never states.
function withoutFences(text: string): string {
  const out: string[] = [];
  let open = false;
  for (const line of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      open = !open;
      continue;
    }
    if (!open) out.push(line);
  }
  return out.join("\n");
}

// The authored units of `text` that state a refusal. Units are bullets,
// numbered items, table rows, and paragraphs — never raw lines, because this
// repo hard-wraps prose and a single bullet spans several lines
// (docs/testing.md, "The pattern cannot match the file's own line breaks").
function refusalUnits(text: string): string[] {
  return withoutFences(text)
    .split(/\n\s*\n/)
    .flatMap((paragraph) => paragraph.split(/\n(?=\s*(?:[-*]\s|\d+\.\s|\|))/))
    .map((unit) => squash(unit).trim())
    .filter((unit) => /refus/i.test(unit));
}

// The entries-file refusals decision 7 and `## Edge cases` name, each keyed to
// the token that identifies it — a field name, a flag, a format name, or the
// boundary value 0.
const ENTRIES_REFUSALS: { label: string; matches: (unit: string) => boolean }[] = [
  {
    label: "zero entries",
    matches: (unit) => /entr/i.test(unit) && /(^|\D)0(\D|$)|\bzero\b|\bempty\b/i.test(unit),
  },
  { label: "an --entries path that does not exist", matches: (unit) => unit.includes("--entries") },
  { label: "invalid JSON", matches: (unit) => /json/i.test(unit) },
  {
    label: "an entry lacking path or caption",
    matches: (unit) => unit.includes("`path`") && unit.includes("`caption`"),
  },
];

// Offender detectors, factored so the planted-positive tests run the same code
// the real sweeps run.
//
// A markdown IMAGE reference whose target is a local path — the form decision
// 10 bans from every body template, and the form `gh pr edit --attach` would
// rewrite in place (tripping decision 6's prefix guard).
const LOCAL_IMAGE = /!\[[^\]]*\]\(\s*(?:\.{0,2}\/|~\/|file:|[A-Za-z]:\\)/;
// An `--attach` argument carrying `#`, which gh reads as the alt-text
// delimiter.
const ATTACH_ALT = /--attach\s+["']?[^\s"'`]*#/;
// The rejected justification for excluding `## Pre-merge` as an anchor
// — a forbidden CLAIM, not a forbidden wording. Rule 1 DOES remove
// a trailing `## Pre-merge`, so the ban is narrowed to the "already removed
// it" claim that made the anchor list look redundant.
const RULE_ONE_CLAIM = /rule (1|one)[^.]{0,40}already[^.]{0,20}remov|already[^.]{0,20}remov[^.]{0,40}rule (1|one)/i;

// ---------------------------------------------------------------------------
// Slice 1 — L1: the five splice rules, and the counts they turn on.
// ---------------------------------------------------------------------------

// A rendered section holding two real, resolved screenshots.
const SECTION = [
  "## Screenshots",
  "",
  "**Login** (default)",
  "![screenshot-01](https://example.com/user-attachments/assets/1111)",
  "",
  "**Login** (error)",
  "![screenshot-02](https://example.com/user-attachments/assets/2222)",
].join("\n");

// The degraded section: local paths as plain text, no image reference at all.
const DEGRADED = [
  "## Screenshots",
  "",
  "**Login** (default) — captured, not yet uploaded: /tmp/login.png",
].join("\n");

// An existing body whose section already holds a real screenshot.
const REAL = [
  "## Summary",
  "",
  "Adds a login page.",
  "",
  "## Screenshots",
  "",
  "**Login** (default)",
  "![screenshot-01](https://github.com/user-attachments/assets/abcd)",
  "",
  "Closes #12",
  "",
].join("\n");

function occurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  return haystack.split(needle).length - 1;
}

describe("Slice 1 — splice.mjs (L1)", () => {
  test("splice keeps a ticket-reference line when a crash tail collapsed the footer", () => {
    // A crash between attach and write leaves a standalone image line at EOF,
    // so rule 1's footer scan stops immediately and `Closes #12` lands in
    // `content`. Rule 2's replace must stop at that ticket-reference line
    // instead of running to the end of `content` and deleting it.
    const crashed = [
      "## Summary",
      "",
      "Adds a login page.",
      "",
      "## Screenshots",
      "",
      "**Login** (default)",
      "![screenshot-01](https://example.com/user-attachments/assets/0000)",
      "",
      "Closes #12",
      "",
      "![screenshot-01](https://example.com/user-attachments/assets/dead)",
      "",
    ].join("\n");

    const result = splice(crashed, SECTION, { landed: 2 });

    expect(result.changed).toBe(true);
    expect(occurrences(result.body, "Closes #12")).toBe(1);
    // The new section landed and the superseded one is gone.
    expect(result.body).toContain("assets/1111");
    expect(result.body).not.toContain("assets/0000");
    // The crash tail is reported, never deleted (## Edge cases).
    expect(result.body).toContain("assets/dead");
  });

  test("splice treats Fixes: #123 as a ticket reference", () => {
    // The stem pattern tolerates an optional `:`, so the colon form joins the
    // footer block and is re-emitted last.
    const colon = [
      "## Summary",
      "",
      "Adds a login page.",
      "",
      "## Screenshots",
      "",
      "**Login** (default)",
      "![screenshot-01](https://example.com/user-attachments/assets/0000)",
      "",
      "Fixes: #123",
      "",
    ].join("\n");

    const result = splice(colon, SECTION, { landed: 2 });

    expect(result.changed).toBe(true);
    expect(occurrences(result.body, "Fixes: #123")).toBe(1);
    expect(result.body.trimEnd().endsWith("Fixes: #123")).toBe(true);
    expect(result.body).toContain("assets/1111");
    expect(result.body).not.toContain("assets/0000");
  });

  test("splice re-emits the footer byte-identical exactly once", () => {
    // Rule 3. `## Pre-merge`, `## Companion PRs`, and the closing line are one
    // block, re-emitted verbatim below the spliced section.
    const footer = [
      "## Pre-merge",
      "",
      "- [ ] Run the live check.",
      "",
      "## Companion PRs",
      "",
      "- [other-repo] https://example.com/pr/2",
      "",
      "Closes #12",
    ].join("\n");
    const body = [
      "## Summary",
      "",
      "Adds a login page.",
      "",
      "## Screenshots",
      "",
      "**Old** (default)",
      "![screenshot-01](https://example.com/user-attachments/assets/0000)",
      "",
      footer,
      "",
    ].join("\n");

    const result = splice(body, SECTION, { landed: 2 });

    expect(result.changed).toBe(true);
    expect(occurrences(result.body, footer)).toBe(1);
    expect(result.body.trimEnd().endsWith(footer)).toBe(true);
    expect(result.body.indexOf("assets/1111")).toBeLessThan(result.body.indexOf("## Pre-merge"));
  });

  test("splice returns unchanged on two ## Screenshots headings", () => {
    // Rule 2's structural refusal (principle-fail-closed).
    const twoHeadings = [
      "## Screenshots",
      "",
      "first",
      "",
      "## Notes",
      "",
      "middle",
      "",
      "## Screenshots",
      "",
      "second",
      "",
    ].join("\n");

    const result = splice(twoHeadings, SECTION, { landed: 2 });

    expect(result.body).toBe(twoHeadings);
    expect(result.changed).toBe(false);
    expect(result.reason.length).toBeGreaterThan(0);
  });

  test("splice returns unchanged when the result exceeds 65536 characters", () => {
    // Rule 5. GitHub's body limit is 65536 characters; the fixture is one
    // character under it, so any non-empty section overflows.
    const head = "## Summary\n\n";
    const tail = "\n";
    const big = head + "x".repeat(65535 - head.length - tail.length) + tail;
    expect(big.length).toBe(65535);

    const result = splice(big, SECTION, { landed: 2 });

    expect(result.body).toBe(big);
    expect(result.changed).toBe(false);
    expect(result.reason.length).toBeGreaterThan(0);
  });

  test("splice inserts before the first anchor heading, else at the end of content", () => {
    // Rule 2's insert half. Anchors: `## How to Verify`, `## Review notes`,
    // `## References`.
    const anchored = [
      "## Summary",
      "",
      "Adds a login page.",
      "",
      "## How to Verify",
      "",
      "Run it.",
      "",
      "## References",
      "",
      "- none",
      "",
    ].join("\n");

    const withAnchor = splice(anchored, SECTION, { landed: 2 });

    expect(withAnchor.changed).toBe(true);
    expect(withAnchor.body).toContain("## Screenshots");
    expect(withAnchor.body.indexOf("assets/1111")).toBeGreaterThan(withAnchor.body.indexOf("## Summary"));
    expect(withAnchor.body.indexOf("assets/1111")).toBeLessThan(withAnchor.body.indexOf("## How to Verify"));

    // No anchor: the section goes at the end of `content`, above the footer.
    const unanchored = ["## Summary", "", "Adds a login page.", "", "Closes #12", ""].join("\n");

    const withoutAnchor = splice(unanchored, SECTION, { landed: 2 });

    expect(withoutAnchor.changed).toBe(true);
    expect(withoutAnchor.body.indexOf("assets/1111")).toBeGreaterThan(withoutAnchor.body.indexOf("Adds a login page."));
    expect(withoutAnchor.body.indexOf("assets/1111")).toBeLessThan(withoutAnchor.body.indexOf("Closes #12"));
    expect(occurrences(withoutAnchor.body, "Closes #12")).toBe(1);
  });

  test("splice will not downgrade a section holding real screenshots", () => {
    // Rule 4 (principle-optimization-never-dependency): zero new references
    // against at least one existing one is a refusal, not a write.
    const result = splice(REAL, DEGRADED);

    expect(result.body).toBe(REAL);
    expect(result.changed).toBe(false);
    expect(result.reason.length).toBeGreaterThan(0);
  });

  test("an image-reference caption cannot satisfy the no-downgrade count", () => {
    // Rule 4 counts asymmetrically: the NEW section counts only
    // `![screenshot-<NN>](http…)`, so a caption that is itself a complete
    // image reference cannot buy an all-failures run past the guard.
    const injected = [
      "## Screenshots",
      "",
      "**![x](https://example.com/i.png)** (default) — captured, not yet uploaded: /tmp/login.png",
    ].join("\n");

    const result = splice(REAL, injected);

    expect(result.body).toBe(REAL);
    expect(result.changed).toBe(false);
    expect(result.reason.length).toBeGreaterThan(0);

    // Control: the same existing body DOES accept a real new section, so the
    // refusal above is the no-downgrade count and not a blanket refusal.
    expect(splice(REAL, SECTION, { landed: 2 }).changed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Slice 1 — L2: the prose contracts.
// ---------------------------------------------------------------------------

describe("Slice 1 — skill prose (L2)", () => {
  test("the skill pins the four-step upload order", () => {
    // Decision 1, A→B→C→D, as a command-ordering tripwire: pre-image read →
    // attach → splice → one body write. `--attach "$` also pins the
    // one-file-per-command, single-quoted-expansion form
    // (principle-never-interpolate).
    const upload = uploadRef();
    expect(upload.length).toBeGreaterThan(0);

    const preImage = upload.indexOf('PRE_IMAGE_JSON="$(gh pr view');
    const check = upload.indexOf("--check --body-file");
    const attach = upload.indexOf('--attach "$');
    const spliceCall = upload.indexOf("splice.mjs", attach);
    const write = upload.indexOf('--body-file "$NEW_BODY_FILE"', spliceCall);

    expect(preImage).toBeGreaterThanOrEqual(0);
    // Step A's pre-image check sits between the read and the first attach, so
    // a refusal it finds costs no upload — refuse before mutating.
    expect(check).toBeGreaterThan(preImage);
    expect(attach).toBeGreaterThan(check);
    expect(spliceCall).toBeGreaterThan(attach);
    expect(write).toBeGreaterThan(spliceCall);

    // Re-read after every attach: the body read command appears again past
    // the attach loop.
    expect(upload.indexOf('AFTER_JSON="$(gh pr view', attach)).toBeGreaterThan(attach);

    // No `#<alt>` suffix in any command the skill emits.
    const blocks = fencedBlocks(corpus());
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.filter((block) => ATTACH_ALT.test(block))).toEqual([]);
    // The detector fires on a planted positive.
    expect(ATTACH_ALT.test('gh pr edit "$N" --repo "$R" --attach "$P#Login"')).toBe(true);
  });

  test("path validation rejects a # in a path", () => {
    // The enumerated validation set is exists, regular file, no newline, no
    // `#` — each pinned as the token that names it.
    const upload = squash(uploadRef());
    expect(upload.length).toBeGreaterThan(0);
    expect(upload).toContain("exists");
    expect(upload).toContain("regular file");
    expect(upload).toContain("newline");
    expect(upload).toContain("`#`");
  });

  test("the outcome enum names the post-upload halt", () => {
    // `uploaded-not-written` is what decision 6's lost-update halt returns:
    // assets landed, body untouched.
    const input = inputRef();
    expect(input.length).toBeGreaterThan(0);

    // Delimited, so `uploaded` cannot pass on `uploaded-not-written`.
    const values = ["uploaded", "partial", "degraded", "unverified", "refused", "uploaded-not-written"];
    expect(values.filter((value) => !new RegExp("[`\"']" + value + "[`\"']").test(input))).toEqual([]);

    const fields = ["owner", "repo", "number", "outcome", "assets", "failures", "body_written", "operator_note", "section"];
    expect(fields.filter((field) => !input.includes(field))).toEqual([]);
    // Identifier-value pairs, not sentences: the halt writes no body and
    // propagates no section.
    expect(/body_written[^A-Za-z]{0,12}false/.test(squash(input))).toBe(true);
    expect(/section[^A-Za-z]{0,12}null/.test(squash(input))).toBe(true);
    // The halt lives where the guard lives.
    expect(uploadRef()).toContain("uploaded-not-written");
  });

  test("the input reference enumerates every entries-file refusal", () => {
    // `## Edge cases`, invalid inputs: zero entries, an --entries path that
    // does not exist, invalid JSON, and an entry lacking `path` or `caption`
    // each refuse before any `gh` call. The sweep runs over prose units that
    // state a refusal, so a `result.json` sample cannot satisfy it.
    const input = inputRef();
    expect(input.length).toBeGreaterThan(0);
    const units = refusalUnits(input);
    expect(units.length).toBeGreaterThan(0);

    const uncovered = ENTRIES_REFUSALS.filter((refusal) => !units.some(refusal.matches)).map(
      (refusal) => refusal.label,
    );
    expect(uncovered).toEqual([]);

    // The extractor fires on a planted positive, and skips the fenced sample
    // that would otherwise answer for the prose.
    const planted = '```\n{"outcome": "refused"}\n```\n\n- Zero entries: refuse and report the required input.\n';
    expect(refusalUnits(planted)).toEqual(["- Zero entries: refuse and report the required input."]);
  });

  test("a bare PR number with no checkout is refused", () => {
    // Decision 9: resolution is one command, and a bare number that resolves
    // nothing asks for the URL instead of guessing.
    const input = inputRef();
    expect(input.length).toBeGreaterThan(0);
    expect(input).toContain("gh pr view");
    expect(input).toContain("--json url --jq .url");
    // The strict parser this refusal reuses, cited by path.
    expect(input).toContain("pr-watch-as-reviewer/references/02-input.md");

    const units = refusalUnits(input);
    expect(units.filter((unit) => /number/i.test(unit)).length).toBeGreaterThan(0);
  });

  test("step A reports the crash-left image tail before any upload", () => {
    // `## Edge cases`: a crash between attach and write leaves a trailing run
    // of standalone absolute-URL image lines. Step A detects and REPORTS it —
    // the L1 rules above pin that the splice never deletes it.
    const upload = uploadRef();
    expect(upload.length).toBeGreaterThan(0);

    const detection = squash(upload).search(/trailing|tail/i);
    const attach = squash(upload).indexOf('--attach "$');
    expect(detection).toBeGreaterThanOrEqual(0);
    expect(attach).toBeGreaterThanOrEqual(0);
    // Detection is part of step A, so it runs before the first attach.
    expect(detection).toBeLessThan(attach);

    // Reported loudly rather than silently repaired.
    expect(corpus()).toContain("principle-skip-loudly");
  });

  test("Pre-merge is excluded by the anchor list, not by rule 1", () => {
    // The creation-time skeleton appends `## Pre-merge` post-open, so rule 1
    // does not always remove it; the anchor list is what excludes it.
    const source = spliceSource();
    expect(source.length).toBeGreaterThan(0);

    const anchors = ["## How to Verify", "## Review notes", "## References"];
    const starts = anchors.map((anchor) => source.indexOf(anchor));
    expect(starts.filter((index) => index < 0)).toEqual([]);
    // The window the anchor list occupies must not name Pre-merge.
    const from = Math.min(...starts);
    const to = Math.max(...anchors.map((anchor, index) => (starts[index] ?? 0) + anchor.length));
    expect(source.slice(from, to)).not.toContain("Pre-merge");

    // Footer members (rule 1), where Pre-merge actually belongs.
    expect(source).toContain("## Pre-merge");
    expect(source).toContain("## Companion PRs");

    // The rejected justification appears nowhere in the skill.
    const all = corpus();
    expect(all.length).toBeGreaterThan(0);
    expect(RULE_ONE_CLAIM.test(squash(all))).toBe(false);
    // The detector fires on a planted positive.
    expect(RULE_ONE_CLAIM.test("`## Pre-merge` is not an anchor: rule one already removed it.")).toBe(true);
  });

  test("rejected approaches record tail-comparison detection", () => {
    // Three rejected options — orphan branch, browser-profile uploader,
    // tail-comparison detection — each with its own reason, in the format of
    // docs/cross-host-portability.md.
    const rejected = rejectedRef();
    expect(rejected.length).toBeGreaterThan(0);
    expect(squash(rejected).toLowerCase()).toContain("tail");
    expect((squash(rejected).match(/why rejected/gi) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  test("the skill checks gh pr edit --help for --attach", () => {
    // Decision 2: capability, not version, decides.
    const upload = uploadRef();
    expect(upload.length).toBeGreaterThan(0);
    expect(upload).toContain("gh pr edit --help");
    expect(upload).toContain("--attach");
  });

  test("the degraded note renders local paths as plain text", () => {
    // Decision 10. No body template the skill emits may carry a markdown
    // image reference to a local path — the form `gh pr edit --attach`
    // rewrites in place, which would trip decision 6's prefix guard.
    const templates = sectionTemplates();
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.filter((template) => LOCAL_IMAGE.test(template))).toEqual([]);
    expect(uploadRef()).toContain("degraded");
    // The detector fires on a planted positive.
    expect(LOCAL_IMAGE.test("![Login](/Users/dev/shot.png)")).toBe(true);
    // …and not on the resolved form the success template uses.
    expect(LOCAL_IMAGE.test("![screenshot-01](https://example.com/a.png)")).toBe(false);
  });

  test("the gh upgrade note lives in the report, never in a PR body", () => {
    // Decision 15 with decision 2's floor: the note is a result field and a
    // report line, and no body template carries it.
    expect(inputRef()).toContain("operator_note");
    expect(uploadRef()).toContain("2.100.0");

    const templates = sectionTemplates();
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.filter((template) => template.includes("operator_note"))).toEqual([]);
    expect(templates.filter((template) => template.includes("2.100.0"))).toEqual([]);
  });

  test("verification reads body_html, scoped to the section, and never blocks", () => {
    // Decision 11. GitHub's own renderer is the authority; the assertion is
    // scoped to the rendered Screenshots section; a failure sets `unverified`
    // and writes nothing.
    const verify = verifyRef();
    expect(verify.length).toBeGreaterThan(0);
    expect(verify).toContain('gh api --hostname "$PR_HOST" repos/');
    expect(verify).toContain("Accept: application/vnd.github.full+json");
    expect(verify).toContain(".body_html");
    expect(verify).toContain("alt");
    expect(verify).toContain("screenshot-");
    // Section-scoped: the rendered heading bounds the local-src assertion.
    expect(verify).toContain("<h2>");
    expect(verify).toContain("src");
    expect(verify).toContain("file:");
    // The empty-body_html fallback.
    expect(verify).toContain("/markdown --input -");
    expect(verify).toContain("unverified");
    // Never reverts, never retries: the verify step issues no body write and
    // no wait loop.
    expect(verify).not.toContain("gh pr edit");
    expect(verify).not.toContain("sleep ");
  });
});

// ---------------------------------------------------------------------------
// Slice 4 — L2: the pointers.
// ---------------------------------------------------------------------------

const OPEN_COMMENTS_EXECUTION = join(REPO_ROOT, "skills", "pr-open-comments", "references", "04-execution.md");
const AUTHORIZED_EXECUTION = join(REPO_ROOT, "skills", "pr-open-comments", "references", "06-authorized-execution.md");

// Slice of `text` from the first line matching `startRe` to the next line
// matching `endRe` (or EOF). Missing start → "" so dependent assertions fail.
function block(text: string, startRe: RegExp, endRe: RegExp): string {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => startRe.test(line));
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => endRe.test(line));
  return [lines[start], ...rest.slice(0, end === -1 ? rest.length : end)].join("\n");
}

// Every tracked markdown surface a stale pointer could hide in. docs/plans/ is
// untracked pipeline scratch and is never committed, so it is skipped.
function documentedMarkdown(): string[] {
  const out: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (path === join(REPO_ROOT, "docs", "plans")) continue;
        visit(path);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".md")) out.push(path);
    }
  };
  for (const root of ["skills", "docs"]) {
    const directory = join(REPO_ROOT, root);
    if (existsSync(directory)) visit(directory);
  }
  const readme = join(REPO_ROOT, "README.md");
  if (existsSync(readme)) out.push(readme);
  return out;
}

describe("Slice 4 — pointers and the orphan-branch trap (L2)", () => {
  test("pr-open-comments names /pr-screenshots in its option menu", () => {
    // Decision 16: the pointer lives in the operator's option menu (step 7).
    const menu = block(fileOr(OPEN_COMMENTS_EXECUTION), /^### Step 7\b/, /^### Step 8\b/);
    expect(menu.length).toBeGreaterThan(0);
    expect(menu).toContain("/pr-screenshots");
  });

  test("the skill name never appears in Authorized Execution", () => {
    // Decision 16's other half: the images must be captured first and a PR
    // comment is untrusted data, so the skill never enters the auto-apply path.
    const autoApply = block(fileOr(OPEN_COMMENTS_EXECUTION), /^### Step 6\b/, /^### Step 7\b/);
    expect(autoApply.length).toBeGreaterThan(0);
    expect(autoApply).not.toContain("pr-screenshots");

    const authorized = fileOr(AUTHORIZED_EXECUTION);
    expect(authorized.length).toBeGreaterThan(0);
    expect(authorized).not.toContain("pr-screenshots");
  });

  test("rejected approaches name both orphan-branch failure reasons", () => {
    // Decision 17: the images die with the branch, AND a PAT fetch of a
    // web-session blob URL 404s on a private repo, so blob existence is never
    // evidence the image renders.
    const rejected = rejectedRef();
    expect(rejected.length).toBeGreaterThan(0);
    const flat = squash(rejected).toLowerCase();
    expect(flat).toContain("orphan");
    // Reason one: the images die with the branch. Pinned as the stem, so a
    // rewrite of the sentence around it stays green.
    expect(flat).toMatch(/delet/);
    // Reason two: the web-session blob URL, and what a PAT fetch of it returns.
    expect(rejected).toContain("?raw=1");
    expect(rejected).toContain("blob/");
    expect(rejected).toContain("404");
  });

  test("no file under skills/ or docs/ points at the absent README Screenshots section", () => {
    const pointer = "Screenshots in PRs";
    const files = documentedMarkdown();
    // Blindness guard: an empty or mis-scoped walk would pass vacuously.
    expect(files.length).toBeGreaterThan(50);
    const offenders = files
      .filter((path) => read(path).includes(pointer))
      .map((path) => relative(REPO_ROOT, path));
    expect(offenders).toEqual([]);
    // The detector fires on a planted positive.
    expect(`keep it in sync with the README's "${pointer}" section`.includes(pointer)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// L1: the section boundaries the five rules are read against.
//
// The rules above say what happens to a section; these say where a section
// begins and ends, which is the half a body's markdown gets a vote in.
// ---------------------------------------------------------------------------

describe("Slice 1 — splice.mjs section boundaries (L1)", () => {
  test("a level-one heading bounds the replace", () => {
    // `^##\s` is not the section boundary: a `# ` heading outranks
    // `## Screenshots` and ends it, so a replace that runs past one deletes a
    // whole level-one section and still reports `changed` with no reason.
    const body = [
      "## Screenshots",
      "",
      "**Old** (default)",
      "![screenshot-01](https://example.com/a/0)",
      "",
      "# Release notes",
      "",
      "- shipped the login page",
      "",
      "Closes #123",
      "",
    ].join("\n");

    const result = splice(body, SECTION, { landed: 2 });

    expect(result.changed).toBe(true);
    expect(result.body).toContain("# Release notes");
    expect(result.body).toContain("- shipped the login page");
    expect(occurrences(result.body, "Closes #123")).toBe(1);
    expect(result.body).toContain("assets/1111");
    expect(result.body).not.toContain("/a/0");
    // Order survives: the new section stays above the level-one section.
    expect(result.body.indexOf("assets/1111")).toBeLessThan(result.body.indexOf("# Release notes"));
  });

  test("a `### ` subheading is not a boundary", () => {
    // The other half of the same rule. A subheading belongs to the section
    // above it, so it lands INSIDE the range a replace covers — and because a
    // `### ` line is not a shape this skill's own renderer emits, being inside
    // that range is now a refusal that names it, rather than a deletion.
    const body = [
      "## Screenshots",
      "",
      "### Before",
      "![screenshot-01](https://example.com/a/0)",
      "",
      "Closes #7",
      "",
    ].join("\n");

    const result = splice(body, SECTION, { landed: 2 });

    expect(result.changed).toBe(false);
    expect(result.body).toBe(body);
    // The refusal names the subheading, which is only reachable when the
    // subheading is inside the range — a boundary reading would leave it out.
    expect(result.reason).toContain("### Before");
    expect(result.reason).toContain("line 3");

    // Control: promote it to a real `## ` boundary and the same body writes,
    // because the boundary ends the section above it.
    const bounded = body.replace("### Before", "## Before");
    const written = splice(bounded, SECTION, { landed: 2 });
    expect(written.changed).toBe(true);
    expect(written.body).toContain("## Before");
    expect(occurrences(written.body, "Closes #7")).toBe(1);
  });

  test("an unclosed fence in the body is refused, never masked over", () => {
    // A blind toggle masks everything below an unbalanced
    // fence, so the replace bound runs to EOF and a standalone `Closes #123`
    // is deleted with `changed: true`.
    const body = [
      "## Screenshots",
      "",
      "**Old**",
      "![screenshot-01](https://example.com/a/0)",
      "",
      "## Notes",
      "",
      "```",
      "unclosed",
      "",
      "Closes #123",
      "",
    ].join("\n");

    const result = splice(body, SECTION, { landed: 2 });

    expect(result.body).toBe(body);
    expect(result.changed).toBe(false);
    expect(result.reason.length).toBeGreaterThan(0);
  });

  test("an unclosed fence in the section is refused", () => {
    // The same fail-closed rule on the other input: a section carrying an
    // unbalanced fence would leave the written body unparseable for the next
    // run, which is the state this refusal exists to prevent.
    const body = ["## Summary", "", "hi", "", "Closes #1", ""].join("\n");

    const result = splice(body, ["## Screenshots", "", "```", "note"].join("\n"));

    expect(result.body).toBe(body);
    expect(result.changed).toBe(false);
    expect(result.reason.length).toBeGreaterThan(0);
  });

  test("a nested four-backtick block does not hide the real Screenshots heading", () => {
    // `## Review notes` carries the four-backtick `DATA` block
    // skills/cross-model-review/SKILL.md mandates, wrapping an odd number of
    // three-backtick lines. A blind toggle inverts the mask from there on,
    // hides the real heading, fires the INSERT path, and lands a SECOND
    // `## Screenshots` — after which the two-headings refusal locks the PR out
    // of every later run. A closer must match its opener's character and
    // length and carry no info string.
    const body = [
      "## Summary",
      "",
      "x",
      "",
      "## Review notes",
      "",
      "````DATA",
      "```",
      "````",
      "",
      "## Screenshots",
      "",
      "**Old**",
      "![screenshot-01](https://example.com/a/0)",
      "",
      "Closes #12",
      "",
    ].join("\n");

    const result = splice(body, SECTION, { landed: 2 });

    expect(result.changed).toBe(true);
    // Exactly one heading: the existing section was REPLACED, not duplicated.
    expect(occurrences(result.body, "## Screenshots")).toBe(1);
    expect(result.body).toContain("assets/1111");
    expect(result.body).not.toContain("/a/0");
    // The DATA block is re-emitted intact.
    expect(result.body).toContain("````DATA");
    expect(occurrences(result.body, "````")).toBe(2);
  });

  test("splice keeps a crash tail that no ticket-reference line separates", () => {
    // The preservation contract was only honored when a `Closes`
    // line happened to sit between the section and the tail. With nothing
    // between them the replace ran to the end of `content` and discarded the
    // tail, against `## Hard rules`, "Never delete what you did not write".
    const crashed = [
      "## Summary",
      "",
      "Adds a login page.",
      "",
      "## Screenshots",
      "",
      "**Login** (default)",
      "![screenshot-01](https://example.com/user-attachments/assets/0000)",
      "",
      "![screenshot-01](https://example.com/user-attachments/assets/dead)",
      "",
    ].join("\n");

    const result = splice(crashed, SECTION, { landed: 2 });

    expect(result.changed).toBe(true);
    expect(result.body).toContain("assets/dead");
    expect(result.body).toContain("assets/1111");
    expect(result.body).not.toContain("assets/0000");
    // The tail stays below the new section, where the attach step left it.
    expect(result.body.indexOf("assets/1111")).toBeLessThan(result.body.indexOf("assets/dead"));
  });

  test("a captioned image is not mistaken for a crash tail", () => {
    // The discriminator, from the other side: this skill always writes a
    // `**caption**` line directly above its own images, so its own last image
    // is NOT standalone and IS replaced. Without this, every rerun would
    // duplicate the section it meant to replace.
    const own = [
      "## Screenshots",
      "",
      "**Login** (default)",
      "![screenshot-01](https://example.com/a/0)",
      "",
    ].join("\n");

    const result = splice(own, SECTION, { landed: 2 });

    expect(result.changed).toBe(true);
    expect(result.body).not.toContain("/a/0");
    expect(occurrences(result.body, "## Screenshots")).toBe(1);
  });

  test("a note-borne image reference cannot satisfy the no-downgrade count", () => {
    // The top-level `notes` list is caller text
    // and renders verbatim. One note line carrying `![screenshot-NN](http…)`
    // made an all-failures section pass rule 4's count and REPLACE a live
    // user-attachments URL with the attacker's — on a body that may already be
    // merged. `--landed` is the count the run actually resolved, so a section
    // naming more references than that is refused whatever the text says.
    const noteBorne = [
      "## Screenshots",
      "",
      "**Login** (default) — captured, not yet uploaded: login.png",
      "",
      "![screenshot-01](https://evil.example/pixel.png)",
    ].join("\n");

    const result = splice(REAL, noteBorne, { landed: 0 });

    expect(result.body).toBe(REAL);
    expect(result.changed).toBe(false);
    expect(result.reason.length).toBeGreaterThan(0);

    // Control: the real section, whose two references match a two-asset run,
    // still writes — so the refusal above is the count and not a blanket ban.
    expect(splice(REAL, SECTION, { landed: 2 }).changed).toBe(true);
    // …and the same section is refused when the run landed only one.
    expect(splice(REAL, SECTION, { landed: 1 }).changed).toBe(false);
  });

  test("splice is idempotent when the section file ends with a newline", () => {
    // A section read from a file carries a trailing newline. Left in,
    // it stacked: every rerun of an IDENTICAL section grew the body by a blank
    // line and reported `changed`, so `outcome` read `uploaded` on every retry
    // with no signal that nothing new had happened.
    const fromFile = SECTION + "\n";
    const body = ["# Some PR", "", "Fixes: #123", ""].join("\n");

    const first = splice(body, fromFile, { landed: 2 });
    expect(first.changed).toBe(true);

    const second = splice(first.body, fromFile, { landed: 2 });
    expect(second.changed).toBe(false);
    expect(second.reason.length).toBeGreaterThan(0);
    expect(second.body).toBe(first.body);

    // A footer follows the section, which is the shape that grew.
    expect(first.body).toContain("Fixes: #123");
    expect(occurrences(first.body, "Fixes: #123")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// L1: the markdown constructs the transform models, and the refusal that
// covers every construct it does not.
//
// A refusal costs an operator one manual edit and leaves the body
// byte-identical; a wrong transform deletes text from a PR that may already be
// merged. So each test below is either "this shape is modeled, and here is
// what it does" or "this shape is outside the model, and the body is
// untouched" — never "this shape is transformed and we hope".
// ---------------------------------------------------------------------------

describe("Slice 1 — modeled shapes and unmodeled refusals (L1)", () => {
  test("a Screenshots heading inside an HTML comment is not a heading", () => {
    // A PR template ships a commented-out placeholder. Read as a real
    // heading, the replace runs from inside the comment to the next boundary
    // and deletes the `-->` — after which CommonMark runs the HTML block to
    // end of document and the whole body renders as the two lines above it.
    const templated = [
      "## Summary",
      "",
      "Adds a login page.",
      "",
      "<!--",
      "## Screenshots",
      "Paste images here.",
      "-->",
      "",
      "## How to Verify",
      "",
      "- run it",
      "",
      "Closes #123",
      "",
    ].join("\n");

    const result = splice(templated, SECTION, { landed: 2 });

    expect(result.changed).toBe(true);
    // The comment survives whole: opener, content, and closer.
    expect(result.body).toContain("<!--\n## Screenshots\nPaste images here.\n-->");
    expect(occurrences(result.body, "-->")).toBe(1);
    // The section was INSERTED at the anchor, not spliced over the comment.
    expect(result.body).toContain("assets/1111");
    expect(result.body).toContain("## How to Verify");
    expect(occurrences(result.body, "Closes #123")).toBe(1);
  });

  test("an HTML comment inside the section is refused, not deleted", () => {
    // The replace bound runs past a masked comment, so the comment would be
    // deleted whole — text this skill did not write, from a body that may
    // already be merged. Preservation has nothing to lift it into, so the
    // transform refuses and the operator edits the body by hand.
    const placeholder = [
      "## Screenshots",
      "",
      "**Old**",
      "![screenshot-01](https://example.com/a/0)",
      "",
      "<!-- paste the new ones here -->",
      "",
      "Closes #5",
      "",
    ].join("\n");

    const result = splice(placeholder, SECTION, { landed: 2 });

    expect(result.body).toBe(placeholder);
    expect(result.changed).toBe(false);
    expect(result.reason.length).toBeGreaterThan(0);
  });

  test("an unterminated HTML comment is refused", () => {
    const open = [
      "## Screenshots",
      "",
      "**Old**",
      "![screenshot-01](https://example.com/a/0)",
      "",
      "<!-- note",
      "",
      "Closes #123",
      "",
    ].join("\n");

    const result = splice(open, SECTION, { landed: 2 });

    expect(result.body).toBe(open);
    expect(result.changed).toBe(false);
    expect(result.reason.length).toBeGreaterThan(0);
  });

  test("a comment that opens mid-line is refused, not guessed at", () => {
    // Inline raw HTML is not in the model: the scan tracks comments that open
    // a line, so a mid-line one would mask a heading it never saw open.
    const inline = [
      "## Screenshots",
      "",
      "**Old**",
      "![screenshot-01](https://example.com/a/0)",
      "",
      "Some prose <!-- with an inline comment --> and more.",
      "",
      "Closes #7",
      "",
    ].join("\n");

    const result = splice(inline, SECTION, { landed: 2 });

    expect(result.body).toBe(inline);
    expect(result.changed).toBe(false);
    expect(result.reason.length).toBeGreaterThan(0);
  });

  test("a stray arrow in prose is not a comment closer", () => {
    // `-->` only closes a comment that opened; on its own it is text, and
    // treating it as significant would refuse ordinary bodies.
    const prose = [
      "## Summary",
      "",
      "input --> output, end to end.",
      "",
      "## Screenshots",
      "",
      "**Old**",
      "![screenshot-01](https://example.com/a/0)",
      "",
      "Closes #3",
      "",
    ].join("\n");

    const result = splice(prose, SECTION, { landed: 2 });

    expect(result.changed).toBe(true);
    expect(result.body).toContain("input --> output, end to end.");
    expect(result.body).toContain("assets/1111");
    expect(occurrences(result.body, "Closes #3")).toBe(1);
  });

  test("a heading indented up to three spaces bounds the replace", () => {
    // CommonMark 0.31.2 §4.2 admits up to three spaces of indentation, so a
    // column-zero pattern reads `  ## Test plan` as body text and the replace
    // runs through the section it opens.
    const indented = [
      "Intro",
      "",
      "## Screenshots",
      "",
      "**Old** (default)",
      "![screenshot-01](https://example.com/a/0)",
      "",
      "  ## Test plan",
      "",
      "- [ ] step one",
      "",
    ].join("\n");

    const result = splice(indented, SECTION, { landed: 2 });

    expect(result.changed).toBe(true);
    expect(result.body).toContain("  ## Test plan");
    expect(result.body).toContain("- [ ] step one");
    expect(result.body).not.toContain("/a/0");
    expect(result.body.indexOf("assets/1111")).toBeLessThan(result.body.indexOf("## Test plan"));
  });

  test("a setext heading bounds the replace", () => {
    // CommonMark §4.3: an underlined paragraph is a heading, and it ends the
    // section above it exactly as its ATX spelling would.
    const setext = [
      "Intro",
      "",
      "## Screenshots",
      "",
      "**Old** (default)",
      "![screenshot-01](https://example.com/a/0)",
      "",
      "Test plan",
      "---------",
      "",
      "- [ ] step one",
      "",
    ].join("\n");

    const result = splice(setext, SECTION, { landed: 2 });

    expect(result.changed).toBe(true);
    expect(result.body).toContain("Test plan\n---------");
    expect(result.body).toContain("- [ ] step one");
    expect(result.body).not.toContain("/a/0");
  });

  test("a Screenshots heading in its setext spelling is replaced, not duplicated", () => {
    const setext = [
      "Intro",
      "",
      "Screenshots",
      "-----------",
      "",
      "**Old** (default)",
      "![screenshot-01](https://example.com/a/0)",
      "",
      "Closes #4",
      "",
    ].join("\n");

    const result = splice(setext, SECTION, { landed: 2 });

    expect(result.changed).toBe(true);
    expect(result.body).not.toContain("/a/0");
    expect(result.body).not.toContain("-----------");
    expect(occurrences(result.body, "## Screenshots")).toBe(1);
    expect(occurrences(result.body, "Closes #4")).toBe(1);
  });

  test("a heading-shaped line indented into a code block is refused", () => {
    // Four spaces make it an indented code block to a parser and a section
    // boundary to a reader. The scan models neither, so it refuses.
    const code = [
      "Intro",
      "",
      "## Screenshots",
      "",
      "old text",
      "",
      "    ## Test plan",
      "",
      "- [ ] step one",
      "",
    ].join("\n");

    const result = splice(code, SECTION, { landed: 2 });

    expect(result.body).toBe(code);
    expect(result.changed).toBe(false);
    expect(result.reason.length).toBeGreaterThan(0);
  });

  test("a run of adjacent standalone image lines is preserved whole", () => {
    // `--attach` appends one bare image line per upload, so a crash after
    // several leaves a RUN. Testing each line against its own predecessor
    // classifies only the first member and sweeps the rest into the section.
    const run = [
      "Intro",
      "",
      "## Screenshots",
      "",
      "![a](https://example.com/user-attachments/assets/1/a.png)",
      "![b](https://example.com/user-attachments/assets/2/b.png)",
      "",
    ].join("\n");

    const result = splice(run, SECTION, { landed: 2 });

    expect(result.changed).toBe(true);
    expect(result.body).toContain("assets/1/a.png");
    expect(result.body).toContain("assets/2/b.png");
    expect(result.body).toContain("assets/1111");
    // Preserved below the new section, in order, exactly once each.
    expect(occurrences(result.body, "assets/1/a.png")).toBe(1);
    expect(result.body.indexOf("assets/1111")).toBeLessThan(result.body.indexOf("assets/1/a.png"));
    expect(result.body.indexOf("assets/1/a.png")).toBeLessThan(result.body.indexOf("assets/2/b.png"));
  });

  test("preservation survives a second round-trip", () => {
    // Joined flush, a lifted image lands directly under the section's last
    // line; on the next run its predecessor is an image rather than a blank,
    // so it is no longer standalone and the run after that replaces it. The
    // blank separator is what makes the preservation stable.
    const bare = "![before](https://example.com/user-attachments/assets/9/z.png)";

    const first = splice(bare, SECTION, { landed: 2 });
    expect(first.changed).toBe(true);
    expect(first.body).toContain("assets/9/z.png");

    const second = splice(first.body, SECTION, { landed: 2 });
    expect(second.changed).toBe(false);
    expect(second.body).toContain("assets/9/z.png");

    // A third pass over a section that DID change still keeps it.
    const other = SECTION.replace(/1111/g, "3333").replace(/2222/g, "4444");
    const third = splice(first.body, other, { landed: 2 });
    expect(third.changed).toBe(true);
    expect(third.body).toContain("assets/9/z.png");
  });

  test("an image the skill did not write is never deleted from the section", () => {
    // Preservation covers a trailing run; inside the section there is nothing
    // to lift, so the transform refuses rather than replacing over it. Between
    // the two, "never delete what you did not write" holds in every shape.
    const wrapped = [
      "## Screenshots",
      "",
      "<details>",
      "<summary>before</summary>",
      "",
      "![hand-authored](https://example.com/diagram.png)",
      "",
      "</details>",
      "",
      "Closes #1",
      "",
    ].join("\n");

    const result = splice(wrapped, SECTION, { landed: 2 });

    expect(result.body).toBe(wrapped);
    expect(result.changed).toBe(false);
    expect(result.reason.length).toBeGreaterThan(0);

    // A captioned hand-authored image is refused for the same reason.
    const captioned = ["## Screenshots", "", "**Before**", "![before](https://example.com/x.png)", ""].join("\n");
    expect(splice(captioned, SECTION, { landed: 2 }).changed).toBe(false);

    // Control: the same shapes carrying this skill's own alt are replaced.
    const ours = ["## Screenshots", "", "**Before**", "![screenshot-01](https://example.com/x.png)", ""].join("\n");
    expect(splice(ours, SECTION, { landed: 2 }).changed).toBe(true);
  });

  test("a section holding fewer images than the one it replaces is refused", () => {
    const two = [
      "## Screenshots",
      "",
      "**Login** (default)",
      "![screenshot-01](https://example.com/user-attachments/assets/aaaa)",
      "",
      "**Login** (error)",
      "![screenshot-02](https://example.com/user-attachments/assets/bbbb)",
      "",
      "Closes #9",
      "",
    ].join("\n");
    const one = ["## Screenshots", "", "**Login** (default)", "![screenshot-01](https://example.com/c)"].join("\n");

    const result = splice(two, one, { landed: 1 });

    expect(result.body).toBe(two);
    expect(result.changed).toBe(false);
    expect(result.reason.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// L1: constructs OUTSIDE the modeled set.
//
// The scan dispatches on fences, comments, indented headings, ATX and setext
// headings. A raw HTML container and every non-inline image form fell through
// as ordinary text: a `## Screenshots`-shaped line inside a `<div>` was read
// as this skill's own heading and the replace deleted the `</div>` around it,
// and an `<img>`, an `![alt][ref]`, a `[ref]: <url>`, or a bare auto-embedded
// URL inside the replaced section was deleted with `changed: true` and an
// empty reason. Both are now faults, so the closed-set claim is testable.
// ---------------------------------------------------------------------------

// One out-of-model construct per entry, each with the loss it used to cause.
const UNMODELED: { label: string; body: string; survives: string }[] = [
  {
    label: "a div container around the heading",
    body: '<div align="center">\n## Screenshots\n</div>\n\n## Test plan\n\n- a\n',
    survives: "</div>",
  },
  {
    label: "a table container",
    body: "## Screenshots\n\n<table>\n<tr><td>\n\n![shot](https://example.com/s.png)\n\n</td></tr>\n</table>\n\n## Test plan\n",
    survives: "</table>",
  },
  {
    label: "a details container",
    body: "## Screenshots\n\n<details>\n<summary>Before</summary>\n\n![shot](https://example.com/s.png)\n\n</details>\n\n## Test plan\n",
    survives: "</details>",
  },
  {
    label: "a picture element",
    body: '## Screenshots\n\n<picture>\n<source srcset="https://example.com/s.webp">\n<img src="https://example.com/s.png">\n</picture>\n\n## Test plan\n',
    survives: "<picture>",
  },
  {
    label: "an inline HTML image",
    body: '## Screenshots\n\nBefore and after: <img src="https://example.com/s.png" width="600">\n\n## Test plan\n',
    survives: '<img src="https://example.com/s.png"',
  },
  {
    label: "a reference-style image",
    body: "## Screenshots\n\n![before][shot]\n\n## Test plan\n\n[shot]: https://example.com/s.png\n",
    survives: "![before][shot]",
  },
  {
    label: "a link reference definition",
    body: "## Screenshots\n\nold\n\n## Test plan\n\n[shot]: https://example.com/s.png\n",
    survives: "[shot]: https://example.com/s.png",
  },
  {
    label: "a bare attachment URL the host auto-embeds",
    body: "## Screenshots\n\nhttps://github.com/user-attachments/assets/abcd\n\n## Test plan\n",
    survives: "https://github.com/user-attachments/assets/abcd",
  },
  {
    label: "a bare image URL the host auto-embeds",
    body: "## Screenshots\n\nhttps://example.com/loose.png\n\n## Test plan\n",
    survives: "https://example.com/loose.png",
  },
];

// The closed set was not closed on raw HTML, and the gap was exactly inverted
// from where the risk is. The block test was anchored `^ {0,3}<`, and the only
// unanchored tag test matched `img|picture|source|svg` — so `<details>` at
// column zero refused the whole run (a deliberate over-refusal) while `-
// <video src="https://…/user-attachments/…">` INSIDE the section being
// replaced was deleted with `changed: true` and no reason, and that attachment
// id is unrecoverable once the body is written.
// The pool above sweeps tags; it did not sweep POSITION. This is the cross
// product, and it is the test that would have caught it.
const RAW_HTML_TAGS = [
  "<details>hi</details>",
  '<video src="https://github.com/user-attachments/assets/1111"></video>',
  '<iframe src="https://example.com/embed"></iframe>',
  "<audio controls></audio>",
  '<embed src="https://example.com/x.svg">',
  '<object data="https://example.com/x.svg"></object>',
  "<div>hi</div>",
  "<table><tr><td>hi</td></tr></table>",
  '<a href="https://example.com">link</a>',
  '<picture><img src="https://example.com/s.png"></picture>',
  '<img src="https://example.com/s.png">',
  "<span>hi</span>",
  "<br/>",
];

const TAG_POSITIONS: { label: string; render: (tag: string) => string }[] = [
  { label: "line-start", render: (tag) => tag },
  { label: "list-item", render: (tag) => `- ${tag}` },
  { label: "mid-line", render: (tag) => `Demo: ${tag}` },
];

describe("Slice 1 — constructs outside the model (L1)", () => {
  test("every raw HTML tag refuses in every position, inside the section and out", () => {
    // Two placements per combination: inside the `## Screenshots` section,
    // where a miss DELETES, and below the next heading, where a miss reads a
    // container's contents as document text.
    const placements: { label: string; body: (line: string) => string }[] = [
      {
        label: "inside the Screenshots section",
        body: (line) => `## Screenshots\n\n**Old**\n![screenshot-01](https://example.com/a/0)\n${line}\n\n## Test plan\n\n- a\n`,
      },
      {
        label: "elsewhere in the body",
        body: (line) => `## Screenshots\n\n**Old**\n![screenshot-01](https://example.com/a/0)\n\n## Test plan\n\n${line}\n`,
      },
    ];

    const survived: string[] = [];
    for (const tag of RAW_HTML_TAGS) {
      for (const position of TAG_POSITIONS) {
        for (const placement of placements) {
          const body = placement.body(position.render(tag));
          const result = splice(body, SECTION, { landed: 2 });
          if (result.changed || result.body !== body || result.reason.length === 0) {
            survived.push(`${tag} / ${position.label} / ${placement.label}`);
          }
        }
      }
    }
    expect(survived).toEqual([]);

    // The pool is the reason, not an empty loop.
    expect(RAW_HTML_TAGS.length * TAG_POSITIONS.length * placements.length).toBe(78);

    // And the same body with the tag's angle brackets escaped — text that
    // renders literally rather than markup — still writes, so the sweep above
    // is the tag and not a ban on the letter `<`.
    const escaped =
      "## Screenshots\n\n**Old**\n![screenshot-01](https://example.com/a/0)\n\n## Test plan\n\nDemo: \\<details\\>hi\\</details\\>\n";
    expect(splice(escaped, SECTION, { landed: 2 }).changed).toBe(true);
  });

  test("a refusal names the line and the construct, never the class alone", () => {
    // A body whose Screenshots section is already correct and whose
    // `<details>` sits paragraphs away refused with wording identical to one
    // where the two are adjacent — no line, no snippet, not even which tag
    // matched. The scan holds both when it decides, and discarded them.
    const body = [
      "## Summary",
      "",
      "Adds a login page.",
      "",
      "## Notes",
      "",
      "Demo: <details>expand me</details>",
      "",
      "## Test plan",
      "",
      "- a",
      "",
    ].join("\n");

    const reason = bodyRefusal(body);
    expect(reason.length).toBeGreaterThan(0);
    expect(reason).toContain("line 7");
    expect(reason).toContain("<details>");
    expect(reason).toBe(splice(body, SECTION, { landed: 2 }).reason);

    // Move the same construct and the reason moves with it: the locator is
    // computed, not pasted.
    const moved = body.replace("## Notes\n\nDemo:", "## Notes\n\nplain\n\nDemo:");
    expect(bodyRefusal(moved)).toContain("line 9");

    // Every other body-scan refusal carries a locator too.
    const located: [string, string][] = [
      ["## Screenshots\n\na\n\n## Screenshots\n\nb\n\n## Test plan\n", "lines 1, 5"],
      ["## Screenshots\n\n**Hand**\n![diagram](https://example.com/d.png)\n\n## Test plan\n", "line 4"],
      ["## Screenshots\n\n<!-- keep -->\n\n## Test plan\n", "line 3"],
      ["## Screenshots\n\nReviewer note: the second shot is stale.\n\n## Test plan\n", "line 3"],
      ["## Summary\n\n```js\nunclosed\n", "line 3"],
      ["## Summary\n\n<!--\nunterminated\n", "line 3"],
    ];
    const unlocated = located.filter(([body_, locator]) => !bodyRefusal(body_).includes(locator));
    expect(unlocated).toEqual([]);
  });

  test("prose inside the section is refused, not replaced away", () => {
    // "Never delete what you did not write" enumerated images, comments, HTML
    // containers, and unmodeled shapes — and plain prose was in none of them,
    // so a maintainer's note under the heading was deleted with exit 0 on a PR
    // that may already be merged. No attacker required.
    const note = [
      "## Screenshots",
      "",
      "**Login** (default)",
      "![screenshot-01](https://example.com/user-attachments/assets/abcd)",
      "",
      "Reviewer note: the second shot is stale, ignore it.",
      "",
      "Closes #3",
      "",
    ].join("\n");

    const result = splice(note, SECTION, { landed: 2 });
    expect(result.changed).toBe(false);
    expect(result.body).toBe(note);
    expect(result.reason).toContain("Reviewer note");
    // A pre-image refusal, so it fires in step A before any upload runs.
    expect(bodyRefusal(note)).toBe(result.reason);

    // A setext `Screenshots`/`---` heading is treated as this skill's own, so
    // its paragraph is under the same protection.
    const setext = ["Screenshots", "-----------", "", "Reviewer note: stale.", "", "Closes #3", ""].join("\n");
    expect(splice(setext, SECTION, { landed: 2 }).changed).toBe(false);

    // Control: every shape this skill's own renderer emits still writes —
    // caption, resolved image, blockquoted note, and failure line — otherwise
    // the refusal would make the skill unable to update its own section.
    const own = [
      "## Screenshots",
      "",
      "**Login** (default)",
      "![screenshot-01](https://example.com/user-attachments/assets/abcd)",
      "",
      "> _note:_ 2 states skipped — see manifest",
      "",
      "Not uploaded: Signup — not an image",
      "",
      "Closes #3",
      "",
    ].join("\n");
    const rewritten = splice(own, SECTION, { landed: 2 });
    expect(rewritten.changed).toBe(true);
    expect(rewritten.body).not.toContain("assets/abcd");
    expect(occurrences(rewritten.body, "Closes #3")).toBe(1);
  });

  test("ownership is provenance, so a foreign blockquote or bold line refuses", () => {
    // `OWN_NOTE` was `/^>/` and `OWN_CAPTION` was "any bold line", so the
    // renderer's own vocabulary claimed text a reviewer typed: a `>` note and
    // a `**bold**` warning were both deleted with `changed: true` and an empty
    // reason. Rendering notes as `> ` to make them recognizable is what
    // widened the surface, so the marker closes it.
    const foreign: [string, string][] = [
      ["a reviewer's blockquote", "> Reviewer: the second shot is stale, do not ship"],
      ["a reviewer's bold warning", "**IMPORTANT: these images contain a real API key**"],
      ["a bold line above no image", "**Note** see the thread"],
    ];
    for (const [label, line] of foreign) {
      const body = ["## Screenshots", "", line, "", "Closes #3", ""].join("\n");
      const result = splice(body, SECTION, { landed: 2 });
      expect({ label, changed: result.changed }).toEqual({ label, changed: false });
      expect({ label, body: result.body }).toEqual({ label, body });
      expect({ label, named: result.reason.includes(line.slice(0, 20)) }).toEqual({ label, named: true });
      // A pre-image refusal, so it fires in step A before any upload runs.
      expect({ label, same: bodyRefusal(body) === result.reason }).toEqual({ label, same: true });
    }

    // A foreign bold line one line above this skill's own image still refuses,
    // because it displaces the caption out of the grammar the renderer emits.
    const displaced = [
      "## Screenshots",
      "",
      "**IMPORTANT: these images contain a real API key**",
      "**Login** (default)",
      "![screenshot-01](https://example.com/user-attachments/assets/abcd)",
      "",
      "Closes #3",
      "",
    ].join("\n");
    expect(splice(displaced, SECTION, { landed: 2 }).changed).toBe(false);
  });

  test("the marked note, its separator, and both caption positions still write", () => {
    // Blindness guard for the test above: a provenance rule strict enough to
    // refuse everything would make the skill unable to replace its own output.
    const own = [
      "## Screenshots",
      "",
      "**Login** (default)",
      "![screenshot-01](https://example.com/user-attachments/assets/abcd)",
      "",
      "**Signup** (error) — captured, not yet uploaded: signup.png",
      "",
      "> _note:_ 2 states skipped — see manifest",
      ">",
      "> _note:_ one image was missing from disk",
      "",
      "Not uploaded: Signup — not an image",
      "",
      "Closes #3",
      "",
    ].join("\n");
    const result = splice(own, SECTION, { landed: 2 });
    expect(result.reason).toBe("");
    expect(result.changed).toBe(true);
    expect(result.body).not.toContain("assets/abcd");
    expect(occurrences(result.body, "Closes #3")).toBe(1);
  });

  test("an indented Screenshots heading is refused, never replaced through", () => {
    // `ATX_HEADING` admits three spaces, which is also how a heading nested in
    // a list item looks to a flat scanner. Everywhere else that blindness
    // refuses; here it deleted the sibling bullets the replace ran through.
    const nested = [
      "- setup",
      "",
      "  ## Screenshots",
      "",
      "  - [ ] sibling bullet",
      "",
      "Closes #8",
      "",
    ].join("\n");

    const result = splice(nested, SECTION, { landed: 2 });
    expect(result.changed).toBe(false);
    expect(result.body).toBe(nested);
    expect(result.reason).toContain("line 3");
    expect(bodyRefusal(nested)).toBe(result.reason);

    // Control: at column zero it is a document heading and the replace runs.
    const flat = nested
      .replace("  ## Screenshots", "## Screenshots")
      .replace("  - [ ] sibling bullet", "**Old** — captured, not yet uploaded: old.png");
    expect(splice(flat, SECTION, { landed: 2 }).changed).toBe(true);
  });

  test("every unmodeled construct refuses, and nothing it carries is deleted", () => {
    const failures = UNMODELED.filter(({ body }) => {
      const result = splice(body, SECTION, { landed: 2 });
      return result.changed || result.body !== body || result.reason.length === 0;
    }).map(({ label }) => label);
    expect(failures).toEqual([]);

    // And the text each one used to lose is still there, byte for byte.
    const lost = UNMODELED.filter(({ body, survives }) => !splice(body, SECTION, { landed: 2 }).body.includes(survives)).map(
      ({ label }) => label,
    );
    expect(lost).toEqual([]);
  });

  test("the model still writes through the shapes it does cover", () => {
    // Blindness guard: a fault regex wide enough to refuse everything would
    // satisfy the test above and check nothing.
    const writes = [
      "## Summary\n\nA plain body.\n\n## Test plan\n\n- a\n",
      "## Summary\n\nSee <https://example.com> for context.\n\n## Test plan\n",
      "## Summary\n\nA link: [the docs](https://example.com/docs)\n\n## Test plan\n",
      "## Summary\n\n```html\n<div>fenced, so not a block</div>\n```\n\n## Test plan\n",
      "<!--\n<div>commented out</div>\n-->\n\n## Summary\n\nhi\n",
    ];
    const refused = writes.filter((body) => !splice(body, SECTION, { landed: 2 }).changed);
    expect(refused).toEqual([]);
  });

  test("bodyRefusal names the same refusal the splice does, from the body alone", () => {
    // The two-mode contract: what step A's `--check` reports and what step D's
    // splice reports are one function, so a pre-image the check cleared cannot
    // refuse later for a body-only reason.
    const mismatched = UNMODELED.filter(({ body }) => bodyRefusal(body) !== splice(body, SECTION, { landed: 2 }).reason).map(
      ({ label }) => label,
    );
    expect(mismatched).toEqual([]);

    // The two refusals over the EXISTING section are computable from the body
    // alone too, so they belong to the check and not only to the splice.
    const foreign = [
      "## Screenshots",
      "",
      "**Hand-authored**",
      "![diagram](https://example.com/d.png)",
      "",
      "## Test plan",
      "",
    ].join("\n");
    const commented = ["## Screenshots", "", "<!-- keep this -->", "old", "", "## Test plan", ""].join("\n");
    const ambiguous = ["## Screenshots", "", "a", "", "## Screenshots", "", "b", "", "## Test plan", ""].join("\n");
    for (const body of [foreign, commented, ambiguous]) {
      expect(bodyRefusal(body).length).toBeGreaterThan(0);
      expect(bodyRefusal(body)).toBe(splice(body, SECTION, { landed: 2 }).reason);
    }

    // A body the splice writes has no pre-image refusal at all.
    expect(bodyRefusal("## Summary\n\nhi\n\n## Test plan\n")).toBe("");
  });

  test("raw HTML in the SECTION is refused, and an escaped angle bracket is not", () => {
    // The code-side backstop for the caller-string escaping: a weakened
    // normalization must not splice an `<a href>` or an `<img src>` into a
    // public body.
    const body = "## Summary\n\nhi\n\n## Test plan\n";
    const html = [
      "## Screenshots",
      "",
      '**<a href="https://evil.example">Login</a>**',
      "![screenshot-01](https://example.com/user-attachments/assets/1111)",
    ].join("\n");
    const refused = splice(body, html, { landed: 1 });
    expect(refused.changed).toBe(false);
    expect(refused.body).toBe(body);
    expect(refused.reason.length).toBeGreaterThan(0);

    // Escaped by the normalization, it is caller text that renders literally.
    const escaped = [
      "## Screenshots",
      "",
      "**\\<a href\\>Login\\</a\\>**",
      "![screenshot-01](https://example.com/user-attachments/assets/1111)",
    ].join("\n");
    expect(splice(body, escaped, { landed: 1 }).changed).toBe(true);
  });

  test("a foreign markdown image in the SECTION is refused", () => {
    // `SECTION_HTML` catches an `<a>` or an `<img>`; `NEW_SECTION_IMAGE`
    // catches extra `![screenshot-NN]` references past `--landed`. Neither saw
    // an inline markdown image under a DIFFERENT alt, so a section carrying
    // `![tracker](https://evil.example/pixel.png)` spliced with exit 0 — a
    // remote-fetch beacon in a public body.
    const body = "## Summary\n\nhi\n\n## Test plan\n";
    const beacon = [
      "## Screenshots",
      "",
      "**Login** (default)",
      "![screenshot-01](https://example.com/user-attachments/assets/1111)",
      "",
      "![tracker](https://evil.example/pixel.png)",
    ].join("\n");

    const result = splice(body, beacon, { landed: 1 });
    expect(result.changed).toBe(false);
    expect(result.body).toBe(body);
    expect(result.reason).toContain("![tracker](https://evil.example/pixel.png)");

    // A note line carrying one is the same refusal, whatever the count says.
    const inNote = ["## Screenshots", "", "> see ![beacon](https://evil.example/p.png)"].join("\n");
    expect(splice(body, inNote, { landed: 0 }).changed).toBe(false);

    // Control: the skill's own alt still writes.
    expect(splice(body, SECTION, { landed: 2 }).changed).toBe(true);
  });

  test("an escaped backslash before a tag does not buy raw HTML past the backstop", () => {
    // `(?<!\\)` read ANY preceding backslash as an escape, but in CommonMark
    // `\\` is an escaped BACKSLASH and the `<` after it is live markup: GitHub's
    // own `POST /markdown` renders `\\<img …>` as a real, camo-proxied `<img>`
    // carrying the attacker's `data-canonical-src`. A void tag has no closing
    // tag, so nothing else in the pattern set caught it.
    const body = "## Summary\n\nhi\n\n## Test plan\n";
    const beacon = '\\\\<img src="https://evil.example/beacon.png">';

    const smuggled = ["## Screenshots", "", `**Login** (default)`, `> _note:_ ${beacon}`].join("\n");
    const refused = splice(body, smuggled, { landed: 0 });
    expect(refused.changed).toBe(false);
    expect(refused.body).toBe(body);
    expect(refused.reason.length).toBeGreaterThan(0);

    // The same blindness in the body scan: an even run of backslashes escapes
    // nothing, so the tag is unmodeled and the body refuses.
    expect(bodyRefusal(`## Summary\n\n${beacon}\n`).length).toBeGreaterThan(0);
    expect(bodyRefusal('## Summary\n\n\\\\<a href="https://evil.example">x\n').length).toBeGreaterThan(0);

    // Parity, not a ban on backslashes: an ODD run still escapes, so caller
    // text the normalization escaped renders literally and still writes.
    expect(bodyRefusal('## Summary\n\na \\< b\n')).toBe("");
    expect(bodyRefusal('## Summary\n\n\\\\\\<img src=x\\>\n')).toBe("");
  });

  test("a caption is owned by its whole grammar, not by its first two asterisks", () => {
    // `(?:\s.*)?$` accepted arbitrary trailing text after the bold run, so a
    // reviewer's warning typed above this skill's own image was deleted with
    // exit 0 and no reason on the next refresh.
    const withNote = [
      "## Summary",
      "",
      "hi",
      "",
      "## Screenshots",
      "",
      "**Login** REVIEWER: this shot is WRONG, do not merge",
      "![screenshot-01](https://example.com/user-attachments/assets/9999)",
      "",
    ].join("\n");
    expect(bodyRefusal(withNote)).toContain("REVIEWER: this shot is WRONG");
    expect(splice(withNote, SECTION, { landed: 2 }).changed).toBe(false);

    // `Not uploaded:` was shape rather than provenance for the same reason.
    const withFailureNote = withNote.replace(
      "**Login** REVIEWER: this shot is WRONG, do not merge",
      "Not uploaded: THIS IS A REVIEWER NOTE, do not ship",
    );
    expect(bodyRefusal(withFailureNote)).toContain("THIS IS A REVIEWER NOTE");

    // Control: the shapes the renderer actually emits are still its own.
    const own = [
      "## Summary",
      "",
      "hi",
      "",
      "## Screenshots",
      "",
      "**Login** (default)",
      "![screenshot-01](https://example.com/user-attachments/assets/9999)",
      "",
      "Not uploaded: login-error — file missing",
      "",
    ].join("\n");
    expect(bodyRefusal(own)).toBe("");
    expect(splice(own, SECTION, { landed: 2 }).changed).toBe(true);
  });

  test("a parenthesised state is still the renderer's own output", () => {
    // `team-pr` writes the degraded section at PR-open time, so that section IS
    // the pre-image of the upload run. A state such as `mobile (dark)` — caller
    // text the normalization does not escape parentheses in — made the flat
    // `\([^)]*\)` unable to match the renderer's OWN line, so step A's `--check`
    // refused the whole run and nothing uploaded.
    const degraded = [
      "## Summary",
      "",
      "hi",
      "",
      "## Screenshots",
      "",
      "**Login** (mobile (dark)) — captured, not yet uploaded: login.png",
      "",
    ].join("\n");
    expect(bodyRefusal(degraded)).toBe("");
    expect(splice(degraded, SECTION, { landed: 2 }).changed).toBe(true);

    // The resolved form of the same state, above this skill's own image.
    const resolved = degraded.replace(
      "**Login** (mobile (dark)) — captured, not yet uploaded: login.png",
      "**Login** (mobile (dark))\n![screenshot-01](https://example.com/user-attachments/assets/1)",
    );
    expect(bodyRefusal(resolved)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// L1: a property sweep over splice(), because two review rounds found their
// defects by trying a shape nobody had listed.
//
// Bodies are assembled from tagged blocks of the constructs the transform
// models. Every block outside the Screenshots section is PROTECTED: it must
// come back verbatim, exactly once. The write must also settle — a second
// splice of the same section changes nothing — because a transform that keeps
// reporting `changed` reads as a fresh upload forever.
// ---------------------------------------------------------------------------

// Deterministic PRNG: a fixed seed, so a failure is reproducible and CI never
// goes flaky on a lucky draw.
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The modeled constructs, as block templates. `<N>` is replaced by the block's
// index, which makes every block's text unique and countable.
//
// A BOUNDARY block opens a section of its own, so it and everything below it
// sit outside the Screenshots section whatever precedes them. A FREE block
// does not, so one placed directly under the section belongs TO the section
// and a replace legitimately takes it — which is why the generator always puts
// a boundary block first after the section.
const BOUNDARY_BLOCKS = [
  "## Heading <N>\n\nBody text for block <N>.",
  "  ## Indented heading <N>\n\n- [ ] item <N>",
  "Setext heading <N>\n---------------------\n\n- [ ] item <N>",
  "Setext title <N>\n=====================\n\n- [ ] item <N>",
  "## Fenced <N>\n\n```js\nconst x = <N>; // ## not a heading\n```",
  "## Nested fence <N>\n\n````DATA\n```\nrow <N>\n```\n````",
  "## Foreign image <N>\n\n**Diagram**\n![diagram <N>](https://example.com/d<N>.png)",
  "Closes #<N>",
  "## Pre-merge\n\n- [ ] check <N>",
  "## How to Verify\n\n- run it (<N>)",
];

const FREE_BLOCKS = [
  "Plain prose for block <N>.",
  "### Sub-heading <N>\n\nBody text for block <N>.",
  "<!--\n## Screenshots\ncommented placeholder <N>\n-->",
];

// The second pool: constructs deliberately OUTSIDE the model. The two pools
// above are assembled from shapes already known to work, so by construction a
// sweep over them cannot discover an unmodeled construct — which is how a raw
// HTML container and four non-inline image forms went unnoticed. A body
// carrying any of these must produce `changed: false`, wherever it sits.
const OUT_OF_MODEL_BLOCKS = [
  '<div align="center">\n\n## Heading <N>\n\ntext <N>\n\n</div>',
  "<table>\n<tr><td>\n\nrow <N>\n\n</td></tr>\n</table>",
  "<details>\n<summary>Details <N></summary>\n\ntext <N>\n\n</details>",
  '<picture>\n<source srcset="https://example.com/s<N>.webp">\n<img src="https://example.com/s<N>.png">\n</picture>',
  'A diagram <N>: <img src="https://example.com/s<N>.png" width="600">',
  // The other axis: the same tag space, off column zero. The pool above is
  // every template at line start plus one mid-line `<img>`, which passed only
  // because `img` was in the one unanchored alternation — so no draw ever
  // combined "non-image tag" with "does not begin a line".
  "- <details>hi <N></details>",
  "Demo <N>: <details>hi</details>",
  '- <video src="https://github.com/user-attachments/assets/v<N>"></video>',
  'Watch <N>: <video src="https://github.com/user-attachments/assets/v<N>"></video>',
  '- <a href="https://example.com/<N>">link</a>',
  "Row <N>: <table><tr><td>x</td></tr></table>",
  "- <div>hi <N></div>",
  '<iframe src="https://example.com/<N>"></iframe>',
  "![alt <N>][ref<N>]",
  "[ref<N>]: https://example.com/s<N>.png",
  "https://github.com/user-attachments/assets/bare<N>",
  "https://example.com/loose<N>.png",
];

describe("Slice 1 — splice.mjs property sweep (L1)", () => {
  test("every block outside the section survives, and the write settles", () => {
    const random = mulberry32(0x5eed);
    const pick = <T,>(list: T[]): T => list[Math.floor(random() * list.length)] as T;
    let wrote = 0;

    for (let iteration = 0; iteration < 300; iteration++) {
      const blocks: string[] = [];
      const protectedText: string[] = [];
      let index = 0;

      const emit = (count: number, from: string[]) => {
        for (let n = 0; n < count; n++) {
          const text = pick(from).replace(/<N>/g, String(index++));
          blocks.push(text);
          protectedText.push(text);
        }
      };

      emit(Math.floor(random() * 3), [...BOUNDARY_BLOCKS, ...FREE_BLOCKS]);
      if (random() < 0.6) {
        blocks.push(
          [
            "## Screenshots",
            "",
            `**Old ${index++}**`,
            "![screenshot-01](https://example.com/user-attachments/assets/old)",
          ].join("\n"),
        );
      }
      emit(1, BOUNDARY_BLOCKS);
      emit(Math.floor(random() * 3), [...BOUNDARY_BLOCKS, ...FREE_BLOCKS]);

      const body = blocks.join("\n\n") + (random() < 0.5 ? "\n" : "");
      const result = splice(body, SECTION, { landed: 2 });

      // A refusal is always safe; it must leave the body byte-identical and
      // say why. Only a WRITE carries the survival obligation.
      if (!result.changed) {
        expect(result.body).toBe(body);
        expect(result.reason.length).toBeGreaterThan(0);
        continue;
      }

      wrote++;
      const missing = protectedText.filter((text) => occurrences(result.body, text) !== 1);
      expect({ iteration, missing }).toEqual({ iteration, missing: [] });
      expect(occurrences(result.body, "assets/1111")).toBe(1);
      expect(occurrences(result.body, "assets/old")).toBe(0);

      // Settled: the same section over the written body changes nothing.
      const again = splice(result.body, SECTION, { landed: 2 });
      expect({ iteration, changed: again.changed }).toEqual({ iteration, changed: false });
      expect(again.body).toBe(result.body);
    }

    // Blindness guard: a change that turned every generated body into a
    // refusal would satisfy every assertion above and check nothing.
    expect(wrote).toBe(300);
  });

  test("a body carrying one out-of-model block is always refused", () => {
    // The same generator, with exactly one out-of-model block spliced in at a
    // random position. Every draw must refuse and leave the body identical:
    // silent loss is what a body-wide fault buys, and the price is a manual
    // edit on a body that was going to be edited by hand anyway.
    const random = mulberry32(0xd15ea5e);
    const pick = <T,>(list: T[]): T => list[Math.floor(random() * list.length)] as T;
    let index = 0;
    const failures: { iteration: number; changed: boolean; mutated: boolean; reason: string }[] = [];

    for (let iteration = 0; iteration < 400; iteration++) {
      const blocks = [
        ...Array.from({ length: Math.floor(random() * 3) }, () => pick([...BOUNDARY_BLOCKS, ...FREE_BLOCKS])),
        ...(random() < 0.6 ? ["## Screenshots\n\n**Old**\n![screenshot-01](https://example.com/user-attachments/assets/old)"] : []),
        pick(BOUNDARY_BLOCKS),
        ...Array.from({ length: Math.floor(random() * 3) }, () => pick([...BOUNDARY_BLOCKS, ...FREE_BLOCKS])),
      ];
      blocks.splice(Math.floor(random() * (blocks.length + 1)), 0, pick(OUT_OF_MODEL_BLOCKS));

      const body = blocks.map((text) => text.replace(/<N>/g, String(index++))).join("\n\n") + "\n";
      const result = splice(body, SECTION, { landed: 2 });
      if (result.changed || result.body !== body || result.reason.length === 0) {
        failures.push({ iteration, changed: result.changed, mutated: result.body !== body, reason: result.reason });
      }
    }

    expect(failures).toEqual([]);

    // Blindness guard: the pool must be the reason, not an empty loop.
    expect(OUT_OF_MODEL_BLOCKS.length).toBeGreaterThan(0);
    // And each pool member on its own is what refuses — one dead template
    // would otherwise hide behind the others in a random draw.
    const inert = OUT_OF_MODEL_BLOCKS.filter(
      (template) => splice(`## Summary\n\nhi\n\n${template.replace(/<N>/g, "9")}\n\n## Test plan\n`, SECTION, { landed: 2 }).changed,
    );
    expect(inert).toEqual([]);
  });

  test("the sweep can fail: a body whose protected block is deleted is caught", () => {
    // The invariant above is only worth its runtime if it can go red. A
    // section replace over a body with no boundary between the section and
    // the block below it deletes that block — and the occurrence check sees
    // it. The swallowed block has to be a shape this skill's own renderer
    // emits, because anything else in that range is now a refusal rather than
    // a deletion.
    const swallowed = [
      "## Screenshots",
      "",
      "**Old** (default)",
      "![screenshot-01](https://example.com/a/0)",
      "",
      "**a caption that no boundary protects** — captured, not yet uploaded: old.png",
      "",
    ].join("\n");
    const result = splice(swallowed, SECTION, { landed: 2 });

    expect(result.changed).toBe(true);
    expect(occurrences(result.body, "**a caption that no boundary protects**")).toBe(0);
    expect(occurrences(result.body, "captured, not yet uploaded: old.png")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// L1: the CLI's exit-code and flag contract.
// ---------------------------------------------------------------------------

describe("Slice 1 — splice.mjs CLI exit codes (L1)", () => {
  const scratch = mkdtempSync(join(tmpdir(), "pr-screenshots-"));
  const bodyFile = join(scratch, "body.md");
  const sectionFile = join(scratch, "section.md");
  writeFileSync(bodyFile, "## Summary\n\nhi\n\nCloses #1\n", "utf8");
  writeFileSync(sectionFile, SECTION + "\n", "utf8");

  const run = (args: string[]) =>
    spawnSync(process.execPath, [SPLICE, ...args], { encoding: "utf8" });

  // The scratch directory is this describe's own, so it leaves with it.
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  test("exit 0 writes the body, exit 1 refuses, exit 2 is a fault", () => {
    expect(existsSync(SPLICE)).toBe(true);

    const ok = run(["--body-file", bodyFile, "--section-file", sectionFile, "--landed", "2"]);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain("## Screenshots");

    // A refusal: exit 1, the documented `unchanged: <reason>` on stderr.
    const empty = join(scratch, "empty.md");
    writeFileSync(empty, "", "utf8");
    const refused = run(["--body-file", bodyFile, "--section-file", empty, "--landed", "0"]);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain("unchanged: ");

    // A missing input is an ENVIRONMENT fault, not a refusal. On exit 1 a
    // caller cannot tell "no rule allowed the write" from "your temp path was
    // wrong", and a raw Node stack trace tells them neither.
    const missing = run(["--body-file", join(scratch, "absent.md"), "--section-file", sectionFile, "--landed", "2"]);
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain("splice.mjs: ");
    expect(missing.stderr).not.toContain("unchanged: ");
    expect(missing.stderr).not.toContain("at Object.");
    expect(missing.stderr).not.toContain("node:internal");
  });

  test("--landed refuses a section naming more references than the run landed", () => {
    const refused = run(["--body-file", bodyFile, "--section-file", sectionFile, "--landed", "1"]);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain("unchanged: ");

    const allowed = run(["--body-file", bodyFile, "--section-file", sectionFile, "--landed", "2"]);
    expect(allowed.status).toBe(0);

    // A non-numeric count is a usage fault, not a silently ignored flag.
    const bad = run(["--body-file", bodyFile, "--section-file", sectionFile, "--landed", "x"]);
    expect(bad.status).toBe(2);
    expect(bad.stderr).toContain("splice.mjs: ");
  });

  test("--check runs the pre-image refusals with no section and no write", () => {
    // Step A has to be able to run these BEFORE the first attach, or a refusal
    // arrives after `gh pr edit --attach` has already uploaded every entry to
    // a PR that may be merged.
    const clean = run(["--check", "--body-file", bodyFile]);
    expect(clean.status).toBe(0);
    expect(clean.stdout).toBe("");

    const foreign = join(scratch, "foreign.md");
    writeFileSync(foreign, "## Screenshots\n\n![diagram](https://example.com/d.png)\n\n## Test plan\n", "utf8");
    const refused = run(["--check", "--body-file", foreign]);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain("refused: ");
    // The same body refuses the write, so the check cannot pass what the
    // splice would reject.
    expect(run(["--body-file", foreign, "--section-file", sectionFile, "--landed", "2"]).status).toBe(1);

    const unmodeled = join(scratch, "unmodeled.md");
    writeFileSync(unmodeled, '<div align="center">\n## Screenshots\n</div>\n\n## Test plan\n', "utf8");
    expect(run(["--check", "--body-file", unmodeled]).status).toBe(1);

    // An unreadable body is still a fault, and the mode still needs its input.
    expect(run(["--check", "--body-file", join(scratch, "absent.md")]).status).toBe(2);
    expect(run(["--check"]).status).toBe(2);
  });

  test("--landed is required, and a flag cannot swallow the next flag as its value", () => {
    // The guard `--landed` feeds exists for the case where the caller-string
    // escaping upstream has been weakened, so a caller must not be able to
    // switch it off by omitting the flag.
    const absent = run(["--body-file", bodyFile, "--section-file", sectionFile]);
    expect(absent.status).toBe(2);
    expect(absent.stderr).toContain("splice.mjs: ");
    expect(absent.stderr).toContain("--landed");

    // `--body-file --landed 2` bound `bodyFile` to the string "--landed",
    // which reads a file by that name and reports the miss as a body fault.
    const swallowed = run(["--body-file", "--landed", "2", "--section-file", sectionFile]);
    expect(swallowed.status).toBe(2);
    expect(swallowed.stderr).toContain("splice.mjs: ");
    expect(swallowed.stderr).not.toContain('at "--landed"');
  });
});

// ---------------------------------------------------------------------------
// L1: the argument validator, RUN. The fence is a complete shell program over
// `$ARGUMENTS`, so the contract "the advertised invocation is accepted" is a
// deterministic execution rather than a substring check — and a substring check
// is exactly what let a validator that refuses the primary pipeline path ship.
// ---------------------------------------------------------------------------

// Everything the reference emits before the PR is resolved: the split, then
// the validation of the token it produced. Both fences, because the split is
// the half whose absence made the validator refuse the advertised call.
function argumentFence(): string {
  const blocks = fencedBlocks(inputRef());
  const validator = blocks.findIndex((block) => block.includes("PR_URL_PATTERN"));
  return validator < 0 ? "" : blocks.slice(0, validator + 1).join("\n");
}

// Run that fence with `$ARGUMENTS` bound to `args`, and report what it bound.
function runArguments(args: string): { status: number; stderr: string; bindings: string[] } {
  const script = [
    `ARGUMENTS=${JSON.stringify(args)}`,
    argumentFence(),
    `printf '%s|%s|%s|%s\\n' "$ARG_NUMBER" "$ARG_HOST" "$ARG_OWNER" "$ENTRIES_FILE"`,
  ].join("\n");
  const result = spawnSync("bash", ["-c", script], { encoding: "utf8" });
  return {
    status: result.status ?? -1,
    stderr: result.stderr ?? "",
    bindings: (result.stdout ?? "").trim().split("|"),
  };
}

describe("Slice 1 — the argument validator, executed (L1)", () => {
  test("the advertised invocation is accepted, PR token and --entries alike", () => {
    expect(argumentFence().length).toBeGreaterThan(0);

    // `SKILL.md`'s own `argument-hint`, and the call `team-pr` makes. Validated
    // as ONE token this took the `*[!0-9]*` arm, failed the anchored URL
    // pattern, and exited 1 — the primary pipeline path refusing before it
    // started.
    const bare = runArguments("412 --entries /tmp/e/entries.json");
    expect({ status: bare.status, stderr: bare.stderr }).toEqual({ status: 0, stderr: "" });
    expect(bare.bindings).toEqual(["412", "", "", "/tmp/e/entries.json"]);

    // The URL form of the same invocation, in either flag spelling.
    const url = runArguments("https://github.com/owner/repo/pull/412 --entries /tmp/e/entries.json");
    expect(url.status).toBe(0);
    expect(url.bindings).toEqual(["412", "github.com", "owner", "/tmp/e/entries.json"]);
    expect(runArguments("412 --entries=/tmp/e.json").bindings[3]).toBe("/tmp/e.json");

    // A PR token alone still resolves, and an Enterprise host survives.
    expect(runArguments("412").bindings).toEqual(["412", "", "", ""]);
    expect(runArguments("https://ghe.example.com/owner/repo/pull/9").bindings).toEqual([
      "9",
      "ghe.example.com",
      "owner",
      "",
    ]);
  });

  test("a malformed argument refuses, and refuses loudly", () => {
    expect(argumentFence().length).toBeGreaterThan(0);

    const malformed = runArguments("not-a-pr");
    expect(malformed.status).toBe(1);
    expect(malformed.stderr).toContain("malformed PR argument");

    // A path holding whitespace arrives as two words: a named refusal, never a
    // silently truncated path.
    const split = runArguments("412 --entries /tmp/my dir/e.json");
    expect(split.status).toBe(1);
    expect(split.stderr).toContain("more than one PR argument");

    // A flag with no value, and a flag this skill does not take.
    expect(runArguments("412 --entries").status).toBe(1);
    expect(runArguments("412 --body-file /tmp/x").status).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// L2: the prose contracts that carry a security or correctness property.
// ---------------------------------------------------------------------------

// A splice invocation that redirects straight onto the final body file. Exit 1
// prints nothing on stdout, and `>` truncates BEFORE the command runs, so this
// form leaves a zero-byte file for the next command to hand
// `gh pr edit --body-file`.
const UNGUARDED_REDIRECT = /splice\.mjs[\s\S]{0,200}?>\s*"\$NEW_BODY_FILE"\s*$/m;

describe("Slice 1 — resolution, normalization, and harvest (L2)", () => {
  test("the first resolution call carries the URL's own repository", () => {
    // For a URL argument the parser binds owner, repo, and number
    // separately, and `gh pr view <number>` with no `--repo` resolves against
    // the CURRENT DIRECTORY's default repository — so a full URL for repo A,
    // run from a checkout of repo B, silently resolves B's PR of the same
    // number and every later call inherits it.
    const input = inputRef();
    expect(input.length).toBeGreaterThan(0);

    const resolve = input.indexOf("--json url --jq .url");
    expect(resolve).toBeGreaterThanOrEqual(0);
    // The resolution command itself binds the repository, not a later call.
    const line = input.slice(input.lastIndexOf("\n", resolve) + 1, resolve);
    expect(line).toContain("--repo");
    expect(line).toContain("$ARG_OWNER");
  });

  test("normalization is stated over every caller string, not per field", () => {
    // Captions were escaped because a caption is caller text; the
    // `notes` list, the path, and the failure reason are equally caller text
    // and rendered verbatim. The rule is over the class.
    const input = inputRef();
    expect(input.length).toBeGreaterThan(0);

    // The escape set, each character pinned as the token it is.
    for (const token of ["`\\`", "`!`", "`[`", "`]`", "`<`", "`>`"]) {
      expect(input).toContain(token);
    }
    // The members, by field name, each pinned as a row of the members table —
    // a bare word would be satisfied by any prose mentioning it. `state` is on
    // the list because it renders as the `(<state>)` parenthetical: an
    // unnormalized one carrying a newline splices a line of the caller's
    // choosing into a public body under this skill's own heading.
    const members = withoutFences(input)
      .split("\n")
      .filter((line) => line.startsWith("|"))
      .join("\n");
    expect(members.length).toBeGreaterThan(0);
    for (const field of ["`caption`", "`state`", "`notes`", "`path`", "`reason`"]) {
      expect(members).toContain(field);
    }
    // Newlines are stripped, so a note cannot smuggle `Closes #999` onto its
    // own line and close an unrelated issue when the PR merges.
    expect(/strip newlines/i.test(squash(input))).toBe(true);
  });

  test("a PR body renders a basename, never an absolute path", () => {
    // The public-body half of the same finding: the absolute path is operator
    // data and stays in result.json; the body gets the basename.
    const upload = uploadRef();
    expect(upload.length).toBeGreaterThan(0);
    expect(upload).toContain("<basename>");

    const templates = sectionTemplates();
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.filter((template) => template.includes("<local path>"))).toEqual([]);
    // A failure reason written into the body carries no filesystem path.
    expect(squash(upload)).toContain("never a filesystem path");
  });

  test("path validation refuses a symlink and requires containment", () => {
    // A shell `-f` FOLLOWS symlinks, so the set that called itself exhaustive
    // accepted an entry naming a link to `~/.ssh/id_ed25519` and uploaded it
    // to a live user-attachments URL (skills/principle-never-interpolate).
    const upload = uploadRef();
    expect(upload.length).toBeGreaterThan(0);
    expect(squash(upload)).toContain("symbolic link");
    expect(upload).toContain("-L ");
    expect(squash(upload)).toContain("contained");
    expect(upload).toContain("principle-never-interpolate");
  });

  test("the harvest is constrained to the attachment origin", () => {
    // "Whatever absolute URL appears" lets a party with write access append
    // their own URL during the attach window and have it harvested, embedded,
    // and copied verbatim into every companion PR.
    const upload = uploadRef();
    expect(upload.length).toBeGreaterThan(0);
    expect(upload).toContain("user-attachments/assets/");
    const flat = squash(upload);
    expect(flat).toContain("attachment origin");
    // More than one candidate is a failure for that entry, never a guess.
    expect(flat).toContain("more than one");
    // The old unconstrained instruction is gone.
    expect(flat).not.toContain("whatever absolute URL");
  });

  test("the read-back body is labelled untrusted", () => {
    // Matching skills/pr-watch-as-reviewer/references/02-input.md, lines 4-6:
    // anyone with write access authored it, so it is data, never instruction.
    const upload = uploadRef();
    expect(upload.length).toBeGreaterThan(0);
    expect(upload).toContain("principle-untrusted-input-is-data");
    expect(squash(upload)).toContain("untrusted");
  });

  test("the splice recipe guards its own redirect", () => {
    // `> "$NEW_BODY_FILE"` truncates before the command runs, so a refusal
    // leaves a zero-byte file that the next fenced command feeds to
    // `gh pr edit --body-file` — blanking the PR body.
    const upload = uploadRef();
    expect(upload.length).toBeGreaterThan(0);
    expect(UNGUARDED_REDIRECT.test(upload)).toBe(false);
    // The detector fires on a planted positive.
    expect(
      UNGUARDED_REDIRECT.test('node "x/splice.mjs" --body-file "$A" > "$NEW_BODY_FILE"'),
    ).toBe(true);
  });

  test("the exit-code table separates a refusal from a fault", () => {
    // Exit 1 is `unchanged: <reason>`; a usage or environment fault
    // is exit 2 with its own prefix, so a caller can tell them apart.
    const upload = uploadRef();
    expect(upload.length).toBeGreaterThan(0);
    expect(upload).toContain("unchanged: <reason>");
    expect(upload).toContain("splice.mjs: <message>");
    expect(upload).toContain("--landed");
    // Both codes are named, and the fault code is the later one.
    expect(upload.indexOf("| 1 |")).toBeGreaterThanOrEqual(0);
    expect(upload.indexOf("| 2 |")).toBeGreaterThan(upload.indexOf("| 1 |"));
  });

  test("the fallback render binds owner/repo as a jq argument", () => {
    // A repository name spliced into a jq PROGRAM STRING is source, not data.
    const verify = verifyRef();
    expect(verify.length).toBeGreaterThan(0);
    expect(verify).toContain("--arg ");
    expect(verify).toContain("principle-never-interpolate");
    // No closing-quote dance inside a fenced command.
    const commands = fencedBlocks(verify).join("\n");
    expect(commands.length).toBeGreaterThan(0);
    expect(commands).not.toContain(`"'"$OWNER/$REPO"'"`);
  });
});

// ---------------------------------------------------------------------------
// L2: containment, the attachment allowlist, and the operator's account of a
// failure. Each of these is a security or usability property that lives in
// prose because the model executes the prose.
// ---------------------------------------------------------------------------

// Offender detector: an allowed-URL shape whose host is a free variable. The
// harvest cannot admit `https://<host>/…/user-attachments/…` with `<host>`
// unbound — `https://attacker.example/x/user-attachments/y.png` fits it.
const UNBOUND_HOST = /https:\/\/<host>\/[^\n`]*user-attachments/;
// Offender detector: the read-back declining to assert where an asset came from.
const HOST_NOT_ASSERTED = /host is (?:deliberately )?not asserted/i;

// The fenced block that carries the path-validation recipe, or "" when absent.
function validationFence(): string {
  return fencedBlocks(uploadRef()).find((block) => block.includes("CAPTURE_ROOT")) ?? "";
}

// Step C's harvest fence: the candidate loop and the statement that records
// the entry's outcome.
function harvestFence(): string {
  return fencedBlocks(uploadRef()).find((block) => block.includes('done < "$CANDIDATES_FILE"')) ?? "";
}

// Offender detector: a terminal recorder with ONE arm, which writes a line for
// an entry that landed a URL and nothing at all for an entry that did not.
const UNRECORDED_ENTRY = /\[ -z "\$ASSET_URL" \][ \t]*\|\|[ \t]*printf/;

describe("Slice 1 — containment, allowlist, and failure classes (L2)", () => {
  test("containment is checked against a root the entries file declares", () => {
    // The images a caller names live where the caller already keeps them — a
    // Desktop, a Downloads directory, `$ARGUMENTS/screenshots/`. A root taken
    // from the directory the entries JSON was written to fails every real
    // entry and lands the run on `degraded` with nothing uploaded.
    const input = inputRef();
    expect(input.length).toBeGreaterThan(0);
    expect(input).toContain('"root"');
    expect(squash(input)).toContain("required and absolute");

    // The refusal exists, so an absent root cannot silently skip the check.
    const units = refusalUnits(input);
    expect(units.filter((unit) => /`root`/.test(unit)).length).toBeGreaterThan(0);

    // team-pr, the one caller with a manifest, declares it too.
    const teamPr = fileOr(join(REPO_ROOT, "skills", "team-pr", "references", "04-screenshot-upload.md"));
    expect(teamPr.length).toBeGreaterThan(0);
    expect(teamPr).toContain("`root`");
    expect(teamPr).toContain("$ARGUMENTS/screenshots/");
  });

  test("the root is validated and used in one invocation, never expanded unguarded", () => {
    // `cd ""` succeeds as a no-op in bash, sh, and zsh, so an unbound value
    // rebinds the root to the working directory and `<repo>/.env` becomes
    // "contained".
    const fence = validationFence();
    expect(fence.length).toBeGreaterThan(0);
    expect(fence).toContain(': "${CAPTURE_ROOT:?');
    expect(fence).toContain('case "$CAPTURE_ROOT" in /*)');
    expect(fence).toContain('CAPTURE_ROOT="$(cd -- "$CAPTURE_ROOT" && pwd -P)"');
    // The unguarded predecessor is gone from every file the skill ships.
    expect(corpus()).not.toContain("CAPTURE_DIR");
  });

  test("every path check the prose enumerates is in the copyable block", () => {
    // The guard is the part a model copying one fenced block at a time would
    // otherwise drop, so the block has to carry the whole set.
    const fence = validationFence();
    expect(fence.length).toBeGreaterThan(0);
    const checks: [string, string][] = [
      ["newline", "$NEWLINE"],
      ["hash", '*"#"*'],
      ["absolute", "/*)"],
      ["exists", '[ -e "$ENTRY_PATH" ]'],
      ["symlink", '[ -L "$ENTRY_PATH" ]'],
      ["regular file", '[ -f "$ENTRY_PATH" ]'],
      ["resolved", "pwd -P"],
      ["containment", '"$CAPTURE_ROOT"/*'],
      ["image content", "--mime-type"],
    ];
    expect(checks.filter(([, token]) => !fence.includes(token)).map(([name]) => name)).toEqual([]);
  });

  test("an entry that fails a check carries a reason class of its own", () => {
    // `Not uploaded: <caption> — <reason>` is the whole account the operator
    // gets, so a check that falls through a bare `continue` reports nothing
    // actionable.
    const fence = validationFence();
    expect(fence.length).toBeGreaterThan(0);
    expect((fence.match(/REASON=/g) ?? []).length).toBeGreaterThanOrEqual(8);

    const upload = squash(uploadRef());
    for (const label of [
      "newline in path",
      "# in path",
      "relative path",
      "file missing",
      "symlink refused",
      "not a regular file",
      "outside the declared root",
      "not an image",
    ]) {
      expect(upload).toContain(label);
    }
  });

  test("the content check is what a hostile entries file cannot get past", () => {
    // A root declared by whoever wrote the entries file bounds a mistake, not
    // a chosen target. What keeps a private key off a world-readable URL is
    // that it is not an image, decided by content rather than by extension.
    const upload = squash(uploadRef());
    expect(upload.length).toBeGreaterThan(0);
    expect(upload).toContain("~/.ssh/id_ed25519");
    expect(upload).toContain(".env");
    expect(validationFence()).toContain("file -b --mime-type");
  });

  test("the harvest binds the attachment host to the resolved PR", () => {
    // `https://<host>/…/user-attachments/…` with `<host>` unbound admits
    // `https://attacker.example/x/user-attachments/y.png`, which a party with
    // write access can append during the attach window — and which a
    // multi-repo run then copies verbatim into every companion PR.
    const upload = uploadRef();
    expect(upload.length).toBeGreaterThan(0);
    expect(upload).toContain('PR_HOST="${PR_URL#https://}"');
    expect(upload).toContain("*.githubusercontent.com");
    expect(upload).toContain("PR_SCREENSHOTS_ASSET_HOST");
    // A host is a whole label, never a substring: userinfo is rejected.
    expect(upload).toContain("*[!A-Za-z0-9.-]*");

    expect(UNBOUND_HOST.test(upload)).toBe(false);
    // The detector fires on a planted positive.
    expect(UNBOUND_HOST.test("or its enterprise form, `https://<host>/…/user-attachments/…`")).toBe(true);
  });

  test("the read-back asserts the same allowlist the harvest used", () => {
    const verify = verifyRef();
    expect(verify.length).toBeGreaterThan(0);
    expect(verify).toContain("githubusercontent.com");
    expect(verify).toContain("PR_SCREENSHOTS_ASSET_HOST");

    expect(HOST_NOT_ASSERTED.test(squash(verify))).toBe(false);
    // The detector fires on a planted positive.
    expect(HOST_NOT_ASSERTED.test("The `src` host is deliberately not asserted, so a proxy rewrite passes.")).toBe(true);
  });

  test("verification labels its own input untrusted", () => {
    // This is the step that actively searches attacker-authored text for
    // tokens, so the rule belongs at the top of it, not only at the pre-image.
    const verify = verifyRef();
    expect(verify.length).toBeGreaterThan(0);
    expect(verify).toContain("principle-untrusted-input-is-data");
    expect(verify).toContain("body_html");
    expect(verify).toContain("/markdown");
  });

  test("--landed is a required flag, in the usage line and in the prose", () => {
    const source = spliceSource();
    expect(source.length).toBeGreaterThan(0);
    expect(source).toContain("--section-file <path> --landed <count>");
    expect(source).not.toContain("[--landed");

    expect(squash(uploadRef())).toContain("it is **required**");
  });

  test("the refusal for an incomplete entry names which entry", () => {
    const units = refusalUnits(inputRef());
    expect(units.length).toBeGreaterThan(0);
    const incomplete = units.filter((unit) => unit.includes("`path`") && unit.includes("`caption`"));
    expect(incomplete.length).toBeGreaterThan(0);
    expect(incomplete.filter((unit) => /index/i.test(unit)).length).toBeGreaterThan(0);
  });

  test("the appended attach tails are reported on the post-upload halt", () => {
    // `uploaded-not-written` leaves the tails in place and writes no body, so
    // what the PR renders right now is only in the operator's report.
    const input = squash(inputRef());
    expect(input.length).toBeGreaterThan(0);
    expect(/tail[^.]{0,160}operator_note/.test(input)).toBe(true);

    // And the claim that the tails carry no local path is gone: `gh` derives
    // that alt text and this skill does not pin it.
    expect(squash(uploadRef())).not.toContain("carry no local path");
  });

  test("the splice's refusal set and the manual path are written down", () => {
    // A refusal is the recovery path an operator has to be told about, so the
    // reference names what refuses and what to do next.
    const upload = squash(uploadRef());
    expect(upload.length).toBeGreaterThan(0);
    for (const shape of [
      "unterminated HTML comment",
      "opens mid-line",
      "indented into a code block",
      "two `## Screenshots` headings",
    ]) {
      expect(upload).toContain(shape);
    }
    expect(upload).toContain("byte-identical");
  });
});

// ---------------------------------------------------------------------------
// L2: the recipes, which are what a model copying one fenced block
// at a time actually runs, so the contracts here are about the BLOCK — what is
// in it, and what a shell does with it.
// ---------------------------------------------------------------------------

// A shell loop keyword, and the two statements that are only meaningful inside
// one. Outside a loop, bash warns on stderr and FALLS THROUGH to the next
// command (the block then exits 0), while zsh exits 1 — so the same block
// refuses or attaches depending on the shell.
const LOOP_KEYWORD = /(?:^|[\s;(])(?:for|while|until)\s/;
const LOOP_BRANCH = /(?:^|[\s;{(])(?:continue|break)(?:[\s;}]|$)/;

// A fenced block with its whole-line comments removed, so prose ABOUT
// `continue` is not mistaken for a `continue`.
function shellCode(block: string): string {
  return block
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
}

// Every fenced block the skill's own prose ships.
function skillBlocks(): string[] {
  return fencedBlocks([fileOr(SKILL), inputRef(), uploadRef(), verifyRef(), rejectedRef()].join("\n"));
}

// ---------------------------------------------------------------------------
// The recipe sweep: a variable the recipe expands that no fence binds, and a
// file the recipe reads that no fence writes. Both shapes are the same defect —
// state the recipe assumes and never produces — and both are swept rather than
// spot-checked, over every skill that ships a fence in this contract.
// ---------------------------------------------------------------------------

// Every markdown file under `dir`, recursively. A walk, not a fixed list: a
// new reference file must join the sweep by existing, not by being remembered.
function markdownUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith(".md")) out.push(path);
    }
  };
  visit(dir);
  return out;
}

// The fenced shell of one skill, in document order. Scoped PER SKILL: team-pr
// runs the companion half of this same contract, and a corpus spanning both
// would let a binding in `pr-screenshots` excuse a read in `team-pr` — which is
// how `$SECTION_FILE`, expanded in the companion loop and bound nowhere under
// `skills/team-pr/`, got through a sweep scoped to `skills/pr-screenshots/`.
const SHELL_CORPORA: { skill: string; ambient: string[] }[] = [
  // What the environment supplies, and `jq`'s own `$ARGS` builtin, which is
  // read inside a `jq -n` program and is not a shell variable at all.
  { skill: "pr-screenshots", ambient: ["ARGUMENTS", "PR_SCREENSHOTS_ASSET_HOST", "IFS", "ARGS"] },
  { skill: "team-pr", ambient: ["ARGUMENTS"] },
];

function corpusBlocks(skill: string): string[] {
  return markdownUnder(join(REPO_ROOT, "skills", skill)).flatMap((path) => fencedBlocks(read(path)));
}

// The names a corpus BINDS: an assignment, a `${VAR:-default}` form, a loop
// variable, or a `read -r` target.
function boundNames(code: string[]): Set<string> {
  const bound = new Set<string>();
  for (const block of code) {
    for (const match of block.matchAll(/\b([A-Z][A-Z0-9_]*)=/g)) bound.add(match[1] as string);
    for (const match of block.matchAll(/\$\{([A-Z][A-Z0-9_]*):[?=-]/g)) bound.add(match[1] as string);
    for (const match of block.matchAll(/\b(?:for|read -r)\s+([A-Z][A-Z0-9_]*)\b/g)) bound.add(match[1] as string);
  }
  return bound;
}

// The names a corpus READS.
function readNames(code: string[]): Set<string> {
  const names = new Set<string>();
  for (const block of code) {
    for (const match of block.matchAll(/\$\{?([A-Z][A-Z0-9_]*)\b/g)) names.add(match[1] as string);
  }
  return names;
}

// A variable consumed as a file to READ: `--body-file "$X"`, `--section-file
// "$X"`, or an input redirect `< "$X"`.
const FILE_READ = /--(?:body-file|section-file)[ \t]+"\$\{?([A-Z][A-Z0-9_]*)\}?"|(?:^|[^<])<[ \t]*"\$\{?([A-Z][A-Z0-9_]*)\}?"/gm;
// A fence WRITING that file: an output redirect, or a promotion onto it.
const FILE_WRITE = /(?:^|[^0-9<>&])>>?[ \t]*"\$\{?([A-Z][A-Z0-9_]*)\}?"|\b(?:mv|cp)\b[^\n]*[ \t]"\$\{?([A-Z][A-Z0-9_]*)\}?"[ \t]*$/gm;

function firstIndex(text: string, pattern: RegExp, name: string): number {
  for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
    if ((match[1] ?? match[2]) === name) return match.index ?? -1;
  }
  return -1;
}

// The file variables a corpus reads with no earlier fence writing them.
// Binding the PATH is not writing the FILE: `$PRE_IMAGE_FILE` was bound to a
// path in step A, handed to `--body-file`, and never written — so `--check`
// ran against an EMPTY body, where it passes vacuously, and the splice then
// discarded the PR's real description.
function unwrittenFiles(code: string[]): string[] {
  const joined = code.join("\n");
  const offenders = new Set<string>();
  for (const match of joined.matchAll(FILE_READ)) {
    const name = (match[1] ?? match[2]) as string;
    const written = firstIndex(joined, FILE_WRITE, name);
    if (written < 0 || written > (match.index ?? 0)) offenders.add(name);
  }
  return [...offenders].sort();
}

// Offender detector: an attachment path matched mid-path, which admits
// `https://github.com/attacker/repo/raw/main/user-attachments/evil.png` on the
// allowlisted host.
const MIDPATH_ATTACHMENT = /https:\/\/\*\/user-attachments\/\*\)/;
// Offender detector: the overstated claim that the content check bounds a
// hostile entries file, rather than bounding non-image files alone.
const CONTENT_CHECK_OVERSTATED = /content check is the one that survives a hostile entries file/i;

describe("Slice 1 — the copyable blocks (L2)", () => {
  test("no fenced block uses continue or break without a loop around it", () => {
    // The path-validation fence refused into a bare `continue` with no `for`,
    // `while`, or `until` anywhere in the block, so in bash every refusal fell
    // through and the block exited 0.
    const blocks = skillBlocks();
    expect(blocks.length).toBeGreaterThan(0);

    const orphans = blocks.filter((block) => {
      const code = shellCode(block);
      return LOOP_BRANCH.test(code) && !LOOP_KEYWORD.test(code);
    });
    expect(orphans).toEqual([]);

    // The detector fires on a planted positive — the exact shape that shipped.
    const planted = shellCode('case "$ENTRY_PATH" in\n  *"#"*) REASON="# in path" ; continue ;;\nesac\n');
    expect(LOOP_BRANCH.test(planted) && !LOOP_KEYWORD.test(planted)).toBe(true);
  });

  test("validation and the attach it gates are one block, one loop", () => {
    // `REASON` does not survive an invocation boundary, and neither does a
    // refusal: a model running the validation fence as one Bash call and the
    // attach fence as the next attaches the file the first call refused.
    const fence = validationFence();
    expect(fence.length).toBeGreaterThan(0);
    expect(LOOP_KEYWORD.test(shellCode(fence))).toBe(true);
    expect(fence).toContain("gh pr edit");
    expect(fence).toContain("--attach");

    // The attach takes the RESOLVED path — the one the symlink, containment,
    // and content checks ran against — and refuses to run at all when it is
    // unset or empty.
    expect(fence).toContain('--attach "${RESOLVED:?}"');
    const attaches = skillBlocks().filter((block) => block.includes("--attach"));
    expect(attaches.length).toBeGreaterThan(0);
    expect(attaches.filter((block) => block.includes('--attach "$ENTRY_PATH"'))).toEqual([]);
    expect(squash(uploadRef())).toContain("never `$ENTRY_PATH`");
  });

  test("the symlink test runs before the existence test", () => {
    // `[ -e ]` follows the link, so a dangling symlink tested first reports as
    // `file missing` and hides the attempt behind the wrong class.
    const fence = validationFence();
    expect(fence.length).toBeGreaterThan(0);
    const symlink = fence.indexOf('[ -L "$ENTRY_PATH" ]');
    const exists = fence.indexOf('[ -e "$ENTRY_PATH" ]');
    expect(symlink).toBeGreaterThanOrEqual(0);
    expect(exists).toBeGreaterThan(symlink);
  });

  test("the harvest anchors the attachment path at the host boundary", () => {
    // The host binding alone leaves the path a free variable, and a party with
    // write access to any repository on the allowlisted host controls
    // `/attacker/repo/raw/main/user-attachments/evil.png`.
    const upload = uploadRef();
    expect(upload.length).toBeGreaterThan(0);
    expect(upload).toContain("/user-attachments/assets/*)");
    expect(upload).toContain("CANDIDATE_PATH");
    expect(MIDPATH_ATTACHMENT.test(upload)).toBe(false);
    // The detector fires on a planted positive — the shape that shipped.
    expect(MIDPATH_ATTACHMENT.test('case "$CANDIDATE" in https://*/user-attachments/*) : ;; *) continue ;; esac')).toBe(true);

    // The read-back asserts the same rule, not just the host half.
    const verify = verifyRef();
    expect(verify.length).toBeGreaterThan(0);
    expect(verify).toContain("/user-attachments/assets/");
    expect(verify).toContain("githubusercontent.com");
  });

  test("the PR URL split is guarded and binds the host it resolved", () => {
    // `${PR_URL#https://github.com/}` is a no-op on an Enterprise URL, which
    // leaves `OWNER` as `https:` and `REPO` empty for every later `--repo`.
    const input = inputRef();
    expect(input.length).toBeGreaterThan(0);
    expect(input).not.toContain('REST="${PR_URL#https://github.com/}"');
    expect(input).toContain("https://*/*/*/pull/[0-9]*)");
    expect(input).toContain('PR_HOST="${REST%%/*}"');
    expect(input).toContain('case "$NUMBER" in ""|*[!0-9]*)');
  });
});

describe("Slice 1 — refuse before mutating (L2)", () => {
  test("step A runs every pre-image refusal before the first attach", () => {
    // Six refusals computable from the pre-image fired only in step D, after
    // `gh pr edit --attach` had run once per entry.
    const upload = uploadRef();
    expect(upload.length).toBeGreaterThan(0);
    expect(upload).toContain("--check --body-file");
    expect(upload).toContain("refused: <reason>");

    const check = upload.indexOf("--check --body-file");
    const attach = upload.indexOf('--attach "$');
    expect(check).toBeGreaterThanOrEqual(0);
    expect(attach).toBeGreaterThan(check);

    // The set that call covers is named where it runs, so the ones that stay
    // behind in step D are identifiable.
    const stepA = squash(upload.slice(0, attach));
    for (const shape of [
      "two `## Screenshots` headings",
      "raw HTML tag in any position",
      "reference-style image",
      "link reference definition",
      "unterminated HTML comment",
    ]) {
      expect(stepA).toContain(shape);
    }
  });

  test("a splice refusal after the attach step has a defined outcome", () => {
    // `refused` means nothing changed anywhere, so it cannot describe a run
    // whose assets are already live on an unauthenticated URL.
    const upload = squash(uploadRef());
    const input = squash(inputRef());
    expect(upload.length).toBeGreaterThan(0);
    expect(input.length).toBeGreaterThan(0);

    // The exit-1 row assigns both outcomes, by the one fact that separates
    // them: whether any asset landed.
    const exitOne = upload.slice(upload.indexOf("| 1 |"), upload.indexOf("| 2 |"));
    expect(exitOne.length).toBeGreaterThan(0);
    expect(exitOne).toContain("uploaded-not-written");
    expect(exitOne).toContain("refused");

    // And the enum's own row covers it, so the six values stay exhaustive.
    const enumTable = input.slice(input.indexOf("| `uploaded-not-written` |"));
    const row = enumTable.slice(0, enumTable.indexOf("| `refused` |"));
    expect(row.length).toBeGreaterThan(0);
    expect(row).toContain("splice refusal");
  });

  test("the refusal report names the manual edit that clears it", () => {
    // A reason with no next step leaves an operator holding a PR they cannot
    // fix, and an agent skimming only the table reports the bare reason.
    const upload = squash(uploadRef());
    expect(upload.length).toBeGreaterThan(0);
    expect(upload).toContain("re-run");
    expect(/move the hand-authored image/.test(upload)).toBe(true);
    expect(/delete the HTML comment inside it/.test(upload)).toBe(true);

    const exitOne = upload.slice(upload.indexOf("| 1 |"), upload.indexOf("| 2 |"));
    expect(exitOne).toContain("manual edit");
  });

  test("the content check claims only what a MIME sniff can bound", () => {
    // A four-byte decision does not bound a hostile entries file: with no
    // trustworthy root, any image anywhere is still uploadable.
    const upload = squash(uploadRef());
    expect(upload.length).toBeGreaterThan(0);
    expect(CONTENT_CHECK_OVERSTATED.test(upload)).toBe(false);
    // The detector fires on a planted positive — the claim that shipped.
    expect(CONTENT_CHECK_OVERSTATED.test("**The content check is the one that survives a hostile entries file.**")).toBe(true);

    // What it does bound is stated instead.
    expect(upload).toContain("unmodified non-image file");
    expect(upload).toContain("image/svg+xml");
  });
});

describe("Slice 1 — the normalization backstops (L2)", () => {
  test("the HTML half of caller-string escaping is backstopped in code", () => {
    // The count half already had `--landed`. The HTML half had nothing, so a
    // section carrying an unescaped `<a href>` or `<img src>` spliced clean
    // into a public body.
    const input = squash(inputRef());
    expect(input.length).toBeGreaterThan(0);
    expect(input).toContain("backstops");
    expect(input).toContain("--landed");

    const source = spliceSource();
    expect(source.length).toBeGreaterThan(0);
    expect(source).toContain("SECTION_HTML");
  });
});

// ---------------------------------------------------------------------------
// L2: the recipe gaps. Each of these is a variable the fences read and
// nothing binds, a status arm that falls through, or an allowlist that admits
// content the attacker controls — defects a model copying one fence at a time
// runs straight into.
// ---------------------------------------------------------------------------

// Offender detector: the pre-image read bound with no guard on it, which binds
// "" on any transient gh failure and is then indistinguishable from a PR whose
// description is genuinely empty.
const UNGUARDED_PRE_IMAGE = /PRE_IMAGE(?:_JSON)?="\$\(gh pr view[^\n]*\)"\s*$/m;
// Offender detector: the wildcard proxy host, which admits
// `raw.githubusercontent.com` and so any public repository's content.
const WILDCARD_PROXY_HOST = /\*\.githubusercontent\.com/;

describe("Slice 1 — recipe gaps (L2)", () => {
  test("the pre-image read is guarded, and the lost-update guard is not vacuous", () => {
    // `PRE_IMAGE="$(gh pr view …)"` with no `|| exit` binds "" on a rate limit
    // or a network blip. Nothing downstream told that apart from an empty
    // description: the check found no heading, the splice returned the
    // Screenshots section as the WHOLE body, and the lost-update guard passed
    // vacuously because every string starts with "".
    const upload = uploadRef();
    expect(upload.length).toBeGreaterThan(0);

    expect(UNGUARDED_PRE_IMAGE.test(upload)).toBe(false);
    // The detector fires on a planted positive — the line that shipped.
    expect(UNGUARDED_PRE_IMAGE.test('PRE_IMAGE="$(gh pr view "$NUMBER" --repo "$R" --json body --jq .body)"')).toBe(true);

    // The read exits on failure, and an envelope check separates a failed call
    // from `{"body":""}`.
    expect(upload).toContain('PRE_IMAGE_JSON="$(gh pr view "$NUMBER" --repo "$REPO_SPEC" --json body)" || exit 2');
    expect(upload).toContain('has("body")');

    // The empty-pre-image arm of the lost-update guard exists and is separate
    // from the prefix test, which is vacuous on "".
    const flat = squash(upload);
    expect(flat).toContain("vacuous when the pre-image is empty");
    expect(upload).toContain('case "$PRE_IMAGE" in');
    const guard = upload.slice(upload.indexOf('case "$PRE_IMAGE" in'));
    expect(guard.indexOf('"$PRE_IMAGE"*)')).toBeGreaterThan(0);

    // The re-read inside the loop is guarded the same way.
    expect(upload).toContain('AFTER_JSON="$(gh pr view "$NUMBER" --repo "$REPO_SPEC" --json body)"');
  });

  test("the validation loop binds its own inputs, in the same fence", () => {
    // The loop reads `$CAPTURE_ROOT` and `"$@"`, and nothing anywhere in the
    // skill produced either — so a session following the doc literally hits an
    // unbound root and has to invent its own jq extraction, which is the
    // improvisation this fence's own prose forbids.
    const fence = validationFence();
    expect(fence.length).toBeGreaterThan(0);

    // Both inputs are produced, in the same fence that consumes them.
    const rootBinding = fence.indexOf('CAPTURE_ROOT="$(jq -r');
    const positional = fence.indexOf("set -- $(jq -r '.entries[].path'");
    const loop = fence.indexOf('for ENTRY_PATH in "$@"');
    expect(rootBinding).toBeGreaterThanOrEqual(0);
    expect(positional).toBeGreaterThan(rootBinding);
    expect(loop).toBeGreaterThan(positional);

    // The bridge cannot silently split a path on its own newline, which would
    // make the `newline in path` class unreachable.
    expect(fence).toContain("ENTRY_COUNT");
    expect(fence).toContain("LINE_COUNT");
    expect(fence).toContain('[ "$ENTRY_COUNT" = "$LINE_COUNT" ] || exit 1');
    // And an unquoted `set --` globs without this.
    expect(fence).toContain("set -f");
  });

  test("no fence reads a variable its own skill never binds", () => {
    // The recurring defect, swept rather than spot-checked: a variable a later
    // fence expands but no fence binds is a variable the session invents. The
    // sweep runs per skill, because `pr-screenshots` and `team-pr` each ship
    // fences for this contract and neither one's bindings reach the other's.
    for (const { skill, ambient } of SHELL_CORPORA) {
      const code = corpusBlocks(skill).map(shellCode);
      expect(code.length).toBeGreaterThan(0);
      const bound = boundNames(code);
      const unbound = [...readNames(code)].filter((name) => !bound.has(name) && !ambient.includes(name)).sort();
      expect({ skill, unbound }).toEqual({ skill, unbound: [] });
    }

    // The sweep fires on a planted positive in EACH shape it missed: a name
    // bound in one skill and read in the other, and a name bound nowhere.
    const planted = ['node splice.mjs --section-file "$SECTION_FILE" --landed "$LANDED_COUNT"'];
    const bound = boundNames(planted);
    expect([...readNames(planted)].filter((name) => !bound.has(name)).sort()).toEqual([
      "LANDED_COUNT",
      "SECTION_FILE",
    ]);
  });

  test("no fence reads a file its own skill never writes", () => {
    // The second shape of the same defect, and the one a binding check cannot
    // see: `$PRE_IMAGE_FILE` was BOUND to a path and handed to `--body-file`
    // with no fence ever writing content to it. An unwritten path reads as an
    // empty body, `--check` passes vacuously on one, and the splice then
    // replaces the PR's whole description with the section alone.
    for (const { skill } of SHELL_CORPORA) {
      const code = corpusBlocks(skill).map(shellCode);
      expect(code.length).toBeGreaterThan(0);
      expect({ skill, unwritten: unwrittenFiles(code) }).toEqual({ skill, unwritten: [] });
    }

    // The detector fires on a planted positive: the path is bound, and nothing
    // writes the file.
    expect(
      unwrittenFiles(['PRE_IMAGE_FILE="$RUN_DIR/pre-image.md"', 'node splice.mjs --check --body-file "$PRE_IMAGE_FILE"']),
    ).toEqual(["PRE_IMAGE_FILE"]);
    // …and it clears once a fence writes it, in that order.
    expect(
      unwrittenFiles([
        'PRE_IMAGE_FILE="$RUN_DIR/pre-image.md"',
        'printf \'%s\' "$PRE_IMAGE" >"$PRE_IMAGE_FILE"',
        'node splice.mjs --check --body-file "$PRE_IMAGE_FILE"',
      ]),
    ).toEqual([]);
    // A write that comes AFTER the read is not a write the read can use.
    expect(
      unwrittenFiles([
        'node splice.mjs --check --body-file "$PRE_IMAGE_FILE"',
        'printf \'%s\' "$PRE_IMAGE" >"$PRE_IMAGE_FILE"',
      ]),
    ).toEqual(["PRE_IMAGE_FILE"]);
  });

  test("a failed attach records its class and continues", () => {
    // The arm fell through to the re-read and into step C, where the harvest
    // took whatever allowlisted URL the suffix held — the sole candidate, so
    // the ambiguity guard never fired, and it bound to this entry's caption.
    const fence = validationFence();
    expect(fence.length).toBeGreaterThan(0);
    expect(fence).toContain('REASON="attach failed" ; fail_entry ; continue');

    // The re-read still happens on a failed attach, because a non-zero exit
    // may still have updated the PR.
    const attach = fence.indexOf("--attach");
    const reread = fence.indexOf('AFTER_JSON="$(gh pr view', attach);
    const failArm = fence.indexOf('REASON="attach failed"', attach);
    expect(reread).toBeGreaterThan(attach);
    expect(failArm).toBeGreaterThan(reread);
  });

  test("step C's suffix is bound where step B reads the body", () => {
    // `$SUFFIX` was the harvest's whole input and no fence bound it. A model
    // copying the fences greps an unset variable, harvests nothing, lands
    // `--landed 0`, and writes the degraded section over live assets.
    const fence = validationFence();
    expect(fence).toContain('PREVIOUS="$AFTER"');
    expect(fence).toContain('SUFFIX="${AFTER#"$PREVIOUS"}"');
    // A body that no longer starts with the previous read is not a suffix at
    // all, and is recorded rather than harvested whole.
    expect(fence).toContain('REASON="body changed during upload"');

    // The harvest block says where it runs, so the binding and the use are
    // one invocation.
    const upload = squash(uploadRef());
    expect(upload).toContain("bound in step B's loop");
  });

  test("every entry ends recorded, as a landed URL or as a failure", () => {
    // The harvest's terminal statement wrote a line only when a URL resolved,
    // so an entry that harvested nothing produced NO line in either file —
    // including the ambiguous arm, which set `REASON` and broke out of the
    // inner `while` without recording it. If the harvest ever stops matching,
    // every entry lands nothing, `LANDED_COUNT` is 0, and the body is written
    // in the DEGRADED form — "captured, not yet uploaded" published over assets
    // that are live on world-readable URLs, beside an empty failure list.
    const fence = harvestFence();
    expect(fence.length).toBeGreaterThan(0);

    // Two arms, one per file, and no third way out of the loop body.
    expect(fence).toContain('printf \'%s\\t%s\\n\' "$ASSET_URL" "$ENTRY_PATH" >>"$ASSETS_FILE"');
    expect(fence).toContain('REASON="${REASON:-no attachment URL}" ; fail_entry');

    // The ambiguous arm's `break` leaves the inner loop with `REASON` set and
    // `ASSET_URL` cleared, and the recorder BELOW that loop is what turns it
    // into a line — the class that most needs a loud signal, since it fires
    // exactly when another writer appended a URL during the attach window.
    const ambiguous = fence.indexOf('REASON="ambiguous attachment URL"');
    const loopEnd = fence.indexOf('done < "$CANDIDATES_FILE"');
    expect(ambiguous).toBeGreaterThan(0);
    expect(loopEnd).toBeGreaterThan(ambiguous);
    expect(fence.indexOf("fail_entry", loopEnd)).toBeGreaterThan(loopEnd);

    // The detector fires on the shipped shape: a single-armed recorder.
    expect(UNRECORDED_ENTRY.test(fence)).toBe(false);
    expect(
      UNRECORDED_ENTRY.test('[ -z "$ASSET_URL" ] || printf \'%s\\t%s\\n\' "$ASSET_URL" "$ENTRY_PATH" >>"$ASSETS_FILE"'),
    ).toBe(true);

    // Both classes are named where every other class is, so the
    // `Not uploaded: <caption> — <reason>` line can carry them.
    const upload = uploadRef();
    expect(upload).toContain("`no attachment URL`");
    expect(upload).toContain("`ambiguous attachment URL`");
  });

  test("the pre-image is written to the file every check reads", () => {
    // `$PRE_IMAGE_FILE` was bound to a path, the normalization was prose, and
    // no fence ever wrote the file. Followed literally that leaves an EMPTY
    // file: `--check` passes vacuously on one — no heading, no fault — and step
    // D splices against it, discarding the PR's real description.
    const upload = uploadRef();
    const fence = fencedBlocks(upload).find((block) => block.includes("PRE_IMAGE_JSON=")) ?? "";
    expect(fence.length).toBeGreaterThan(0);

    // Read, normalized, and written in the one fence that binds it.
    expect(fence).toContain("tr -d '\\r'");
    expect(fence).toContain('printf \'%s\' "$PRE_IMAGE" >"$PRE_IMAGE_FILE"');

    // And written BEFORE the check that reads it.
    const write = upload.indexOf('>"$PRE_IMAGE_FILE"');
    const check = upload.indexOf('--check --body-file "$PRE_IMAGE_FILE"');
    expect(write).toBeGreaterThan(0);
    expect(check).toBeGreaterThan(write);

    // Both sides of the lost-update comparison get the same normalization, or
    // the guard refuses every run on a PR whose body carries CRLFs.
    expect(validationFence()).toContain("tr -d '\\r'");
  });

  test("the lost-update guard records what it does not cover", () => {
    // `AFTER` is the body as of the last SUCCESSFUL read, so an entry that
    // recorded `body read failed` leaves a stale baseline for the guard to
    // test — a concurrent replacement passes it, over a window spanning every
    // entry from the failed read on. The recorded residual named only a
    // concurrent append.
    const upload = squash(uploadRef());
    expect(upload).toContain("body as of the last **successful** read");
    expect(upload).toContain("concurrent *replacement*");
  });

  test("the attachment proxy host is enumerated, never wildcarded", () => {
    // `*.githubusercontent.com` is not one host: `raw.githubusercontent.com`
    // serves any public repository's content, so the path anchor was bypassed
    // for `https://raw.githubusercontent.com/attacker/evil/main/x.png`.
    const upload = uploadRef();
    const verify = verifyRef();
    expect(upload.length).toBeGreaterThan(0);
    expect(verify.length).toBeGreaterThan(0);

    // The rule lives in a fence in `02`, so the sweep runs on the fences —
    // the prose beside them names the rejected form on purpose. `03` states
    // the same rule as prose, so it is swept whole.
    expect(fencedBlocks(upload).filter((fence) => WILDCARD_PROXY_HOST.test(fence))).toEqual([]);
    expect(WILDCARD_PROXY_HOST.test(verify)).toBe(false);
    // The detector fires on a planted positive — the rule that shipped.
    expect(WILDCARD_PROXY_HOST.test('case "$CANDIDATE_HOST" in *.githubusercontent.com) : ;; esac')).toBe(true);

    // One enumerated host, plus its Enterprise equivalent.
    for (const text of [upload, verify]) {
      expect(text).toContain("private-user-images.githubusercontent.com");
      expect(text).toContain("PR_SCREENSHOTS_ASSET_HOST");
    }
    expect(upload).toContain('ASSET_PROXY_HOST="private-user-images.$PR_HOST"');

    // The proxy path is shaped, not "any path at all".
    expect(upload).toContain('case "${CANDIDATE_FILE#/}" in');
    expect(squash(verify)).toContain("one or two segments whose last names an image file");
  });

  test("Enterprise is reachable by URL, and every call carries the host", () => {
    // `01`'s first line mandated a validator anchored at `^https://github.com/`
    // while three later places handled a GHES host, so an Enterprise PR URL was
    // refused as malformed before any of that handling ran.
    const input = inputRef();
    expect(input.length).toBeGreaterThan(0);
    expect(input).toContain("PR_URL_PATTERN='^https://[A-Za-z0-9.-]{1,253}/");
    expect(input).not.toContain("^https://github\\.com/[A-Za-z0-9._-]");

    // The host the URL named is carried into every later call.
    expect(input).toContain('REPO_SPEC="$PR_HOST/$OWNER/$REPO"');
    const calls = skillBlocks().filter((block) => /gh pr (?:view|edit) "\$NUMBER"/.test(block));
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.filter((block) => block.includes('--repo "$OWNER/$REPO"'))).toEqual([]);
    expect(verifyRef()).toContain('gh api --hostname "$PR_HOST"');
  });

  test("a URL that walks out of the path anchor is rejected in both layers", () => {
    // A candidate whose path walks back out of the anchor —
    // `https://github.com/user-attachments/assets/../../attacker/evil/raw/main/x.png`
    // — satisfied the prefix test and the host test, and an HTTP client
    // normalizes it to attacker-controlled content on an allowlisted host.
    const upload = uploadRef();
    const verify = verifyRef();
    expect(upload.length).toBeGreaterThan(0);
    expect(verify.length).toBeGreaterThan(0);

    // The harvest rejects it in the copyable block, before the anchor test.
    const fence = fencedBlocks(upload).find((block) => block.includes("ASSET_PROXY_HOST=")) ?? "";
    expect(fence.length).toBeGreaterThan(0);
    expect(fence).toContain('case "$CANDIDATE_PATH" in *..|*../*|*/..|*/../*) continue ;; esac');
    expect(fence).toContain('case "$CANDIDATE" in *%2[eEfF]*) continue ;; esac');
    expect(fence.indexOf("*/../*")).toBeLessThan(fence.indexOf("/user-attachments/assets/*)"));

    // The read-back checks the same rule, or it cannot detect what the harvest
    // let through.
    const squashedVerify = squash(verify);
    expect(squashedVerify).toContain("`..` path segment");
    expect(squashedVerify).toContain("%2f");
  });

  test("the proxy path admits the rewrite GitHub actually emits", () => {
    // A one-segment rule matched NO real rewrite: the genuine form is
    // `/<user-id>/<asset-id>-<uuid>.png?jwt=…`, two segments, so every
    // private-repository PR rejected every entry and the read-back reported
    // `unverified` on a correct write.
    const upload = uploadRef();
    expect(upload.length).toBeGreaterThan(0);
    const fence = fencedBlocks(upload).find((block) => block.includes("ASSET_PROXY_HOST=")) ?? "";
    expect(fence.length).toBeGreaterThan(0);
    // Three or more segments is the reject arm; one and two are allowed.
    expect(fence).toContain("*/*/*) continue ;;");
    // The one-segment rule that rejected every real rewrite is gone: the arm
    // is now three-or-more, so `/<user-id>/<asset-id>-<uuid>.png` is admitted.
    expect(fence).not.toContain("one segment, naming an image file");
    expect(fence).toContain("one or two segments, naming an image file");
    // The extension test still bounds the last segment.
    expect(fence).toContain("*.png|*.jpg|*.jpeg|*.gif|*.webp|*.avif)");
    // A realistic rewrite is pinned, so the shape cannot drift back.
    for (const text of [upload, verifyRef()]) {
      expect(text).toContain("<user-id>/<asset-id>-<uuid>.png?jwt=");
    }
  });

  test("the in-loop body re-read is guarded by envelope, not only by exit", () => {
    // The prose claimed the re-read "is guarded the same way the pre-image
    // is"; the pre-image checks the JSON envelope and the re-read did not, so
    // a rate-limited response became `""` — "the host removed the body".
    const fence = validationFence();
    expect(fence.length).toBeGreaterThan(0);
    const envelope = 'jq -e \'has("body") and (.body | type == "string")\'';
    expect(fence).toContain("AFTER_JSON=");
    expect(fence).toContain(envelope);
    expect(fence.indexOf(envelope)).toBeLessThan(fence.indexOf('AFTER="$(printf'));
    // Step A's pre-image read carries the same check, so the claim holds.
    expect(uploadRef()).toContain("PRE_IMAGE_JSON=");
    expect((uploadRef().match(/has\("body"\) and \(\.body \| type == "string"\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("every load-bearing temporary and count is bound in a visible fence", () => {
    // A variable a later fence expands but no fence binds is a variable the
    // session invents — `$LANDED_COUNT` feeds the guard that keeps rule 4 from
    // being satisfiable by caller text.
    const fences = fencedBlocks(uploadRef()).join("\n");
    expect(fences.length).toBeGreaterThan(0);
    for (const binding of [
      'PRE_IMAGE_FILE="$RUN_DIR/pre-image.md"',
      'SECTION_FILE="$RUN_DIR/section.md"',
      'NEW_BODY_FILE="$RUN_DIR/new-body.md"',
      'CANDIDATES_FILE="$RUN_DIR/candidates.txt"',
      "LANDED_COUNT=",
      'ASSETS_FILE',
    ]) {
      expect(fences).toContain(binding);
    }
    // The count comes from the run's own record of what landed, not from prose.
    expect(fences).toContain('LANDED_COUNT="$(wc -l <"$ASSETS_FILE"');
  });

  test("the entries file has a worked, non-interpolating construction", () => {
    // The one step a standalone session must freehand, and it holds
    // user-supplied paths: a quote or a backslash in one rewrites the JSON.
    const input = inputRef();
    expect(input.length).toBeGreaterThan(0);
    const fence = fencedBlocks(input).find((block) => block.includes("jq -n")) ?? "";
    expect(fence.length).toBeGreaterThan(0);
    expect(fence).toContain("--args");
    expect(fence).toContain("$ARGS.positional");
    expect(fence).toContain("ENTRIES_FILE=");
    // The default-caption rule is executable in that same fence, so two
    // sessions handed the same three paths write the same three captions.
    expect(fence).toContain('sub("\\\\.[^.]+$"; "")');
    expect(squash(input)).toContain("basename with its extension removed");
  });

  test("the worked example carries the captions the snippet derives", () => {
    // The example and the snippet below it disagreed: two hand-supplied
    // `"Login"` captions above, and `login` / `login-error` out of the jq
    // expression that claimed to produce them — so the one executable statement
    // of the default-caption rule contradicted its own worked example.
    const example = fencedBlocks(inputRef()).find((block) => block.includes('"entries"')) ?? "";
    expect(example.length).toBeGreaterThan(0);
    const parsed = JSON.parse(example) as { entries: { path: string; caption: string }[] };
    expect(parsed.entries.length).toBeGreaterThan(1);

    // The rule, applied here exactly as the fence applies it in jq.
    const defaultCaption = (path: string) => (path.split("/").pop() ?? "").replace(/\.[^.]+$/, "");
    for (const entry of parsed.entries) {
      expect({ path: entry.path, caption: entry.caption }).toEqual({
        path: entry.path,
        caption: defaultCaption(entry.path),
      });
    }
  });

  test("the raw-HTML-tag over-refusal is in the recovery catalogue", () => {
    // `HTML_TAG` matches `a<b` in ordinary prose, so a body reading "fails
    // when a<b" refuses the whole run. Designed direction of error, non-obvious
    // recovery — so the recovery is written down.
    const upload = squash(uploadRef());
    expect(upload.length).toBeGreaterThan(0);
    expect(upload).toContain("a<b");
    expect(upload).toContain("\\<");
  });

  test("the section's own vocabulary is written down, root and content type included", () => {
    // The prose refusal is only safe if this skill's own output is
    // distinguishable from a reviewer's sentence, which is what the
    // blockquoted `notes` line buys.
    const templates = sectionTemplates();
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.filter((template) => template.includes("> _note:_ <one blockquoted line")).length).toBe(templates.length);

    const skill = fileOr(SKILL);
    expect(skill.length).toBeGreaterThan(0);
    for (const shape of ["`**caption**`", "`![screenshot-NN]`", "`> _note:_`", "`Not uploaded:`"]) {
      expect(skill).toContain(shape);
    }
    // The entries file's absolute root and the content-type acceptance rule
    // belong in the skill's own hard rules.
    expect(skill).toContain("file -b --mime-type");
    expect(squash(skill)).toContain("absolute** top-level `root`");
  });
});

// ---------------------------------------------------------------------------
// Comment discipline over the two test files this contract owns.
// `engineering-standards`, Code Comments, forbids process narration and names
// "review feedback" and "edit history" specifically: a comment that opens with
// a review-round or finding ID is both, and it explains nothing a reader of
// this file can use. The explanation is what stays; the ID is what goes.
//
// The marker is ASSEMBLED from fragments rather than written out, because a
// literal one would sit in this file and make the sweep match its own detector.
// ---------------------------------------------------------------------------
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;
const PROCESS_MARKER = new RegExp(`\\b(?:${"round"}|${"finding"})s?[- ]?\\d`, "i");

describe("comment discipline (L2)", () => {
  test("no test comment carries a review-round or finding ID", () => {
    const files = ["pr-screenshots-skill.test.ts", "team-pr-screenshots.test.ts"].map((name) =>
      join(REPO_ROOT, "tests", name),
    );
    const offenders: string[] = [];
    for (const file of files) {
      expect(existsSync(file)).toBe(true);
      read(file)
        .split("\n")
        .forEach((line, index) => {
          if (COMMENT_LINE.test(line) && PROCESS_MARKER.test(line)) {
            offenders.push(`${relative(REPO_ROOT, file)}:${index + 1}`);
          }
        });
    }
    expect(offenders).toEqual([]);

    // The detector fires on planted positives — the shapes that shipped.
    for (const planted of [`    // ${"Round"}-5 B1. The companion read was the bare form`, `// ${"finding"} 8: a runtime branch`]) {
      expect(COMMENT_LINE.test(planted) && PROCESS_MARKER.test(planted)).toBe(true);
    }
    // …and not on the durable references that stay: design decisions, slices,
    // and CommonMark sections.
    for (const kept of ["// Decision 12 rejects the per-repo call.", "// Slice 3 copies it verbatim.", "// CommonMark 0.31.2 §4.2."]) {
      expect(PROCESS_MARKER.test(kept)).toBe(false);
    }
  });
});
