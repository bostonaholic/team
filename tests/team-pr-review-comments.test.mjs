// Acceptance tests for skills/team-pr/scripts/review-comments.mjs: the script that turns
// deferred findings and cross-model-notes.md into the PR comments /team-pr posts.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const SCRIPT = resolve("skills/team-pr/scripts/review-comments.mjs");

const FRONTMATTER = "---\ntopic: demo\ndate: 2026-10-01\nphase: cross-model-review\n---\n";

const FINDINGS = `- [code-reviewer, round 1] Minor: rename retryCount to retryBudget in uploader.mjs:42.
- [technical-writer] Nitpick: the README retry section uses passive voice.
`;

const NO_COMMENTS = '{"comments":[]}\n';

function scratch(t) {
  const root = mkdtempSync(join(tmpdir(), "review-comments-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function writeInput(root, name, text) {
  const path = join(root, name);
  writeFileSync(path, text);
  return path;
}

function emptyOut(root) {
  const path = join(root, "out");
  mkdirSync(path);
  return path;
}

function notesFile(root, body) {
  return writeInput(root, "cross-model-notes.md", FRONTMATTER + body);
}

function runScript(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
}

function manifestOf(run) {
  assert.equal(run.status, 0, `review-comments.mjs exited ${run.status}: ${run.stderr}`);
  return JSON.parse(run.stdout);
}

function postedBodies(manifest) {
  return Object.fromEntries(manifest.post.map((entry) => [entry.key, readFileSync(entry.file, "utf8")]));
}

const lineCount = (lines, line) => lines.filter((candidate) => candidate === line).length;

// Every non-blank notes line must land in exactly one posted body, so its total count
// across all bodies equals its count in the notes body.
function assertEveryNotesLineOnce(notesBody, bodies) {
  const notesLines = notesBody.split("\n");
  const bodyLines = Object.values(bodies).flatMap((body) => body.split("\n"));
  for (const line of new Set(notesLines.filter((candidate) => candidate.trim() !== ""))) {
    assert.equal(lineCount(bodyLines, line), lineCount(notesLines, line), `notes line ${JSON.stringify(line)} count across bodies`);
  }
}

// Code review inputs. The PR author differs from the viewer, so no self-authored
// downgrade applies unless a test sets the author.
const VIEWER_JSON = '{"login":"mboston"}\n';
const NO_REVIEWS = JSON.stringify({ author: { login: "pr-opener" }, comments: [], reviews: [] });
const DESIGN_FINDINGS = "- [design-reviewer, round 2] COMMENT: state the retry budget default in the README.\n";
const REVIEW_FINDINGS = "- [code-reviewer] Minor: rename retryCount to retryBudget in uploader.mjs:42.\n";

// Builds the code review flags. Each text option is the file's content; a *Path
// option points the flag at a path the test prepared, such as an absent file.
function reviewFlags(root, { verdict, reviewed, viewer = VIEWER_JSON, reviewFindings = REVIEW_FINDINGS, sinceReview = "", reviewFindingsPath, sinceReviewPath }) {
  return [
    "--verdict", verdict,
    "--reviewed", reviewed,
    "--viewer", writeInput(root, "viewer.json", viewer),
    "--review-findings", reviewFindingsPath ?? writeInput(root, "review-findings.md", reviewFindings),
    "--since-review", sinceReviewPath ?? writeInput(root, "since-review.txt", sinceReview),
  ];
}

// ---------------------------------------------------------------------------
// Slice 1: Review notes post as one PR comment
// ---------------------------------------------------------------------------

test("review-notes comment opens with its marker and carries findings then the notes body", (t) => {
  const root = scratch(t);
  const out = emptyOut(root);
  const implementBlock = `> ### Cross-model disposition
>
> #### codex
> - **Adopted, issue:** The retry loop never stops after five failures.`;
  const run = runScript([
    "--out", out,
    "--existing", writeInput(root, "existing.json", NO_COMMENTS),
    "--findings", writeInput(root, "findings.md", FINDINGS),
    "--notes", notesFile(root, `\n${implementBlock}\n`),
  ]);

  const manifest = manifestOf(run);
  assert.deepEqual(manifest.post.map((entry) => entry.key), ["review-notes"]);
  const body = readFileSync(join(out, "review-notes.md"), "utf8");
  const findingsText = `- [code-reviewer, round 1] Minor: rename retryCount to retryBudget in uploader.mjs:42.
- [technical-writer] Nitpick: the README retry section uses passive voice.`;
  assert.equal(body.split("\n")[0], "<!-- team:pr-comment review-notes -->");
  assert.ok(body.includes("\n## Review notes\n"), `no "## Review notes" line in:\n${body}`);
  assert.ok(body.includes(`\n${findingsText}\n`), `findings not copied verbatim in:\n${body}`);
  assert.equal(body.split(implementBlock).length - 1, 1, `IMPLEMENT block not present exactly once in:\n${body}`);
  assert.ok(body.endsWith(`\n${implementBlock}\n`), `body does not end with the IMPLEMENT block and one newline:\n${body}`);
  assert.ok(body.indexOf("## Review notes") < body.indexOf(findingsText), "heading is not above the findings");
  assert.ok(body.indexOf(findingsText) < body.indexOf(implementBlock), "findings are not above the notes block");
  assert.ok(!body.includes("phase: cross-model-review"), `frontmatter leaked into:\n${body}`);
});

test("nothing to report writes no comment", async (t) => {
  await t.test("no findings file and no notes file", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const run = runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", NO_COMMENTS),
      "--findings", join(root, "absent-findings.md"),
      "--notes", join(root, "absent-cross-model-notes.md"),
    ]);

    assert.deepEqual(manifestOf(run), { post: [], skip: [], refused: [] });
    assert.deepEqual(readdirSync(out), []);
  });

  await t.test("a whitespace-only findings file and no notes file", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const run = runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", NO_COMMENTS),
      "--findings", writeInput(root, "findings.md", "  \n\n\t\n"),
    ]);

    assert.deepEqual(manifestOf(run), { post: [], skip: [], refused: [] });
    assert.deepEqual(readdirSync(out), []);
  });
});

// ---------------------------------------------------------------------------
// Slice 2: Each design round posts as its own comment
// ---------------------------------------------------------------------------

