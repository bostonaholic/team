// Runs version-bump's step-0 gate block, as written in SKILL.md, against scratch repos.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const INVARIANT_SCRIPT = ".github/scripts/version-bump-required.sh";

function stepZeroBlock() {
  const skill = readFileSync("skills/version-bump/SKILL.md", "utf8");
  const stepZero = skill.slice(skill.indexOf("### 0."), skill.indexOf("### 1."));
  const block = stepZero.match(/```bash\n([\s\S]*?)```/);
  assert.ok(block, "step 0 carries a bash block");
  return block[1];
}

function git(cwd, ...args) {
  const run = spawnSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout;
}

function commitScript(cwd) {
  mkdirSync(join(cwd, ".github/scripts"), { recursive: true });
  writeFileSync(join(cwd, INVARIANT_SCRIPT), "#!/bin/sh\necho 'OK: runtime_changed=false bumped=false'\n");
  chmodSync(join(cwd, INVARIANT_SCRIPT), 0o755);
  git(cwd, "add", ".");
  git(cwd, "commit", "-q", "-m", "add invariant script");
}

// A clone of a local origin on a feature branch. `gh` is stubbed to fail, so the
// block falls back to origin/HEAD as it would outside GitHub.
function scratchProject(t, { baseHasScript }) {
  const root = mkdtempSync(join(tmpdir(), "version-bump-gate-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const origin = join(root, "origin");
  mkdirSync(origin);
  git(origin, "init", "-q", "-b", "main");
  git(origin, "commit", "-q", "--allow-empty", "-m", "init");
  if (baseHasScript) commitScript(origin);
  git(root, "clone", "-q", origin, "work");
  const work = join(root, "work");
  git(work, "switch", "-q", "-c", "feature");
  const bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "gh"), "#!/bin/sh\nexit 1\n");
  chmodSync(join(bin, "gh"), 0o755);
  return { work, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } };
}

function runStepZero({ work, env }) {
  return spawnSync("bash", ["-c", stepZeroBlock()], { cwd: work, env, encoding: "utf8" });
}

test("a project whose base branch has no invariant script lands with no bump", (t) => {
  const project = scratchProject(t, { baseHasScript: false });
  git(project.work, "commit", "-q", "--allow-empty", "-m", "change");

  const run = runStepZero(project);

  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^NO-CONTRACT: /m);
});

test("a head that deletes the base branch's invariant script gets no verdict", (t) => {
  const project = scratchProject(t, { baseHasScript: true });
  git(project.work, "rm", "-q", INVARIANT_SCRIPT);
  git(project.work, "commit", "-q", "-m", "drop invariant script");

  const run = runStepZero(project);

  assert.notEqual(run.status, 0);
  assert.doesNotMatch(run.stdout, /^(OK|NO-CONTRACT): /m);
});

test("a project whose base branch has the invariant script runs it", (t) => {
  const project = scratchProject(t, { baseHasScript: true });
  git(project.work, "commit", "-q", "--allow-empty", "-m", "change");

  const run = runStepZero(project);

  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^OK: runtime_changed=false bumped=false/m);
});
