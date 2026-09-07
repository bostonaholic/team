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
import { existsSync, readdirSync } from "node:fs";
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
type SpliceFn = (body: string, section: string) => SpliceResult;

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

    const result = splice(crashed, SECTION);

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

    const result = splice(colon, SECTION);

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

    const result = splice(body, SECTION);

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

    const result = splice(twoHeadings, SECTION);

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

    const result = splice(big, SECTION);

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

    const withAnchor = splice(anchored, SECTION);

    expect(withAnchor.changed).toBe(true);
    expect(withAnchor.body).toContain("## Screenshots");
    expect(withAnchor.body.indexOf("assets/1111")).toBeGreaterThan(withAnchor.body.indexOf("## Summary"));
    expect(withAnchor.body.indexOf("assets/1111")).toBeLessThan(withAnchor.body.indexOf("## How to Verify"));

    // No anchor: the section goes at the end of `content`, above the footer.
    const unanchored = ["## Summary", "", "Adds a login page.", "", "Closes #12", ""].join("\n");

    const withoutAnchor = splice(unanchored, SECTION);

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
    expect(splice(REAL, SECTION).changed).toBe(true);
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
