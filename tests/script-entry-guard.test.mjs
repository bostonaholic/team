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

test("resolve-transcript.mjs run through a symlinked directory reaches its usage error", (t) => {
  const run = runScript(join(symlinkedDir(t, "skills/retro/resources"), "resolve-transcript.mjs"));
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^usage: resolve-transcript\.mjs </);
});

test("write-target.mjs run through a symlinked directory reaches its usage error", (t) => {
  const run = runScript(join(symlinkedDir(t, "skills/retro/resources"), "write-target.mjs"));
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^usage: write-target\.mjs </);
});

test("splice.mjs run through a symlinked directory reaches its usage error", (t) => {
  const run = runScript(join(symlinkedDir(t, "skills/pr-screenshots/scripts"), "splice.mjs"));
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^splice\.mjs: usage: splice\.mjs /);
});

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

test("importing resolve-transcript.mjs through a symlinked directory has no side effects", (t) => {
  const run = importModule(t, join(symlinkedDir(t, "skills/retro/resources"), "resolve-transcript.mjs"));
  assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
});

test("importing write-target.mjs through a symlinked directory has no side effects", (t) => {
  const run = importModule(t, join(symlinkedDir(t, "skills/retro/resources"), "write-target.mjs"));
  assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
});

test("importing splice.mjs through a symlinked directory has no side effects", (t) => {
  const run = importModule(t, join(symlinkedDir(t, "skills/pr-screenshots/scripts"), "splice.mjs"));
  assert.deepEqual(run, { status: 0, stdout: "", stderr: "" });
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
