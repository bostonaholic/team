// Fails when a skill script's CLI entry guard skips the CLI for a script run through a
// symlinked directory (as under macOS /tmp → /private/tmp), or runs it on import.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const IMPORTER = 'import { pathToFileURL } from "node:url";\nawait import(pathToFileURL(process.argv[2]).href);\n';

function scratchDir(t) {
  const root = mkdtempSync(join(tmpdir(), "entry-guard-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function symlinkedDir(t, target) {
  const link = join(scratchDir(t), "link");
  symlinkSync(resolve(target), link);
  return link;
}

function runScript(path) {
  return spawnSync(process.execPath, [path], { encoding: "utf8" });
}

function importModule(t, path) {
  const importer = join(scratchDir(t), "importer.mjs");
  writeFileSync(importer, IMPORTER);
  const run = spawnSync(process.execPath, [importer, path], { encoding: "utf8" });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

test("supports-nesting.mjs run through a symlinked directory reports unsupported for a missing version", (t) => {
  const run = runScript(join(symlinkedDir(t, "skills/team/references"), "supports-nesting.mjs"));
  assert.equal(run.status, 1);
  assert.equal(run.stdout, "unsupported\n");
});

test("resolve-model.mjs run through a symlinked directory reaches its usage error", (t) => {
  const run = runScript(join(symlinkedDir(t, "skills/team/references"), "resolve-model.mjs"));
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^usage: node resolve-model\.mjs </);
});

test("external-review.mjs run through a symlinked directory reaches its usage error", (t) => {
  const run = runScript(join(symlinkedDir(t, "skills/team/references"), "external-review.mjs"));
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^missing or malformed arguments\nusage: external-review\.mjs /);
});

test("importing supports-nesting.mjs through a symlinked directory has no side effects", (t) => {
  const run = importModule(t, join(symlinkedDir(t, "skills/team/references"), "supports-nesting.mjs"));
  assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
});

test("importing resolve-model.mjs through a symlinked directory has no side effects", (t) => {
  const run = importModule(t, join(symlinkedDir(t, "skills/team/references"), "resolve-model.mjs"));
  assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
});

test("importing external-review.mjs through a symlinked directory has no side effects", (t) => {
  const run = importModule(t, join(symlinkedDir(t, "skills/team/references"), "external-review.mjs"));
  assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
});

test("review-comments.mjs run through a symlinked directory reaches its usage error", (t) => {
  const run = runScript(join(symlinkedDir(t, "skills/team-pr/scripts"), "review-comments.mjs"));
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^review-comments\.mjs: usage: review-comments\.mjs /);
});

test("importing review-comments.mjs through a symlinked directory has no side effects", (t) => {
  const run = importModule(t, join(symlinkedDir(t, "skills/team-pr/scripts"), "review-comments.mjs"));
  assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
});

for (const script of ["render-research.mjs", "record-design-review.mjs", "append-cross-model-notes.mjs"]) {
  test(`${script} run through a symlinked directory reaches its usage error`, (t) => {
    const run = runScript(join(symlinkedDir(t, "skills/team/scripts"), script));
    assert.equal(run.status, 2);
    assert.match(run.stderr, new RegExp(`^${script.replace(".", "\\.")}: missing --dir`));
  });

  test(`importing ${script} through a symlinked directory has no side effects`, (t) => {
    const run = importModule(t, join(symlinkedDir(t, "skills/team/scripts"), script));
    assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
  });
}

test("manifest-entries.mjs run through a symlinked directory reaches its usage error", (t) => {
  const run = runScript(join(symlinkedDir(t, "skills/team-pr/scripts"), "manifest-entries.mjs"));
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^manifest-entries\.mjs: usage: manifest-entries\.mjs /);
});

test("importing manifest-entries.mjs through a symlinked directory has no side effects", (t) => {
  const run = importModule(t, join(symlinkedDir(t, "skills/team-pr/scripts"), "manifest-entries.mjs"));
  assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
});

test("change-profile.mjs run through a symlinked directory reaches its usage error", (t) => {
  const run = runScript(join(symlinkedDir(t, "skills/team-code-review/scripts"), "change-profile.mjs"));
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^change-profile\.mjs: usage: change-profile\.mjs /);
});

test("importing change-profile.mjs through a symlinked directory has no side effects", (t) => {
  const run = importModule(t, join(symlinkedDir(t, "skills/team-code-review/scripts"), "change-profile.mjs"));
  assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
});