test("each design round becomes its own comment and every notes line lands once", async (t) => {
  await t.test("the real layout, with a bare > line between label and heading", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const notesBody = `
> **Design round 1**
>
> ### Cross-model disposition
>
> #### codex
> - **Adopted, suggestion:** The legacy-body gate is undefined.
>
> #### agy
> - Skipped: the CLI timed out after 600000 ms. No claims to judge.
>
`;
    const manifest = manifestOf(runScript(["--out", out, "--existing", writeInput(root, "existing.json", NO_COMMENTS), "--notes", notesFile(root, notesBody)]));
    const bodies = postedBodies(manifest);

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["design-round-1"]);
    assert.deepEqual(bodies, {
      "design-round-1": `<!-- team:pr-comment design-round-1 -->

> **Design round 1**
>
> ### Cross-model disposition
>
> #### codex
> - **Adopted, suggestion:** The legacy-body gate is undefined.
>
> #### agy
> - Skipped: the CLI timed out after 600000 ms. No claims to judge.
>
`,
    });
    assertEveryNotesLineOnce(notesBody, bodies);
  });

  await t.test("a label directly above the heading", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const notesBody = `
> **Design round 1**
> ### Cross-model disposition
> - **Adopted, nitpick:** Name the marker key in the report.
`;
    const manifest = manifestOf(runScript(["--out", out, "--existing", writeInput(root, "existing.json", NO_COMMENTS), "--notes", notesFile(root, notesBody)]));
    const bodies = postedBodies(manifest);

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["design-round-1"]);
    assert.deepEqual(bodies, {
      "design-round-1": `<!-- team:pr-comment design-round-1 -->

> **Design round 1**
> ### Cross-model disposition
> - **Adopted, nitpick:** Name the marker key in the report.
`,
    });
    assertEveryNotesLineOnce(notesBody, bodies);
  });

  await t.test("a heading written >###", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const notesBody = `
> **Design round 1**
>
>### Cross-model disposition
> - **Refuted:** The claim that the marker shows in the rendered comment.
`;
    const manifest = manifestOf(runScript(["--out", out, "--existing", writeInput(root, "existing.json", NO_COMMENTS), "--notes", notesFile(root, notesBody)]));
    const bodies = postedBodies(manifest);

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["design-round-1"]);
    assert.deepEqual(bodies, {
      "design-round-1": `<!-- team:pr-comment design-round-1 -->

> **Design round 1**
>
>### Cross-model disposition
> - **Refuted:** The claim that the marker shows in the rendered comment.
`,
    });
    assertEveryNotesLineOnce(notesBody, bodies);
  });

  await t.test("rounds 1 and 3 only give design-round-1 and design-round-3", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const notesBody = `
> **Design round 1**
>
> ### Cross-model disposition
> - **Adopted, suggestion:** Post the review comments after the companion edit.

> **Design round 3**
>
> ### Cross-model disposition
> - **Refuted:** The claim that round two was skipped by mistake.
`;
    const manifest = manifestOf(runScript(["--out", out, "--existing", writeInput(root, "existing.json", NO_COMMENTS), "--notes", notesFile(root, notesBody)]));
    const bodies = postedBodies(manifest);

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["design-round-1", "design-round-3"]);
    assert.deepEqual(bodies, {
      "design-round-1": `<!-- team:pr-comment design-round-1 -->

> **Design round 1**
>
> ### Cross-model disposition
> - **Adopted, suggestion:** Post the review comments after the companion edit.
`,
      "design-round-3": `<!-- team:pr-comment design-round-3 -->

> **Design round 3**
>
> ### Cross-model disposition
> - **Refuted:** The claim that round two was skipped by mistake.
`,
    });
    assertEveryNotesLineOnce(notesBody, bodies);
  });

  await t.test("two blocks labeled round 2 give one comment in file order", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const notesBody = `
> **Design round 2**
>
> ### Cross-model disposition
> - **Adopted, issue:** First pass of round two.

> **Design round 2**
>
> ### Cross-model disposition
> - **Adopted, nitpick:** Resumed pass of round two.
`;
    const manifest = manifestOf(runScript(["--out", out, "--existing", writeInput(root, "existing.json", NO_COMMENTS), "--notes", notesFile(root, notesBody)]));
    const bodies = postedBodies(manifest);

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["design-round-2"]);
    assert.deepEqual(bodies, {
      "design-round-2": `<!-- team:pr-comment design-round-2 -->

> **Design round 2**
>
> ### Cross-model disposition
> - **Adopted, issue:** First pass of round two.

> **Design round 2**
>
> ### Cross-model disposition
> - **Adopted, nitpick:** Resumed pass of round two.
`,
    });
    assertEveryNotesLineOnce(notesBody, bodies);
  });

  // The review-notes tag line wording is the implementer's choice (8-plan.md), so the
  // review-notes body is asserted by marker, heading, tag token, and its closing part.
  await t.test("text above the first heading lands in review-notes", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const notesBody = `
> Preamble written before the first disposition.

> **Design round 1**
>
> ### Cross-model disposition
> - **Adopted, suggestion:** Round one finding.
`;
    const manifest = manifestOf(runScript(["--out", out, "--existing", writeInput(root, "existing.json", NO_COMMENTS), "--notes", notesFile(root, notesBody)]));
    const bodies = postedBodies(manifest);

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["review-notes", "design-round-1"]);
    assert.equal(bodies["design-round-1"], `<!-- team:pr-comment design-round-1 -->

> **Design round 1**
>
> ### Cross-model disposition
> - **Adopted, suggestion:** Round one finding.
`);
    assert.equal(bodies["review-notes"].split("\n")[0], "<!-- team:pr-comment review-notes -->");
    assert.ok(bodies["review-notes"].includes("\n## Review notes\n"), `no "## Review notes" line in:\n${bodies["review-notes"]}`);
    assert.ok(bodies["review-notes"].includes("cross-model-notes"), `no cross-model-notes tag in:\n${bodies["review-notes"]}`);
    assert.ok(bodies["review-notes"].endsWith("\n> Preamble written before the first disposition.\n"), `review-notes does not end with the preamble:\n${bodies["review-notes"]}`);
    assertEveryNotesLineOnce(notesBody, bodies);
  });

  await t.test("a label separated from the heading by content stays in its block", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const notesBody = `
> **Design round 1**
>
> ### Cross-model disposition
> - **Adopted, suggestion:** Round one finding.
> **Design round 2**
> - **Adopted, nitpick:** A finding line between the label and the heading.
>
> ### Cross-model disposition
> - **Refuted:** An unlabeled IMPLEMENT claim.
`;
    const manifest = manifestOf(runScript(["--out", out, "--existing", writeInput(root, "existing.json", NO_COMMENTS), "--notes", notesFile(root, notesBody)]));
    const bodies = postedBodies(manifest);

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["review-notes", "design-round-1"]);
    assert.equal(bodies["design-round-1"], `<!-- team:pr-comment design-round-1 -->

> **Design round 1**
>
> ### Cross-model disposition
> - **Adopted, suggestion:** Round one finding.
> **Design round 2**
> - **Adopted, nitpick:** A finding line between the label and the heading.
>
`);
    assert.equal(bodies["review-notes"].split("\n")[0], "<!-- team:pr-comment review-notes -->");
    assert.ok(bodies["review-notes"].endsWith("\n> ### Cross-model disposition\n> - **Refuted:** An unlabeled IMPLEMENT claim.\n"), `review-notes does not end with the unlabeled block:\n${bodies["review-notes"]}`);
    assertEveryNotesLineOnce(notesBody, bodies);
  });

  await t.test("design blocks only give no review-notes", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const notesBody = `
> **Design round 1**
> ### Cross-model disposition
> - **Adopted, suggestion:** Round one finding.

> **Design round 2**
> ### Cross-model disposition
> - **Adopted, suggestion:** Round two finding.
`;
    const manifest = manifestOf(runScript(["--out", out, "--existing", writeInput(root, "existing.json", NO_COMMENTS), "--notes", notesFile(root, notesBody)]));
    const bodies = postedBodies(manifest);

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["design-round-1", "design-round-2"]);
    assert.deepEqual(readdirSync(out).sort(), ["design-round-1.md", "design-round-2.md"]);
    assert.deepEqual(bodies, {
      "design-round-1": `<!-- team:pr-comment design-round-1 -->

> **Design round 1**
> ### Cross-model disposition
> - **Adopted, suggestion:** Round one finding.
`,
      "design-round-2": `<!-- team:pr-comment design-round-2 -->

> **Design round 2**
> ### Cross-model disposition
> - **Adopted, suggestion:** Round two finding.
`,
    });
    assertEveryNotesLineOnce(notesBody, bodies);
  });
});

