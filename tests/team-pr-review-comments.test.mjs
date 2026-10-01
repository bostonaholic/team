// Acceptance tests for skills/team-pr/scripts/review-comments.mjs: the script that turns
// deferred findings and cross-model-notes.md into the PR comments /team-pr posts.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const SCRIPT = resolve("skills/team-pr/scripts/review-comments.mjs");
const TRIAGE_STEPS = resolve("skills/pr-open-comments/references/04-execution.md");

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

// Source-text test kept by the retention bar (skills/team/references/testing.md, Retention
// bar): the marker is a published contract between two skills, and no runtime path joins them.
test("pr-open-comments skips the marker prefix that review-comments.mjs writes", (t) => {
  const root = scratch(t);
  const out = emptyOut(root);
  const run = runScript([
    "--out", out,
    "--existing", writeInput(root, "existing.json", NO_COMMENTS),
    "--findings", writeInput(root, "findings.md", FINDINGS),
  ]);
  const markerLine = readFileSync(manifestOf(run).post[0].file, "utf8").split("\n")[0];

  const stepThree = readFileSync(TRIAGE_STEPS, "utf8").split("### Step 3")[1].split("### Step 4")[0];
  const prefix = stepThree.match(/`(<!-- team:pr-comment [^`]*)`/);
  assert.ok(prefix, "step 3 of pr-open-comments/references/04-execution.md names no `<!-- team:pr-comment ` code span");
  assert.ok(markerLine.startsWith(prefix[1]), `marker line ${JSON.stringify(markerLine)} does not start with ${JSON.stringify(prefix[1])}`);
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
});
