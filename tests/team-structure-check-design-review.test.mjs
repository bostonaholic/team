// Runs skills/team-structure/scripts/check-design-review.sh against scratch artifact directories.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const SCRIPT = resolve("skills/team-structure/scripts/check-design-review.sh");

function artifactDir(t, reviews = {}) {
  const dir = mkdtempSync(join(tmpdir(), "check-design-review-"));
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
  assert.deepEqual(check(dir), { status: 0, stdout: `pass\t${dir}/design-review-1.md\tAPPROVE\n`, stderr: "" });
});

test("passes a COMMENT verdict with trailing whitespace and a trailing slash on the directory", (t) => {
  const dir = artifactDir(t, { "design-review-1.md": review("COMMENT  ") });
  assert.equal(check(`${dir}/`).stdout, `pass\t${dir}/design-review-1.md\tCOMMENT\n`);
});

test("fails REQUEST CHANGES", (t) => {
  const dir = artifactDir(t, { "design-review-1.md": review("REQUEST CHANGES") });
  assert.deepEqual(check(dir), { status: 1, stdout: `fail\t${dir}/design-review-1.md\tREQUEST CHANGES\n`, stderr: "" });
});

test("judges only the highest-numbered review, compared numerically", (t) => {
  const dir = artifactDir(t, {
    "design-review-2.md": review("APPROVE"),
    "design-review-10.md": review("REQUEST CHANGES"),
    "design-review-x.md": review("APPROVE"),
  });
  assert.deepEqual(check(dir), { status: 1, stdout: `fail\t${dir}/design-review-10.md\tREQUEST CHANGES\n`, stderr: "" });
});

test("reads a leading-zero round number as decimal", (t) => {
  const dir = artifactDir(t, { "design-review-09.md": review("APPROVE"), "design-review-8.md": review("REQUEST CHANGES") });
  assert.equal(check(dir).stdout, `pass\t${dir}/design-review-09.md\tAPPROVE\n`);
});

test("a later passing round clears an earlier REQUEST CHANGES", (t) => {
  const dir = artifactDir(t, { "design-review-1.md": review("REQUEST CHANGES"), "design-review-2.md": review("APPROVE") });
  assert.equal(check(dir).status, 0);
});

test("fails when no review file exists", (t) => {
  const dir = artifactDir(t, { "6-design.md": "---\nphase: design\n---\n" });
  assert.deepEqual(check(dir), { status: 1, stdout: "fail\t-\t-\n", stderr: "" });
});

test("ignores a verdict outside the frontmatter", (t) => {
  const dir = artifactDir(t, { "design-review-1.md": "---\ntopic: x\n---\n\nverdict: APPROVE\n" });
  assert.deepEqual(check(dir), { status: 1, stdout: `fail\t${dir}/design-review-1.md\t-\n`, stderr: "" });
});

test("fails a file with no frontmatter", (t) => {
  const dir = artifactDir(t, { "design-review-1.md": "verdict: APPROVE\n" });
  assert.equal(check(dir).stdout, `fail\t${dir}/design-review-1.md\t-\n`);
});

test("fails unclosed frontmatter", (t) => {
  const dir = artifactDir(t, { "design-review-1.md": "---\nverdict: APPROVE\n" });
  assert.equal(check(dir).stdout, `fail\t${dir}/design-review-1.md\t-\n`);
});

test("fails frontmatter that runs past 60 lines", (t) => {
  const filler = Array.from({ length: 60 }, (_, i) => `k${i}: v`).join("\n");
  const dir = artifactDir(t, { "design-review-1.md": `---\nverdict: APPROVE\n${filler}\n---\n` });
  assert.equal(check(dir).stdout, `fail\t${dir}/design-review-1.md\t-\n`);
});

test("fails an empty review file", (t) => {
  const dir = artifactDir(t, { "design-review-1.md": "" });
  assert.equal(check(dir).status, 1);
});

test("fails a quoted or lowercase verdict", (t) => {
  for (const verdict of ['"APPROVE"', "approve"]) {
    const dir = artifactDir(t, { "design-review-1.md": review(verdict) });
    assert.equal(check(dir).stdout, `fail\t${dir}/design-review-1.md\t${verdict}\n`);
  }
});

test("ignores a directory named like a review", (t) => {
  const dir = artifactDir(t, { "design-review-1.md": review("APPROVE") });
  mkdirSync(join(dir, "design-review-5.md"));
  assert.equal(check(dir).stdout, `pass\t${dir}/design-review-1.md\tAPPROVE\n`);
});

test("rejects a wrong argument count", () => {
  for (const args of [[], ["a", "b"]]) {
    const run = check(...args);
    assert.equal(run.status, 2);
    assert.match(run.stderr, /^usage: .*check-design-review\.sh <artifact-dir>\n$/);
    assert.equal(run.stdout, "");
  }
});

test("rejects a path that is not a directory", () => {
  const run = check("/nonexistent/check-design-review");
  assert.deepEqual(run, { status: 2, stdout: "", stderr: "not a directory: /nonexistent/check-design-review\n" });
});