// A design-round-1 body is the marker line, a blank line, the block, and one newline.
const ROUND_ONE_HEAD = "> **Design round 1**\n> ### Cross-model disposition\n> ";
const ROUND_ONE_FRAMING = "<!-- team:pr-comment design-round-1 -->\n\n".length + "\n".length;
const roundOneBlockForBody = (characters) => ROUND_ONE_HEAD + "x".repeat(characters - ROUND_ONE_FRAMING - ROUND_ONE_HEAD.length);
const ROUND_TWO_BLOCK = "> **Design round 2**\n> ### Cross-model disposition\n> - **Adopted, suggestion:** Round two finding.";

test("a body over 65536 characters is refused while other keys post", async (t) => {
  await t.test("a body of exactly 65536 characters posts", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const notes = notesFile(root, `\n${roundOneBlockForBody(65536)}\n\n${ROUND_TWO_BLOCK}\n`);
    const manifest = manifestOf(runScript(["--out", out, "--existing", writeInput(root, "existing.json", NO_COMMENTS), "--notes", notes]));

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["design-round-1", "design-round-2"]);
    assert.equal(manifest.post[0].characters, 65536);
    assert.equal(readFileSync(join(out, "design-round-1.md"), "utf8").length, 65536);
    assert.deepEqual(manifest.refused, []);
  });

  await t.test("a body of 65537 characters is refused and design-round-2 still posts", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const notes = notesFile(root, `\n${roundOneBlockForBody(65537)}\n\n${ROUND_TWO_BLOCK}\n`);
    const manifest = manifestOf(runScript(["--out", out, "--existing", writeInput(root, "existing.json", NO_COMMENTS), "--notes", notes]));

    assert.deepEqual(manifest.refused.map((entry) => entry.key), ["design-round-1"]);
    assert.match(manifest.refused[0].reason, /65537/);
    assert.equal(existsSync(join(out, "design-round-1.md")), false, "a refused body was written to --out");
    assert.deepEqual(manifest.post.map((entry) => entry.key), ["design-round-2"]);
    assert.deepEqual(readdirSync(out), ["design-round-2.md"]);
  });
});

// ---------------------------------------------------------------------------
// Slice 3: A refresh posts only missing comments
// ---------------------------------------------------------------------------

const REVIEW_NOTES_POSTED = "<!-- team:pr-comment review-notes -->\n\n## Review notes\n\n- [code-reviewer, round 1] Minor: an earlier finding.\n";

test("refresh skips keys the viewer already posted and posts the rest", async (t) => {
  await t.test("a viewer comment with the marker skips", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const existing = JSON.stringify({ comments: [
      { author: { login: "mboston" }, body: REVIEW_NOTES_POSTED, url: "https://github.com/acme/app/pull/7#issuecomment-1", viewerDidAuthor: true },
    ] });
    const manifest = manifestOf(runScript(["--out", out, "--existing", writeInput(root, "existing.json", existing), "--findings", writeInput(root, "findings.md", FINDINGS)]));

    assert.deepEqual(manifest, { post: [], skip: [{ key: "review-notes" }], refused: [] });
    assert.deepEqual(readdirSync(out), []);
  });

  await t.test("a viewer marker line ending in \\r skips", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const existing = JSON.stringify({ comments: [
      { author: { login: "mboston" }, body: "<!-- team:pr-comment review-notes -->\r\n\r\n## Review notes\r\n", url: "https://github.com/acme/app/pull/7#issuecomment-1", viewerDidAuthor: true },
    ] });
    const manifest = manifestOf(runScript(["--out", out, "--existing", writeInput(root, "existing.json", existing), "--findings", writeInput(root, "findings.md", FINDINGS)]));

    assert.deepEqual(manifest, { post: [], skip: [{ key: "review-notes" }], refused: [] });
    assert.deepEqual(readdirSync(out), []);
  });

  await t.test("a non-viewer comment with the marker posts", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const existing = JSON.stringify({ comments: [
      { author: { login: "someone-else" }, body: REVIEW_NOTES_POSTED, url: "https://github.com/acme/app/pull/7#issuecomment-1", viewerDidAuthor: false },
    ] });
    const manifest = manifestOf(runScript(["--out", out, "--existing", writeInput(root, "existing.json", existing), "--findings", writeInput(root, "findings.md", FINDINGS)]));

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["review-notes"]);
    assert.deepEqual(manifest.skip, []);
    assert.deepEqual(readdirSync(out), ["review-notes.md"]);
  });

  await t.test("a viewer comment with the marker on line 2 posts", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const existing = JSON.stringify({ comments: [
      { author: { login: "mboston" }, body: "Quoting the old marker:\n<!-- team:pr-comment review-notes -->\n", url: "https://github.com/acme/app/pull/7#issuecomment-1", viewerDidAuthor: true },
    ] });
    const manifest = manifestOf(runScript(["--out", out, "--existing", writeInput(root, "existing.json", existing), "--findings", writeInput(root, "findings.md", FINDINGS)]));

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["review-notes"]);
    assert.deepEqual(manifest.skip, []);
    assert.deepEqual(readdirSync(out), ["review-notes.md"]);
  });

  await t.test("review-notes present and design-round-2 missing posts only design-round-2", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const existing = JSON.stringify({ comments: [
      { author: { login: "mboston" }, body: REVIEW_NOTES_POSTED, url: "https://github.com/acme/app/pull/7#issuecomment-1", viewerDidAuthor: true },
    ] });
    const notes = notesFile(root, `\n${ROUND_TWO_BLOCK}\n`);
    const manifest = manifestOf(runScript(["--out", out, "--existing", writeInput(root, "existing.json", existing), "--findings", writeInput(root, "findings.md", FINDINGS), "--notes", notes]));

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["design-round-2"]);
    assert.deepEqual(manifest.skip, [{ key: "review-notes" }]);
    assert.deepEqual(readdirSync(out), ["design-round-2.md"]);
  });
});

