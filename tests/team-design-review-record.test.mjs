// Acceptance tests for skills/team-design/scripts/review-record.mjs: the script that
// reads the design-review gate state and records each review round.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const SCRIPT = resolve("skills/team-design/scripts/review-record.mjs");
const REVIEW_COMMENTS = resolve("skills/team-pr/scripts/review-comments.mjs");
const DESIGN = "---\ntopic: add-rate-limiting\ndate: 2026-10-01\nphase: design\nrevision: 0\n---\n\n# Design\n";
const DATE = "2026-10-21";

function planDir(t, files = {}) {
  const root = mkdtempSync(join(tmpdir(), "review-record-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, "plan");
  mkdirSync(dir);
  for (const [name, text] of Object.entries({ "6-design.md": DESIGN, ...files })) writeFileSync(join(dir, name), text);
  return dir;
}

function reviewRecord(verdict) {
  return `---\ntopic: add-rate-limiting\ndate: 2026-10-01\nphase: design-review\nverdict: ${verdict}\n---\n\nbody\n`;
}

function run(...args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
}

function recordReport(dir, report) {
  const reportFile = join(dir, "..", "report.md");
  writeFileSync(reportFile, report);
  return run("record", dir, reportFile, "--date", DATE);
}

test("status is pending round 1 when no record exists", (t) => {
  const result = run("status", planDir(t));
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "pending 1\n");
});

test("status passes on the highest record when it carries APPROVE or COMMENT", (t) => {
  for (const verdict of ["APPROVE", "COMMENT"]) {
    const dir = planDir(t, { "design-review-1.md": reviewRecord("REQUEST CHANGES"), "design-review-2.md": reviewRecord(verdict) });
    assert.equal(run("status", dir).stdout, "passed 2\n");
  }
});

test("status compares round numbers numerically, not as text", (t) => {
  const dir = planDir(t, { "design-review-9.md": reviewRecord("APPROVE"), "design-review-10.md": reviewRecord("REQUEST CHANGES") });
  assert.equal(run("status", dir).stdout, "pending 11\n");
});

test("status fails closed on a highest record without readable frontmatter", (t) => {
  const dir = planDir(t, { "design-review-1.md": "verdict: APPROVE\n" });
  assert.equal(run("status", dir).stdout, "pending 2\n");
});

test("record writes the next round with the last verdict token and the report verbatim", (t) => {
  const dir = planDir(t, { "design-review-1.md": reviewRecord("REQUEST CHANGES") });
  const report = "## Findings\n\n- An earlier round said APPROVE; that is quoted, not the verdict.\n\n**Verdict: REQUEST CHANGES**\n";
  const result = recordReport(dir, report);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "round 2\nverdict REQUEST CHANGES\n");
  assert.equal(
    readFileSync(join(dir, "design-review-2.md"), "utf8"),
    `---\ntopic: add-rate-limiting\ndate: ${DATE}\nphase: design-review\nverdict: REQUEST CHANGES\n---\n\n${report}`,
  );
});

test("record ignores words that only contain a verdict token", (t) => {
  const dir = planDir(t);
  const result = recordReport(dir, "COMMENT\n\nThe author APPROVED the COMMENTS.\n");
  assert.equal(result.stdout, "round 1\nverdict COMMENT\n");
});

test("record exits 3 and writes nothing when the report has no verdict token", (t) => {
  const dir = planDir(t);
  const result = recordReport(dir, "## Findings\n\nnone\n");
  assert.equal(result.status, 3);
  assert.match(result.stderr, /no verdict token/);
  assert.deepEqual(readdirSync(dir), ["6-design.md"]);
});

test("record appends the disposition section, wrapped and labeled, creating the notes file once", (t) => {
  const dir = planDir(t);
  const report = [
    "## Findings",
    "",
    "### Cross-model disposition",
    "",
    "#### codex",
    "",
    "- Adopted: the cache key omits the tenant.",
    "",
    "## Summary",
    "",
    "Fine.",
    "",
    "APPROVE",
    "",
  ].join("\n");
  assert.equal(recordReport(dir, report).stdout, "round 1\nverdict APPROVE\n");
  const block = "> **Design round 1**\n>\n> ### Cross-model disposition\n>\n> #### codex\n>\n> - Adopted: the cache key omits the tenant.";
  const header = `---\ntopic: add-rate-limiting\ndate: ${DATE}\nphase: cross-model-review\n---\n`;
  assert.equal(readFileSync(join(dir, "cross-model-notes.md"), "utf8"), `${header}\n${block}\n`);

  assert.equal(recordReport(dir, report).stdout, "round 2\nverdict APPROVE\n");
  assert.equal(readFileSync(join(dir, "cross-model-notes.md"), "utf8"), `${header}\n${block}\n\n${block.replace("round 1", "round 2")}\n`);
});

test("record keeps the terminal verdict line out of a trailing disposition section", (t) => {
  const dir = planDir(t);
  recordReport(dir, "### Cross-model disposition\n\nno findings from `agy`\n\n**COMMENT**\n");
  const notes = readFileSync(join(dir, "cross-model-notes.md"), "utf8");
  assert.ok(notes.endsWith("> ### Cross-model disposition\n>\n> no findings from `agy`\n"), notes);
});

test("record leaves the notes file absent when the report has no disposition section", (t) => {
  const dir = planDir(t);
  recordReport(dir, "APPROVE\n");
  assert.deepEqual(readdirSync(dir).sort(), ["6-design.md", "design-review-1.md"]);
});

test("review-comments.mjs reads a recorded block as its design round", (t) => {
  const dir = planDir(t);
  recordReport(dir, "### Cross-model disposition\n\n- Refuted: no race at store.mjs:12.\n\nAPPROVE\n");
  recordReport(dir, "### Cross-model disposition\n\n- Unverifiable: retry storm.\n\nAPPROVE\n");
  const out = join(dir, "..", "out");
  mkdirSync(out);
  const existing = join(dir, "..", "existing.json");
  writeFileSync(existing, '{"comments":[]}\n');
  const result = spawnSync(
    process.execPath,
    [REVIEW_COMMENTS, "--out", out, "--existing", existing, "--notes", join(dir, "cross-model-notes.md")],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).post.map((entry) => entry.key), ["design-round-1", "design-round-2"]);
});

test("record fails when 6-design.md is missing or has no topic", (t) => {
  const missing = planDir(t);
  rmSync(join(missing, "6-design.md"));
  const noDesign = recordReport(missing, "APPROVE\n");
  assert.equal(noDesign.status, 1);
  assert.match(noDesign.stderr, /missing .*6-design\.md/);

  const noTopic = planDir(t, { "6-design.md": "---\nphase: design\n---\n" });
  const result = recordReport(noTopic, "APPROVE\n");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no topic/);
  assert.deepEqual(readdirSync(noTopic), ["6-design.md"]);
});

test("record fails on a missing report file", (t) => {
  const dir = planDir(t);
  const result = run("record", dir, join(dir, "absent.md"), "--date", DATE);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing report file/);
});

test("both verbs fail on a plan dir that does not exist", (t) => {
  const absent = join(planDir(t), "absent");
  assert.equal(run("status", absent).status, 1);
  const result = run("record", absent, SCRIPT);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not a directory/);
});

test("malformed arguments are usage errors", (t) => {
  const dir = planDir(t);
  for (const args of [[], ["status"], ["status", dir, "extra"], ["record", dir], ["record", dir, SCRIPT, "--date", "21-10-2026"], ["record", dir, SCRIPT, "--when"], ["bogus", dir]]) {
    const result = run(...args);
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, /^review-record\.mjs: usage: /);
  }
});
