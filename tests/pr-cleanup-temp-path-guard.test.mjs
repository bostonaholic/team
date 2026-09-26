// Fails when pr-cleanup's temp-path guard deletes a recorded path that is outside the temp
// root, contains `..`, or is reached through a symlink, or refuses a legitimate path.
import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
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

// /bin/bash, so macOS exercises its stock bash 3.2. TMPDIR ends in /, as on macOS.
function guard(tmpRoot, path, env = {}) {
  return spawnSync("/bin/bash", [GUARD, path], {
    encoding: "utf8",
    env: { ...process.env, ...env, TMPDIR: `${tmpRoot}/` },
  });
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
for (const name of ["groom-backlog", "retro"]) {
  test(`removes a recorded path made by the ${name} mktemp idiom (doubled slash)`, (t) => {
    const { root } = scratch(t);
    const made = spawnSync("/bin/sh", ["-c", `mktemp -d "\${TMPDIR:-/tmp}/${name}.XXXXXXXX"`], {
      encoding: "utf8",
      env: { ...process.env, TMPDIR: `${root}/` },
    });
    assert.equal(made.status, 0, made.stderr);
    const path = made.stdout.trim();
    assert.ok(path.startsWith(`${root}//${name}.`), `expected ${root}//${name}.* but got ${path}`);
    const run = guard(root, path);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(existsSync(path), false);
  });
}

test("removes a recorded path written with doubled or trailing slashes", (t) => {
  const { root } = scratch(t);
  for (const [dir, recorded] of [
    ["run.4", `${root}//run.4`],
    ["run.5", `${root}///run.5`],
    ["run.6", `${root}/run.6/`],
    ["run.7", `${root}//run.7//`],
  ]) {
    runDir(join(root, dir));
    const run = guard(root, recorded);
    assert.equal(run.status, 0, `${recorded}: ${run.stderr}`);
    assert.equal(existsSync(join(root, dir)), false, `${recorded} was not removed`);
  }
});

// A fake rm on PATH swaps the checked parent for a symlink out of the root just before the
// real rm runs, standing in for a race between the check and the delete.
test("deletes from the verified directory when its path is swapped for a symlink before rm", (t) => {
  const { base, root, canary } = scratch(t);
  const parent = join(root, "run");
  runDir(join(parent, "victim"));
  const shims = join(base, "shims");
  mkdirSync(shims);
  writeFileSync(
    join(shims, "rm"),
    '#!/bin/sh\nmv "$SWAP_DIR" "$SWAP_DIR.moved" && ln -s "$SWAP_TARGET" "$SWAP_DIR" && exec /bin/rm "$@"\n',
    { mode: 0o755 },
  );
  const run = guard(root, join(parent, "victim"), {
    PATH: `${shims}:${process.env.PATH}`,
    SWAP_DIR: parent,
    SWAP_TARGET: resolve(canary, ".."),
  });
  assert.ok(existsSync(join(canary, "keep.txt")), "canary outside the temp root was deleted");
  assert.equal(run.status, 0, run.stderr);
  assert.ok(lstatSync(parent).isSymbolicLink(), "the fake rm did not swap the parent");
  assert.equal(existsSync(join(`${parent}.moved`, "victim")), false);
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

test("refuses a missing path reached through an intermediate symlink", (t) => {
  const { root, canary } = scratch(t);
  symlinkSync(resolve(canary, ".."), join(root, "hop"));
  assertRefused(guard(root, join(root, "hop", "nothing")), canary);
});

test("refuses every path when TMPDIR is /", (t) => {
  const { canary } = scratch(t);
  const run = guard("", canary);
  assertRefused(run, canary);
  assert.match(run.stderr, /temp root '\/' is empty or not absolute/);
});

test("exits 3, not 1, when rm cannot fully remove the path", (t) => {
  if (process.getuid?.() === 0) return t.skip("root ignores directory permissions");
  const { root } = scratch(t);
  const path = runDir(join(root, "run.8"));
  const locked = runDir(join(path, "locked"));
  chmodSync(locked, 0o555);
  try {
    const run = guard(root, path);
    assert.equal(run.status, 3, run.stderr);
    assert.match(run.stderr, /^failed: '.*' was not fully removed$/m);
    assert.doesNotMatch(run.stderr, /^refusing: /m);
    assert.ok(existsSync(join(locked, "scratch.txt")));
  } finally {
    chmodSync(locked, 0o755);
  }
});

// $( ) strips trailing newlines, so without a sentinel y -> "y\n" would read as y.
test("refuses a last-parent symlink to a sibling named with a trailing newline", (t) => {
  const { root, canary } = scratch(t);
  const target = runDir(join(root, "x", "y\n", "name"));
  symlinkSync("y\n", join(root, "x", "y"));
  assertRefused(guard(root, join(root, "x", "y", "name")), canary);
  assert.ok(existsSync(join(target, "scratch.txt")));
});

test("removes a recorded path when TMPDIR has a doubled slash inside it", (t) => {
  const { base } = scratch(t);
  const path = runDir(join(base, "tmp", "run.9"));
  const run = guard(`${base}//tmp`, `${base}//tmp//run.9`);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(existsSync(path), false);
});

// Removing /bin/pwd needs root, so run a copy whose candidate list names no real file.
test("refuses with a clear message when no external pwd exists", (t) => {
  const { base, root, canary } = scratch(t);
  const source = readFileSync(GUARD, "utf8");
  const copy = source.replace("for c in /bin/pwd /usr/bin/pwd; do", "for c in /nonexistent/pwd; do");
  assert.notEqual(copy, source, "candidate list not found in the guard");
  const script = join(base, "remove-temp-path.sh");
  writeFileSync(script, copy, { mode: 0o755 });
  const path = runDir(join(root, "run.10"));
  const run = spawnSync("/bin/bash", [script, path], { encoding: "utf8", env: { ...process.env, TMPDIR: `${root}/` } });
  assertRefused(run, canary);
  assert.match(run.stderr, /cannot be checked: no external pwd at \/bin\/pwd or \/usr\/bin\/pwd$/m);
  assert.ok(existsSync(path));
});