test("malformed existing-comments input exits 2 and writes nothing", async (t) => {
  await t.test("invalid JSON", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const run = runScript(["--out", out, "--existing", writeInput(root, "existing.json", '{"comments": [\n'), "--findings", writeInput(root, "findings.md", FINDINGS)]);

    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /^review-comments\.mjs: /);
    assert.equal(run.stdout, "");
    assert.deepEqual(readdirSync(out), []);
  });

  await t.test("a comment without body", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const existing = JSON.stringify({ comments: [
      { author: { login: "mboston" }, url: "https://github.com/acme/app/pull/7#issuecomment-1", viewerDidAuthor: true },
    ] });
    const run = runScript(["--out", out, "--existing", writeInput(root, "existing.json", existing), "--findings", writeInput(root, "findings.md", FINDINGS)]);

    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /^review-comments\.mjs: /);
    assert.equal(run.stdout, "");
    assert.deepEqual(readdirSync(out), []);
  });

  await t.test("a comment without viewerDidAuthor", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const existing = JSON.stringify({ comments: [
      { author: { login: "mboston" }, body: REVIEW_NOTES_POSTED, url: "https://github.com/acme/app/pull/7#issuecomment-1" },
    ] });
    const run = runScript(["--out", out, "--existing", writeInput(root, "existing.json", existing), "--findings", writeInput(root, "findings.md", FINDINGS)]);

    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /^review-comments\.mjs: /);
    assert.equal(run.stdout, "");
    assert.deepEqual(readdirSync(out), []);
  });
});

// ---------------------------------------------------------------------------
// Slice 4: Invalid inputs fail loudly
// ---------------------------------------------------------------------------

test("invalid notes, output directory, or arguments exit 2 and write nothing", async (t) => {
  await t.test("a notes file without frontmatter", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const notes = writeInput(root, "cross-model-notes.md", "> **Design round 1**\n> ### Cross-model disposition\n> - **Adopted, suggestion:** Round one finding.\n");
    const run = runScript(["--out", out, "--existing", writeInput(root, "existing.json", NO_COMMENTS), "--findings", writeInput(root, "findings.md", FINDINGS), "--notes", notes]);

    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /^review-comments\.mjs: /);
    assert.equal(run.stdout, "");
    assert.deepEqual(readdirSync(out), []);
  });

  await t.test("a notes path that is a directory", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const notes = join(root, "notes-dir");
    mkdirSync(notes);
    const run = runScript(["--out", out, "--existing", writeInput(root, "existing.json", NO_COMMENTS), "--findings", writeInput(root, "findings.md", FINDINGS), "--notes", notes]);

    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /^review-comments\.mjs: /);
    assert.equal(run.stdout, "");
    assert.deepEqual(readdirSync(out), []);
  });

  await t.test("an --out that does not exist", (t) => {
    const root = scratch(t);
    const out = join(root, "missing-out");
    const run = runScript(["--out", out, "--existing", writeInput(root, "existing.json", NO_COMMENTS), "--findings", writeInput(root, "findings.md", FINDINGS)]);

    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /^review-comments\.mjs: /);
    assert.equal(run.stdout, "");
    assert.equal(existsSync(out), false, "the script created the missing --out directory");
  });

  await t.test("an --out that holds a file", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    writeFileSync(join(out, "stale.md"), "left by an earlier run\n");
    const run = runScript(["--out", out, "--existing", writeInput(root, "existing.json", NO_COMMENTS), "--findings", writeInput(root, "findings.md", FINDINGS)]);

    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /^review-comments\.mjs: /);
    assert.equal(run.stdout, "");
    assert.deepEqual(readdirSync(out), ["stale.md"]);
  });

  await t.test("no --existing flag", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const run = runScript(["--out", out, "--findings", writeInput(root, "findings.md", FINDINGS)]);

    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /^review-comments\.mjs: /);
    assert.equal(run.stdout, "");
    assert.deepEqual(readdirSync(out), []);
  });

  await t.test("a --verdict of APPROVE", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const run = runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", NO_REVIEWS),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      ...reviewFlags(root, { verdict: "APPROVE", reviewed: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a" }),
    ]);

    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /^review-comments\.mjs: /);
    assert.equal(run.stdout, "");
    assert.deepEqual(readdirSync(out), []);
  });

  await t.test("a --reviewed in uppercase", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const run = runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", NO_REVIEWS),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      ...reviewFlags(root, { verdict: "comment", reviewed: "3F1C9A7E5B2D4C6A8E0F1B3D5C7A9E2F4B6D8C0A" }),
    ]);

    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /^review-comments\.mjs: /);
    assert.equal(run.stdout, "");
    assert.deepEqual(readdirSync(out), []);
  });

  await t.test("a --reviewed of 39 characters", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const run = runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", NO_REVIEWS),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      ...reviewFlags(root, { verdict: "comment", reviewed: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0" }),
    ]);

    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /^review-comments\.mjs: /);
    assert.equal(run.stdout, "");
    assert.deepEqual(readdirSync(out), []);
  });

  await t.test("--verdict without --reviewed", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const run = runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", NO_REVIEWS),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      "--verdict", "comment",
      "--viewer", writeInput(root, "viewer.json", VIEWER_JSON),
      "--review-findings", writeInput(root, "review-findings.md", REVIEW_FINDINGS),
      "--since-review", writeInput(root, "since-review.txt", ""),
    ]);

    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /^review-comments\.mjs: /);
    assert.equal(run.stdout, "");
    assert.deepEqual(readdirSync(out), []);
  });

  await t.test("--verdict without --viewer", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const run = runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", NO_REVIEWS),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      "--verdict", "comment",
      "--reviewed", "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a",
      "--review-findings", writeInput(root, "review-findings.md", REVIEW_FINDINGS),
      "--since-review", writeInput(root, "since-review.txt", ""),
    ]);

    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /^review-comments\.mjs: /);
    assert.equal(run.stdout, "");
    assert.deepEqual(readdirSync(out), []);
  });

  await t.test("--verdict without --review-findings", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const run = runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", NO_REVIEWS),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      "--verdict", "comment",
      "--reviewed", "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a",
      "--viewer", writeInput(root, "viewer.json", VIEWER_JSON),
      "--since-review", writeInput(root, "since-review.txt", ""),
    ]);

    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /^review-comments\.mjs: /);
    assert.equal(run.stdout, "");
    assert.deepEqual(readdirSync(out), []);
  });

  await t.test("--reviewed without --verdict", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const run = runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", NO_REVIEWS),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      "--reviewed", "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a",
    ]);

    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /^review-comments\.mjs: /);
    assert.equal(run.stdout, "");
    assert.deepEqual(readdirSync(out), []);
  });

  await t.test("--viewer without --verdict", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const run = runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", NO_REVIEWS),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      "--viewer", writeInput(root, "viewer.json", VIEWER_JSON),
    ]);

    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /^review-comments\.mjs: /);
    assert.equal(run.stdout, "");
    assert.deepEqual(readdirSync(out), []);
  });

  await t.test("--review-findings without --verdict", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const run = runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", NO_REVIEWS),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      "--review-findings", writeInput(root, "review-findings.md", REVIEW_FINDINGS),
    ]);

    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /^review-comments\.mjs: /);
    assert.equal(run.stdout, "");
    assert.deepEqual(readdirSync(out), []);
  });

  await t.test("--verdict without --since-review", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const run = runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", NO_REVIEWS),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      "--verdict", "comment",
      "--reviewed", "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a",
      "--viewer", writeInput(root, "viewer.json", VIEWER_JSON),
      "--review-findings", writeInput(root, "review-findings.md", REVIEW_FINDINGS),
    ]);

    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /^review-comments\.mjs: /);
    assert.equal(run.stdout, "");
    assert.deepEqual(readdirSync(out), []);
  });

  await t.test("--since-review without --verdict", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const run = runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", NO_REVIEWS),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      "--since-review", writeInput(root, "since-review.txt", ""),
    ]);

    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /^review-comments\.mjs: /);
    assert.equal(run.stdout, "");
    assert.deepEqual(readdirSync(out), []);
  });
});

