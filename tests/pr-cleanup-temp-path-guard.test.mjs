// Fails when pr-cleanup's temp-path guard deletes a recorded path that is outside the temp
// root, contains `..`, or is reached through a symlink, or refuses a legitimate path.
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const GUARD = resolve("skills/pr-cleanup/scripts/remove-temp-path.sh");

// base/tmp is the temp root; base/outside holds a canary the guard must never reach.
function scratch(t) {
  const base = mkdtempSync(join(tmpdir(), "temp-path-guard-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = join(base, "tmp");
  const canary = join(base, "outside", "victim");
  mkdirSync(root);
  mkdirSync(canary, { recursive: true });
  writeFileSync(join(canary, "keep.txt"), "canary\n");
  return { base, root, canary };
}

function runDir(dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "scratch.txt"), "scratch\n");
  return dir;
}

// /bin/bash, so macOS exercises its stock bash 3.2.
function guard(tmpRoot, path) {
  return spawnSync("/bin/bash", [GUARD, path], { encoding: "utf8", env: { ...process.env, TMPDIR: `${tmpRoot}/` } });
}

function assertRefused(run, canary) {
  assert.ok(existsSync(join(canary, "keep.txt")), "canary outside the temp root was deleted");
  assert.equal(run.status, 1, run.stderr);
  assert.match(run.stderr, /^refusing: /);
}

test("removes a plain recorded path under the temp root", (t) => {
  const { root } = scratch(t);
  const path = runDir(join(root, "run.1"));
  const run = guard(root, path);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(existsSync(path), false);
});

test("refuses a path whose intermediate directory is a symlink out of the temp root", (t) => {
  const { root, canary } = scratch(t);
  symlinkSync(resolve(canary, ".."), join(root, "hop"));
  assertRefused(guard(root, join(root, "hop", "victim")), canary);
});

test("refuses a path whose intermediate directory is a symlink inside the temp root", (t) => {
  const { root, canary } = scratch(t);
  const target = runDir(join(root, "real", "run.2"));
  symlinkSync(join(root, "real"), join(root, "hop"));
  assertRefused(guard(root, join(root, "hop", "run.2")), canary);
  assert.ok(existsSync(target));
});

test("refuses a path containing '..'", (t) => {
  const { root, canary } = scratch(t);
  assertRefused(guard(root, `${root}/../outside/victim`), canary);
});

test("refuses a path whose final component is a symlink", (t) => {
  const { root, canary } = scratch(t);
  const link = join(root, "link");
  symlinkSync(canary, link);
  assertRefused(guard(root, link), canary);
  assert.ok(lstatSync(link).isSymbolicLink());
});

test("refuses a final-component symlink written with a trailing slash", (t) => {
  const { root, canary } = scratch(t);
  const link = join(root, "link");
  symlinkSync(canary, link);
  assertRefused(guard(root, `${link}/`), canary);
});

test("refuses a path outside the temp root", (t) => {
  const { root, canary } = scratch(t);
  assertRefused(guard(root, canary), canary);
});

test("removes a recorded path when the temp root itself is a symlink (macOS /var)", (t) => {
  const { base } = scratch(t);
  const realRoot = join(base, "private-tmp");
  mkdirSync(realRoot);
  const linkRoot = join(base, "var-tmp");
  symlinkSync(realRoot, linkRoot);
  runDir(join(realRoot, "run.3"));
  const run = guard(linkRoot, join(linkRoot, "run.3"));
  assert.equal(run.status, 0, run.stderr);
  assert.equal(existsSync(join(realpathSync(realRoot), "run.3")), false);
});

// groom-backlog and retro record `mktemp -d "${TMPDIR:-/tmp}/<name>.XXXXXXXX"`, which keeps
// the doubled slash when TMPDIR ends in / (the macOS default).
test("removes a recorded path made by the callers' mktemp idiom (doubled slash)", (t) => {
  const { root } = scratch(t);
  const made = spawnSync("/bin/sh", ["-c", 'mktemp -d "${TMPDIR:-/tmp}/groom-backlog.XXXXXXXX"'], {
    encoding: "utf8",
    env: { ...process.env, TMPDIR: `${root}/` },
  });
  assert.equal(made.status, 0, made.stderr);
  const path = made.stdout.trim();
  assert.ok(path.includes("//"), `expected a doubled slash in ${path}`);
  const run = guard(root, path);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(existsSync(path), false);
});

test("refuses an intermediate symlink written with doubled slashes", (t) => {
  const { root, canary } = scratch(t);
  symlinkSync(resolve(canary, ".."), join(root, "hop"));
  assertRefused(guard(root, `${root}//hop//victim`), canary);
});

test("reports an already-absent recorded path without failing", (t) => {
  const { root } = scratch(t);
  const run = guard(root, join(root, "gone"));
  assert.equal(run.status, 0, run.stderr);
});
