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

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
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
// skill writes into a PR body.
function sectionTemplates(): string[] {
  return fencedBlocks(uploadRef()).filter((block) => block.includes("## Screenshots"));
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
// delimiter (finding 3).
const ATTACH_ALT = /--attach\s+["']?[^\s"'`]*#/;
// The rejected justification for excluding `## Pre-merge` as an anchor
// (finding 6): a forbidden CLAIM, not a forbidden wording. Rule 1 DOES remove
// a trailing `## Pre-merge`, so the ban is narrowed to the "already removed
// it" claim that made the anchor list look redundant.
const RULE_ONE_CLAIM = /rule (1|one)[^.]{0,40}already[^.]{0,20}remov|already[^.]{0,20}remov[^.]{0,40}rule (1|one)/i;

// ---------------------------------------------------------------------------
// Slice 1 — L1: the five splice rules, plus findings 1 and 2.
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
    // Finding 1(a). A crash between attach and write leaves a standalone image
    // line at EOF, so rule 1's footer scan stops immediately and `Closes #12`
    // lands in `content`. Rule 2's replace must stop at that ticket-reference
    // line instead of running to the end of `content` and deleting it.
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
    // Finding 1(b). The stem pattern tolerates an optional `:`, so the colon
    // form joins the footer block and is re-emitted last.
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
    // Finding 2. Rule 4 counts asymmetrically: the NEW section counts only
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

    const preImage = upload.indexOf("--json body --jq .body");
    const attach = upload.indexOf('--attach "$');
    const spliceCall = upload.indexOf("splice.mjs");
    const write = upload.indexOf("--body-file");

    expect(preImage).toBeGreaterThanOrEqual(0);
    expect(attach).toBeGreaterThan(preImage);
    expect(spliceCall).toBeGreaterThan(attach);
    expect(write).toBeGreaterThan(spliceCall);

    // Re-read after every attach: the body read command appears again past
    // the attach loop.
    expect(upload.indexOf("--json body --jq .body", attach)).toBeGreaterThan(attach);

    // No `#<alt>` suffix in any command the skill emits.
    const blocks = fencedBlocks(corpus());
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.filter((block) => ATTACH_ALT.test(block))).toEqual([]);
    // The detector fires on a planted positive.
    expect(ATTACH_ALT.test('gh pr edit "$N" --repo "$R" --attach "$P#Login"')).toBe(true);
  });

  test("path validation rejects a # in a path", () => {
    // Finding 3. The enumerated validation set is exists, regular file, no
    // newline, no `#` — each pinned as the token that names it.
    const upload = squash(uploadRef());
    expect(upload.length).toBeGreaterThan(0);
    expect(upload).toContain("exists");
    expect(upload).toContain("regular file");
    expect(upload).toContain("newline");
    expect(upload).toContain("`#`");
  });

  test("the outcome enum names the post-upload halt", () => {
    // Finding 4. `uploaded-not-written` is what decision 6's lost-update halt
    // returns: assets landed, body untouched.
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
    // Finding 6. The creation-time skeleton appends `## Pre-merge` post-open,
    // so rule 1 does not always remove it; the anchor list is what excludes it.
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
    // Finding 7. Three rejected options — orphan branch, browser-profile
    // uploader, tail-comparison detection — each with its own reason, in the
    // format of docs/cross-host-portability.md.
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
    expect(verify).toContain("gh api repos/");
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
    // above it, so replacing the section replaces its subheadings with it —
    // otherwise the replace orphans them under the new content.
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

    expect(result.changed).toBe(true);
    expect(result.body).not.toContain("### Before");
    expect(occurrences(result.body, "Closes #7")).toBe(1);
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
      "old text",
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
    expect(result.body).not.toContain("old text");
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
      "old text",
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
    expect(result.body).not.toContain("old text");
  });

  test("a Screenshots heading in its setext spelling is replaced, not duplicated", () => {
    const setext = ["Intro", "", "Screenshots", "-----------", "", "old text", "", "Closes #4", ""].join("\n");

    const result = splice(setext, SECTION, { landed: 2 });

    expect(result.changed).toBe(true);
    expect(result.body).not.toContain("old text");
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

  test("the sweep can fail: a body whose protected block is deleted is caught", () => {
    // The invariant above is only worth its runtime if it can go red. A
    // section replace over a body with no boundary between the section and
    // the block below it deletes that block — and the occurrence check sees
    // it.
    const swallowed = ["## Screenshots", "", "old", "", "plain prose that no boundary protects", ""].join("\n");
    const result = splice(swallowed, SECTION, { landed: 2 });

    expect(result.changed).toBe(true);
    expect(occurrences(result.body, "plain prose that no boundary protects")).toBe(0);
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
    // The members, by field name.
    for (const field of ["caption", "notes", "path", "reason"]) {
      expect(input).toContain(field);
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