// ---------------------------------------------------------------------------
// The PR carries Team's code review once per reviewed commit
// ---------------------------------------------------------------------------

// The verdict and commit lines are pinned here; the script holds them as named constants.
test("a verdict run posts the code review after the comments with its verdict, commit, and findings", async (t) => {
  await t.test("a comment verdict on a 40-hex commit with two findings", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const reviewFindings = `- [code-reviewer] Minor: rename retryCount to retryBudget in uploader.mjs:42.
- [security-reviewer] LOW: the retry log line prints the upload URL with its query string.
`;
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", NO_REVIEWS),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      ...reviewFlags(root, { verdict: "comment", reviewed: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a", reviewFindings }),
    ]));

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["review-notes", "code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a"]);
    assert.equal(manifest.post[1].verdict, "comment");
    const bodies = postedBodies(manifest);
    const review = bodies["code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a"];
    assert.ok(
      review.startsWith("<!-- team:pr-review code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a -->\n\n**Verdict: COMMENT**\nReviewed commit: `3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a`\n"),
      `the review does not open with its marker, verdict line, and commit line:\n${review}`,
    );
    assert.ok(review.endsWith(`\n\n${reviewFindings}`), `the review does not end with the findings verbatim:\n${review}`);
    assertEveryNotesLineOnce(reviewFindings, bodies);
    assert.ok(!bodies["review-notes"].includes("rename retryCount to retryBudget"), `a code review finding landed in review-notes:\n${bodies["review-notes"]}`);
    assert.ok(!bodies["review-notes"].includes("prints the upload URL"), `a code review finding landed in review-notes:\n${bodies["review-notes"]}`);
  });

  await t.test("a request-changes verdict on a 64-hex commit", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const reviewFindings = `- [code-reviewer] Blocking: the upload retry loop never stops after five failures in uploader.mjs:57.
- [verifier] Major: no test covers the retry budget in tests/uploader.test.mjs.
`;
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", NO_REVIEWS),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      ...reviewFlags(root, { verdict: "request-changes", reviewed: "9b4e2d7c1a6f3e8b5d0c2a7f4e9b1d6c3a8f5e2b7d4c9a1f6e3b8d5c0a2f7e4b", reviewFindings }),
    ]));

    assert.deepEqual(manifest.post.map((entry) => entry.key), [
      "review-notes",
      "code-review-9b4e2d7c1a6f3e8b5d0c2a7f4e9b1d6c3a8f5e2b7d4c9a1f6e3b8d5c0a2f7e4b",
    ]);
    assert.equal(manifest.post[1].verdict, "request-changes");
    const bodies = postedBodies(manifest);
    const review = bodies["code-review-9b4e2d7c1a6f3e8b5d0c2a7f4e9b1d6c3a8f5e2b7d4c9a1f6e3b8d5c0a2f7e4b"];
    assert.ok(
      review.startsWith(
        "<!-- team:pr-review code-review-9b4e2d7c1a6f3e8b5d0c2a7f4e9b1d6c3a8f5e2b7d4c9a1f6e3b8d5c0a2f7e4b -->\n\n**Verdict: REQUEST CHANGES**\nReviewed commit: `9b4e2d7c1a6f3e8b5d0c2a7f4e9b1d6c3a8f5e2b7d4c9a1f6e3b8d5c0a2f7e4b`\n",
      ),
      `the review does not open with its marker, verdict line, and commit line:\n${review}`,
    );
    assert.ok(review.endsWith(`\n\n${reviewFindings}`), `the review does not end with the findings verbatim:\n${review}`);
    assertEveryNotesLineOnce(reviewFindings, bodies);
    assert.ok(!bodies["review-notes"].includes("never stops after five failures"), `a code review finding landed in review-notes:\n${bodies["review-notes"]}`);
    assert.ok(!bodies["review-notes"].includes("no test covers the retry budget"), `a code review finding landed in review-notes:\n${bodies["review-notes"]}`);
  });

  await t.test("a whitespace-only review-findings file says No findings.", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", NO_REVIEWS),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      ...reviewFlags(root, { verdict: "approve", reviewed: "c0ffee1234567890abcdef0123456789abcdef01", reviewFindings: "  \n\n\t\n" }),
    ]));

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["review-notes", "code-review-c0ffee1234567890abcdef0123456789abcdef01"]);
    assert.equal(manifest.post[1].verdict, "approve");
    const review = postedBodies(manifest)["code-review-c0ffee1234567890abcdef0123456789abcdef01"];
    assert.ok(
      review.startsWith("<!-- team:pr-review code-review-c0ffee1234567890abcdef0123456789abcdef01 -->\n\n**Verdict: APPROVE**\nReviewed commit: `c0ffee1234567890abcdef0123456789abcdef01`\n"),
      `the review does not open with its marker, verdict line, and commit line:\n${review}`,
    );
    assert.ok(review.endsWith("\n\nNo findings.\n"), `the review does not end with "No findings.":\n${review}`);
  });
});

