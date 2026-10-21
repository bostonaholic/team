// Runs skills/team/scripts/design-review-status.sh, alone and behind discover-topic.sh, against scratch artifact directories.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const SCRIPT = resolve("skills/team/scripts/design-review-status.sh");
const DISCOVER = resolve("skills/team/discover-topic.sh");

function artifactDir(t, reviews = {}) {
  const dir = mkdtempSync(join(tmpdir(), "design-review-status-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [name, body] of Object.entries(reviews)) writeFileSync(join(dir, name), body);
  return dir;
}

const review = (verdict) => `---\ntopic: x\ndate: 2026-01-01\nphase: design-review\nverdict: ${verdict}\n---\n\nbody\n`;

function check(...args) {
  const run = spawnSync(SCRIPT, args, { encoding: "utf8" });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

test("passes an APPROVE verdict", (t) => {
  const dir = artifactDir(t, { "design-review-1.md": review("APPROVE") });
  assert.deepEqual(check(dir), { status: 0, stdout: `passed\t1\t${dir}/design-review-1.md\tAPPROVE\n`, stderr: "" });
});

test("passes a COMMENT verdict with trailing whitespace and a trailing slash on the directory", (t) => {
  const dir = artifactDir(t, { "design-review-1.md": review("COMMENT  ") });
  assert.equal(check(`${dir}/`).stdout, `passed\t1\t${dir}/design-review-1.md\tCOMMENT\n`);
});

test("REQUEST CHANGES is pending the next round", (t) => {
  const dir = artifactDir(t, { "design-review-1.md": review("REQUEST CHANGES") });
  assert.deepEqual(check(dir), { status: 1, stdout: `pending\t2\t${dir}/design-review-1.md\tREQUEST CHANGES\n`, stderr: "" });
});

test("judges only the highest-numbered review, compared numerically", (t) => {
  const dir = artifactDir(t, {
    "design-review-2.md": review("APPROVE"),
    "design-review-10.md": review("REQUEST CHANGES"),
    "design-review-x.md": review("APPROVE"),
  });
  assert.deepEqual(check(dir), { status: 1, stdout: `pending\t11\t${dir}/design-review-10.md\tREQUEST CHANGES\n`, stderr: "" });
});

test("reads a leading-zero round number as decimal", (t) => {
  const dir = artifactDir(t, { "design-review-09.md": review("APPROVE"), "design-review-8.md": review("REQUEST CHANGES") });
  assert.equal(check(dir).stdout, `passed\t9\t${dir}/design-review-09.md\tAPPROVE\n`);
});

test("a later passing round clears an earlier REQUEST CHANGES", (t) => {
  const dir = artifactDir(t, { "design-review-1.md": review("REQUEST CHANGES"), "design-review-2.md": review("APPROVE") });
  assert.equal(check(dir).stdout, `passed\t2\t${dir}/design-review-2.md\tAPPROVE\n`);
});

test("is pending round 1 when no review file exists", (t) => {
  const dir = artifactDir(t, { "6-design.md": "---\nphase: design\n---\n" });
  assert.deepEqual(check(dir), { status: 1, stdout: "pending\t1\t-\t-\n", stderr: "" });
});

test("ignores a verdict outside the frontmatter", (t) => {
  const dir = artifactDir(t, { "design-review-1.md": "---\ntopic: x\n---\n\nverdict: APPROVE\n" });
  assert.deepEqual(check(dir), { status: 1, stdout: `pending\t2\t${dir}/design-review-1.md\t-\n`, stderr: "" });
});

test("fails a file with no frontmatter", (t) => {
  const dir = artifactDir(t, { "design-review-1.md": "verdict: APPROVE\n" });
  assert.equal(check(dir).stdout, `pending\t2\t${dir}/design-review-1.md\t-\n`);
});

test("fails unclosed frontmatter", (t) => {
  const dir = artifactDir(t, { "design-review-1.md": "---\nverdict: APPROVE\n" });
  assert.equal(check(dir).stdout, `pending\t2\t${dir}/design-review-1.md\t-\n`);
});

test("fails frontmatter that runs past 60 lines", (t) => {
  const filler = Array.from({ length: 60 }, (_, i) => `k${i}: v`).join("\n");
  const dir = artifactDir(t, { "design-review-1.md": `---\nverdict: APPROVE\n${filler}\n---\n` });
  assert.equal(check(dir).stdout, `pending\t2\t${dir}/design-review-1.md\t-\n`);
});

test("fails an empty review file", (t) => {
  const dir = artifactDir(t, { "design-review-1.md": "" });
  assert.equal(check(dir).status, 1);
});

test("fails a quoted or lowercase verdict", (t) => {
  for (const verdict of ['"APPROVE"', "approve"]) {
    const dir = artifactDir(t, { "design-review-1.md": review(verdict) });
    assert.equal(check(dir).stdout, `pending\t2\t${dir}/design-review-1.md\t${verdict}\n`);
  }
});

test("ignores a directory named like a review", (t) => {
  const dir = artifactDir(t, { "design-review-1.md": review("APPROVE") });
  mkdirSync(join(dir, "design-review-5.md"));
  assert.equal(check(dir).stdout, `passed\t1\t${dir}/design-review-1.md\tAPPROVE\n`);
});

test("reads only the first verdict line of the frontmatter", (t) => {
  const dir = artifactDir(t, { "design-review-1.md": "---\nverdict: REQUEST CHANGES\nverdict: APPROVE\n---\n" });
  assert.equal(check(dir).stdout, `pending\t2\t${dir}/design-review-1.md\tREQUEST CHANGES\n`);
});

test("rejects a wrong argument count", () => {
  for (const args of [[], ["a", "b"]]) {
    const run = check(...args);
    assert.equal(run.status, 2);
    assert.match(run.stderr, /^usage: .*design-review-status\.sh <artifact-dir>\n$/);
    assert.equal(run.stdout, "");
  }
});

test("rejects a path that is not a directory", () => {
  const run = check("/nonexistent/design-review-status");
  assert.deepEqual(run, { status: 2, stdout: "", stderr: "not a directory: /nonexistent/design-review-status\n" });
});

// --- discover-topic.sh --require-passing-review applies the same rule ---

function plansRoot(t, plans) {
  const root = mkdtempSync(join(tmpdir(), "discover-review-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [id, files] of Object.entries(plans)) {
    mkdirSync(join(root, "docs/plans", id), { recursive: true });
    for (const [name, body] of Object.entries({ "6-design.md": "---\nphase: design\n---\n", ...files })) writeFileSync(join(root, "docs/plans", id, name), body);
  }
  return root;
}

function discover(cwd, ...args) {
  return spawnSync(DISCOVER, ["", "6-design.md", ...args], { cwd, encoding: "utf8" });
}

test("discover-topic keeps only directories whose design passed review", (t) => {
  const root = plansRoot(t, {
    "2026-01-01-passed-design": { "design-review-1.md": review("REQUEST CHANGES"), "design-review-2.md": review("COMMENT") },
    "2026-01-02-pending-design": { "design-review-1.md": review("APPROVE"), "design-review-2.md": review("REQUEST CHANGES") },
    "2026-01-03-unreviewed-design": {},
    "2026-01-04-shadowed-verdict": { "design-review-1.md": "---\nverdict: REQUEST CHANGES\nverdict: APPROVE\n---\n" },
  });
  const run = discover(root, "--require-passing-review");
  assert.deepEqual({ status: run.status, stdout: run.stdout }, { status: 0, stdout: "docs/plans/2026-01-01-passed-design/\n" });
});

test("discover-topic skips names that are not plan ids", (t) => {
  const root = plansRoot(t, { "notes": {}, "2026-1-1-bad-date": {}, "ENG-12-UPPER": {}, "ENG-12-legacy_ok": {} });
  assert.equal(discover(root).stdout, "");
  writeFileSync(join(root, "docs/plans/notes/6-design.md"), "---\n---\n");
  mkdirSync(join(root, "docs/plans/ENG-12-one"));
  writeFileSync(join(root, "docs/plans/ENG-12-one/6-design.md"), "---\n---\n");
  assert.equal(discover(root).stdout, "docs/plans/ENG-12-one/\n", "a one-word legacy id stays discoverable");
});

test("discover-topic fails loud when a shared helper is missing", (t) => {
  const root = plansRoot(t, {});
  const copy = join(root, "team");
  mkdirSync(copy);
  writeFileSync(join(copy, "discover-topic.sh"), readFileSync(DISCOVER, "utf8"), { mode: 0o755 });
  const run = spawnSync(join(copy, "discover-topic.sh"), ["", "6-design.md"], { cwd: root, encoding: "utf8" });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^missing helper: .*plan-id\.sh\n$/);
});