// A comment-verdict review with no reasons is this head, the findings, and one newline.
const SIZE_REVIEW_HEAD =
  "<!-- team:pr-review code-review-5e8d1a4c7b0f3e6d9c2b5a8f1e4d7c0b3a6f9e2d -->\n\n**Verdict: COMMENT**\nReviewed commit: `5e8d1a4c7b0f3e6d9c2b5a8f1e4d7c0b3a6f9e2d`\n\n";
const reviewFindingsForBody = (characters) => `- ${"x".repeat(characters - SIZE_REVIEW_HEAD.length - "- ".length - "\n".length)}\n`;
const REVIEW_MARKER = "<!-- team:pr-review code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a -->";

test("the code review posts, skips, or is refused while the comments always post", async (t) => {
  await t.test("an empty reviews array posts", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", NO_REVIEWS),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      ...reviewFlags(root, { verdict: "comment", reviewed: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a" }),
    ]));

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["review-notes", "code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a"]);
  });

  await t.test("a marker review from another login posts", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const existing = JSON.stringify({ author: { login: "pr-opener" }, comments: [], reviews: [
      { author: { login: "someone-else" }, body: `${REVIEW_MARKER}\n\n**Verdict: COMMENT**\n`, state: "COMMENTED", submittedAt: "2026-10-08T12:00:00Z" },
    ] });
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", existing),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      ...reviewFlags(root, { verdict: "comment", reviewed: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a" }),
    ]));

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["review-notes", "code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a"]);
    assert.deepEqual(manifest.skip, []);
  });

  await t.test("a viewer review for another commit posts", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const existing = JSON.stringify({ author: { login: "pr-opener" }, comments: [], reviews: [
      { author: { login: "mboston" }, body: "<!-- team:pr-review code-review-c0ffee1234567890abcdef0123456789abcdef01 -->\n\n**Verdict: COMMENT**\n", state: "COMMENTED", submittedAt: "2026-10-08T12:00:00Z" },
    ] });
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", existing),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      ...reviewFlags(root, { verdict: "comment", reviewed: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a" }),
    ]));

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["review-notes", "code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a"]);
    assert.deepEqual(manifest.skip, []);
  });

  await t.test("a viewer review with the marker on line 2 posts", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const existing = JSON.stringify({ author: { login: "pr-opener" }, comments: [], reviews: [
      { author: { login: "mboston" }, body: `Quoting the old marker:\n${REVIEW_MARKER}\n`, state: "COMMENTED", submittedAt: "2026-10-08T12:00:00Z" },
    ] });
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", existing),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      ...reviewFlags(root, { verdict: "comment", reviewed: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a" }),
    ]));

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["review-notes", "code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a"]);
    assert.deepEqual(manifest.skip, []);
  });

  await t.test("a marker review with a null author posts", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const existing = JSON.stringify({ author: { login: "pr-opener" }, comments: [], reviews: [
      { author: null, body: `${REVIEW_MARKER}\n\n**Verdict: COMMENT**\n`, state: "COMMENTED", submittedAt: "2026-10-08T12:00:00Z" },
    ] });
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", existing),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      ...reviewFlags(root, { verdict: "comment", reviewed: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a" }),
    ]));

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["review-notes", "code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a"]);
    assert.deepEqual(manifest.skip, []);
  });

  await t.test("a viewer review with a non-string body posts", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const existing = JSON.stringify({ author: { login: "pr-opener" }, comments: [], reviews: [
      { author: { login: "mboston" }, body: null, state: "COMMENTED", submittedAt: "2026-10-08T12:00:00Z" },
    ] });
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", existing),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      ...reviewFlags(root, { verdict: "comment", reviewed: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a" }),
    ]));

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["review-notes", "code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a"]);
    assert.deepEqual(manifest.skip, []);
  });

  await t.test("a review body of exactly 65536 characters posts", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", NO_REVIEWS),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      ...reviewFlags(root, { verdict: "comment", reviewed: "5e8d1a4c7b0f3e6d9c2b5a8f1e4d7c0b3a6f9e2d", reviewFindings: reviewFindingsForBody(65536) }),
    ]));

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["review-notes", "code-review-5e8d1a4c7b0f3e6d9c2b5a8f1e4d7c0b3a6f9e2d"]);
    assert.equal(manifest.post[1].characters, 65536);
    assert.deepEqual(manifest.refused, []);
  });

  await t.test("a viewer review whose line 1 is the marker skips", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const existing = JSON.stringify({ author: { login: "pr-opener" }, comments: [], reviews: [
      { author: { login: "mboston" }, body: `${REVIEW_MARKER}\n\n**Verdict: COMMENT**\n`, state: "COMMENTED", submittedAt: "2026-10-08T12:00:00Z" },
    ] });
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", existing),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      ...reviewFlags(root, { verdict: "comment", reviewed: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a" }),
    ]));

    assert.deepEqual(manifest.skip, [{ key: "code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a" }]);
    assert.deepEqual(manifest.post.map((entry) => entry.key), ["review-notes"]);
  });

  await t.test("a viewer marker line ending in \\r skips", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const existing = JSON.stringify({ author: { login: "pr-opener" }, comments: [], reviews: [
      { author: { login: "mboston" }, body: `${REVIEW_MARKER}\r\n\r\n**Verdict: COMMENT**\r\n`, state: "COMMENTED", submittedAt: "2026-10-08T12:00:00Z" },
    ] });
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", existing),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      ...reviewFlags(root, { verdict: "comment", reviewed: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a" }),
    ]));

    assert.deepEqual(manifest.skip, [{ key: "code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a" }]);
    assert.deepEqual(manifest.post.map((entry) => entry.key), ["review-notes"]);
  });

  await t.test("a dismissed viewer review skips", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const existing = JSON.stringify({ author: { login: "pr-opener" }, comments: [], reviews: [
      { author: { login: "mboston" }, body: `${REVIEW_MARKER}\n\n**Verdict: COMMENT**\n`, state: "DISMISSED", submittedAt: "2026-10-08T12:00:00Z" },
    ] });
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", existing),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      ...reviewFlags(root, { verdict: "comment", reviewed: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a" }),
    ]));

    assert.deepEqual(manifest.skip, [{ key: "code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a" }]);
    assert.deepEqual(manifest.post.map((entry) => entry.key), ["review-notes"]);
  });

  await t.test("an --existing with no reviews array refuses the review", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const existing = JSON.stringify({ author: { login: "pr-opener" }, comments: [] });
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", existing),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      ...reviewFlags(root, { verdict: "comment", reviewed: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a" }),
    ]));

    assert.deepEqual(manifest.refused.map((entry) => entry.key), ["code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a"]);
    assert.deepEqual(manifest.post.map((entry) => entry.key), ["review-notes"]);
  });

  await t.test("a viewer file without a string login refuses the review", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", NO_REVIEWS),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      ...reviewFlags(root, { verdict: "comment", reviewed: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a", viewer: '{"id":583231}\n' }),
    ]));

    assert.deepEqual(manifest.refused.map((entry) => entry.key), ["code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a"]);
    assert.deepEqual(manifest.post.map((entry) => entry.key), ["review-notes"]);
  });

  await t.test("an absent review-findings file refuses the review", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", NO_REVIEWS),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      ...reviewFlags(root, { verdict: "comment", reviewed: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a", reviewFindingsPath: join(root, "absent-review-findings.md") }),
    ]));

    assert.deepEqual(manifest.refused.map((entry) => entry.key), ["code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a"]);
    assert.deepEqual(manifest.post.map((entry) => entry.key), ["review-notes"]);
  });

  await t.test("a review-findings path that is a directory refuses the review", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const reviewFindingsPath = join(root, "review-findings-dir");
    mkdirSync(reviewFindingsPath);
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", NO_REVIEWS),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      ...reviewFlags(root, { verdict: "comment", reviewed: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a", reviewFindingsPath }),
    ]));

    assert.deepEqual(manifest.refused.map((entry) => entry.key), ["code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a"]);
    assert.deepEqual(manifest.post.map((entry) => entry.key), ["review-notes"]);
  });

  await t.test("a review body of 65537 characters refuses the review", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", NO_REVIEWS),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      ...reviewFlags(root, { verdict: "comment", reviewed: "5e8d1a4c7b0f3e6d9c2b5a8f1e4d7c0b3a6f9e2d", reviewFindings: reviewFindingsForBody(65537) }),
    ]));

    assert.deepEqual(manifest.refused.map((entry) => entry.key), ["code-review-5e8d1a4c7b0f3e6d9c2b5a8f1e4d7c0b3a6f9e2d"]);
    assert.deepEqual(manifest.post.map((entry) => entry.key), ["review-notes"]);
  });

  await t.test("an --existing without a string author.login refuses the review", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const existing = JSON.stringify({ author: null, comments: [], reviews: [] });
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", existing),
      "--findings", writeInput(root, "findings.md", DESIGN_FINDINGS),
      ...reviewFlags(root, { verdict: "comment", reviewed: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a" }),
    ]));

    assert.deepEqual(manifest.refused.map((entry) => entry.key), ["code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a"]);
    assert.deepEqual(manifest.post.map((entry) => entry.key), ["review-notes"]);
  });
});

// ---------------------------------------------------------------------------
// The review event follows the verdict
// ---------------------------------------------------------------------------

// The reason lines are pinned here; the script holds them as named constants.
const SELF_AUTHORED_LINE = "This review posts as a comment, because GitHub does not accept an approval or a change request from the PR author.";
const HEAD_CHANGED_LINE = "This review posts as a comment, because the PR head has changes outside `CHANGELOG.md` that no Team reviewer saw.";
const SCOPE_UNKNOWN_LINE = "This review posts as a comment, because the reviewed commit could not be compared with the PR head.";
const OTHER_AUTHOR = JSON.stringify({ author: { login: "pr-opener" }, comments: [], reviews: [] });
const VIEWER_AUTHOR = JSON.stringify({ author: { login: "mboston" }, comments: [], reviews: [] });

test("the code review event follows the verdict unless the viewer opened the PR or the head changed after review", async (t) => {
  await t.test("approve, another author, an empty scope diff: approve", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", OTHER_AUTHOR),
      ...reviewFlags(root, { verdict: "approve", reviewed: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a", sinceReview: "" }),
    ]));

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a"]);
    assert.equal(manifest.post[0].event, "approve");
    assert.deepEqual(manifest.post[0].reasons, []);
    const review = readFileSync(manifest.post[0].file, "utf8");
    assert.ok(
      review.startsWith(`${REVIEW_MARKER}\n\n**Verdict: APPROVE**\nReviewed commit: \`3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a\`\n\n`),
      `the commit line is not followed by a blank line:\n${review}`,
    );
  });

  await t.test("approve, another author, CHANGELOG.md only: approve", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", OTHER_AUTHOR),
      ...reviewFlags(root, { verdict: "approve", reviewed: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a", sinceReview: "CHANGELOG.md\n" }),
    ]));

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a"]);
    assert.equal(manifest.post[0].event, "approve");
    assert.deepEqual(manifest.post[0].reasons, []);
    const review = readFileSync(manifest.post[0].file, "utf8");
    assert.ok(
      review.startsWith(`${REVIEW_MARKER}\n\n**Verdict: APPROVE**\nReviewed commit: \`3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a\`\n\n`),
      `the commit line is not followed by a blank line:\n${review}`,
    );
  });

  await t.test("request-changes, another author, an empty scope diff: request-changes", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", OTHER_AUTHOR),
      ...reviewFlags(root, { verdict: "request-changes", reviewed: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a", sinceReview: "" }),
    ]));

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a"]);
    assert.equal(manifest.post[0].event, "request-changes");
    assert.deepEqual(manifest.post[0].reasons, []);
    const review = readFileSync(manifest.post[0].file, "utf8");
    assert.ok(
      review.startsWith(`${REVIEW_MARKER}\n\n**Verdict: REQUEST CHANGES**\nReviewed commit: \`3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a\`\n\n`),
      `the commit line is not followed by a blank line:\n${review}`,
    );
  });

  await t.test("comment, the viewer is the author: comment with no reasons", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", VIEWER_AUTHOR),
      ...reviewFlags(root, { verdict: "comment", reviewed: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a", sinceReview: "" }),
    ]));

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a"]);
    assert.equal(manifest.post[0].event, "comment");
    assert.deepEqual(manifest.post[0].reasons, []);
    const review = readFileSync(manifest.post[0].file, "utf8");
    assert.ok(
      review.startsWith(`${REVIEW_MARKER}\n\n**Verdict: COMMENT**\nReviewed commit: \`3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a\`\n\n`),
      `the commit line is not followed by a blank line:\n${review}`,
    );
  });

  await t.test("approve, logins that differ only in case: comment, self-authored", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const existing = JSON.stringify({ author: { login: "MBoston" }, comments: [], reviews: [] });
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", existing),
      ...reviewFlags(root, { verdict: "approve", reviewed: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a", sinceReview: "" }),
    ]));

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a"]);
    assert.equal(manifest.post[0].event, "comment");
    assert.deepEqual(manifest.post[0].reasons, ["self-authored"]);
    const review = readFileSync(manifest.post[0].file, "utf8");
    assert.ok(
      review.startsWith(`${REVIEW_MARKER}\n\n**Verdict: APPROVE**\nReviewed commit: \`3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a\`\n${SELF_AUTHORED_LINE}\n\n`),
      `the self-authored line does not follow the commit line:\n${review}`,
    );
  });

  await t.test("request-changes, the viewer is the author: comment, self-authored", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", VIEWER_AUTHOR),
      ...reviewFlags(root, { verdict: "request-changes", reviewed: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a", sinceReview: "" }),
    ]));

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a"]);
    assert.equal(manifest.post[0].event, "comment");
    assert.deepEqual(manifest.post[0].reasons, ["self-authored"]);
    const review = readFileSync(manifest.post[0].file, "utf8");
    assert.ok(
      review.startsWith(`${REVIEW_MARKER}\n\n**Verdict: REQUEST CHANGES**\nReviewed commit: \`3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a\`\n${SELF_AUTHORED_LINE}\n\n`),
      `the self-authored line does not follow the commit line:\n${review}`,
    );
  });

  await t.test("approve, another author, CHANGELOG.md and src/uploader.mjs: comment, head-changed", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", OTHER_AUTHOR),
      ...reviewFlags(root, { verdict: "approve", reviewed: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a", sinceReview: "CHANGELOG.md\nsrc/uploader.mjs\n" }),
    ]));

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a"]);
    assert.equal(manifest.post[0].event, "comment");
    assert.deepEqual(manifest.post[0].reasons, ["head-changed"]);
    const review = readFileSync(manifest.post[0].file, "utf8");
    assert.ok(
      review.startsWith(`${REVIEW_MARKER}\n\n**Verdict: APPROVE**\nReviewed commit: \`3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a\`\n${HEAD_CHANGED_LINE}\n\n`),
      `the head-changed line does not follow the commit line:\n${review}`,
    );
  });

  await t.test("approve, another author, a nested packages/a/CHANGELOG.md: comment, head-changed", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", OTHER_AUTHOR),
      ...reviewFlags(root, { verdict: "approve", reviewed: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a", sinceReview: "packages/a/CHANGELOG.md\n" }),
    ]));

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a"]);
    assert.equal(manifest.post[0].event, "comment");
    assert.deepEqual(manifest.post[0].reasons, ["head-changed"]);
    const review = readFileSync(manifest.post[0].file, "utf8");
    assert.ok(
      review.startsWith(`${REVIEW_MARKER}\n\n**Verdict: APPROVE**\nReviewed commit: \`3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a\`\n${HEAD_CHANGED_LINE}\n\n`),
      `the head-changed line does not follow the commit line:\n${review}`,
    );
  });

  await t.test("approve, another author, an absent scope file: comment, scope-unknown", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", OTHER_AUTHOR),
      ...reviewFlags(root, { verdict: "approve", reviewed: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a", sinceReviewPath: join(root, "absent-since-review.txt") }),
    ]));

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a"]);
    assert.equal(manifest.post[0].event, "comment");
    assert.deepEqual(manifest.post[0].reasons, ["scope-unknown"]);
    const review = readFileSync(manifest.post[0].file, "utf8");
    assert.ok(
      review.startsWith(`${REVIEW_MARKER}\n\n**Verdict: APPROVE**\nReviewed commit: \`3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a\`\n${SCOPE_UNKNOWN_LINE}\n\n`),
      `the scope-unknown line does not follow the commit line:\n${review}`,
    );
  });

  await t.test("approve, another author, a scope path that is a directory: comment, scope-unknown", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const sinceReviewPath = join(root, "since-review-dir");
    mkdirSync(sinceReviewPath);
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", OTHER_AUTHOR),
      ...reviewFlags(root, { verdict: "approve", reviewed: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a", sinceReviewPath }),
    ]));

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a"]);
    assert.equal(manifest.post[0].event, "comment");
    assert.deepEqual(manifest.post[0].reasons, ["scope-unknown"]);
    const review = readFileSync(manifest.post[0].file, "utf8");
    assert.ok(
      review.startsWith(`${REVIEW_MARKER}\n\n**Verdict: APPROVE**\nReviewed commit: \`3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a\`\n${SCOPE_UNKNOWN_LINE}\n\n`),
      `the scope-unknown line does not follow the commit line:\n${review}`,
    );
  });

  await t.test("approve, the viewer is the author, src/uploader.mjs: comment, self-authored then head-changed", (t) => {
    const root = scratch(t);
    const out = emptyOut(root);
    const manifest = manifestOf(runScript([
      "--out", out,
      "--existing", writeInput(root, "existing.json", VIEWER_AUTHOR),
      ...reviewFlags(root, { verdict: "approve", reviewed: "3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a", sinceReview: "src/uploader.mjs\n" }),
    ]));

    assert.deepEqual(manifest.post.map((entry) => entry.key), ["code-review-3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a"]);
    assert.equal(manifest.post[0].event, "comment");
    assert.deepEqual(manifest.post[0].reasons, ["self-authored", "head-changed"]);
    const review = readFileSync(manifest.post[0].file, "utf8");
    assert.ok(
      review.startsWith(`${REVIEW_MARKER}\n\n**Verdict: APPROVE**\nReviewed commit: \`3f1c9a7e5b2d4c6a8e0f1b3d5c7a9e2f4b6d8c0a\`\n${SELF_AUTHORED_LINE}\n${HEAD_CHANGED_LINE}\n\n`),
      `the reason lines do not follow the commit line in order:\n${review}`,
    );
  });
});
