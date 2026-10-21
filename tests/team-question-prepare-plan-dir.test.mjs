// Runs skills/team-question/scripts/prepare-plan-dir.sh in scratch directories.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const SCRIPT = resolve("skills/team-question/scripts/prepare-plan-dir.sh");
const DISCOVER = resolve("skills/team/discover-topic.sh");

function scratch(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "prepare-plan-dir-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function run(cwd, ...args) {
  return spawnSync(SCRIPT, args, { cwd, encoding: "utf8" });
}

function touch(cwd, path) {
  mkdirSync(join(cwd, path, ".."), { recursive: true });
  writeFileSync(join(cwd, path), "---\n");
}

test("builds a dated id, creates the directory, and reports new", (t) => {
  const cwd = scratch(t);
  const out = run(cwd, "--date", "2026-05-01", "add-rate-limiting");
  assert.equal(out.status, 0, out.stderr);
  assert.equal(
    out.stdout,
    [
      "id=2026-05-01-add-rate-limiting",
      "dir=docs/plans/2026-05-01-add-rate-limiting/",
      "date=2026-05-01",
      "ticketId=null",
      "state=new",
      "",
    ].join("\n"),
  );
  assert.ok(existsSync(join(cwd, "docs/plans/2026-05-01-add-rate-limiting")));
});

test("a ticket replaces the date prefix and is recorded as ticketId", (t) => {
  const cwd = scratch(t);
  const out = run(cwd, "--ticket", "ENG-1234", "--date", "2026-05-01", "add-auth");
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /^id=ENG-1234-add-auth\ndir=docs\/plans\/ENG-1234-add-auth\/\ndate=2026-05-01\nticketId=ENG-1234\n/);
});

test("defaults the date to today's local date", (t) => {
  const cwd = scratch(t);
  const today = spawnSync("date", ["+%Y-%m-%d"], { encoding: "utf8" }).stdout.trim();
  const out = run(cwd, "add-auth");
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, new RegExp(`^id=${today}-add-auth\n`));
});

test("reports questions-only and complete with the artifacts present", (t) => {
  const cwd = scratch(t);
  const dir = "docs/plans/2026-05-01-add-auth/";
  touch(cwd, `${dir}1-task.md`);
  touch(cwd, `${dir}4-repos.md`);
  let out = run(cwd, "--date", "2026-05-01", "add-auth");
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /\nstate=questions-only\nartifact=docs\/plans\/2026-05-01-add-auth\/1-task.md\nartifact=docs\/plans\/2026-05-01-add-auth\/4-repos.md\n$/);

  touch(cwd, `${dir}2-questions.md`);
  touch(cwd, `${dir}3-prd.md`);
  out = run(cwd, "--date", "2026-05-01", "add-auth");
  assert.equal(out.status, 0, out.stderr);
  assert.match(
    out.stdout,
    /\nstate=complete\n(artifact=docs\/plans\/2026-05-01-add-auth\/(1-task|2-questions|3-prd|4-repos)\.md\n){4}$/,
  );
  assert.ok(out.stdout.indexOf("1-task") < out.stdout.indexOf("2-questions"));
  assert.ok(out.stdout.indexOf("3-prd") < out.stdout.indexOf("4-repos"));
});

test("exits 3 when 2-questions.md exists without 1-task.md", (t) => {
  const cwd = scratch(t);
  touch(cwd, "docs/plans/2026-05-01-add-auth/2-questions.md");
  const out = run(cwd, "--date", "2026-05-01", "add-auth");
  assert.equal(out.status, 3);
  assert.equal(out.stdout, "");
  assert.match(out.stderr, /2-questions\.md exists without/);
});

test("exits 1 when the directory cannot be created", (t) => {
  const cwd = scratch(t);
  writeFileSync(join(cwd, "docs"), "a file, not a directory\n");
  const out = run(cwd, "--date", "2026-05-01", "add-auth");
  assert.equal(out.status, 1);
  assert.equal(out.stdout, "");
  assert.match(out.stderr, /cannot create docs\/plans\/2026-05-01-add-auth\//);
});

for (const [name, args, pattern] of [
  ["no topic", [], /usage/],
  ["two topics", ["add-auth", "more-auth"], /unexpected argument: more-auth/],
  ["unknown option", ["--force", "add-auth"], /unknown option: --force/],
  ["--ticket without a value", ["add-auth", "--ticket"], /--ticket needs a value/],
  ["--date without a value", ["add-auth", "--date"], /--date needs a value/],
  ["one-word topic", ["auth"], /topic must be 2-4/],
  ["five-word topic", ["add-rate-limiting-to-everything"], /topic must be 2-4/],
  ["uppercase topic", ["Add-Auth"], /topic must be 2-4/],
  ["topic with a trailing dash", ["add-auth-"], /topic must be 2-4/],
  ["malformed ticket", ["--ticket", "ENG1234", "add-auth"], /ticket must look like ENG-1234: ENG1234/],
  ["malformed date", ["--date", "2026-5-1", "add-auth"], /date must be YYYY-MM-DD: 2026-5-1/],
]) {
  test(`exits 2 on ${name} and creates nothing`, (t) => {
    const cwd = scratch(t);
    const out = run(cwd, ...args);
    assert.equal(out.status, 2);
    assert.equal(out.stdout, "");
    assert.match(out.stderr, pattern);
    assert.ok(!existsSync(join(cwd, "docs")));
  });
}

test("every id it builds is one discover-topic.sh resolves", (t) => {
  const cwd = scratch(t);
  for (const args of [["--date", "2026-05-01", "add-auth"], ["--ticket", "ENG-1234", "add-rate-limiting"], ["--ticket", "proj_x-7", "fix-cache-key-bug"]]) {
    const out = run(cwd, ...args);
    assert.equal(out.status, 0, out.stderr);
    const dir = out.stdout.match(/^dir=(.*)$/m)[1];
    touch(cwd, `${dir}2-questions.md`);
    const found = spawnSync(DISCOVER, ["", "2-questions.md"], { cwd, encoding: "utf8" });
    assert.equal(found.status, 0, found.stderr);
    assert.equal(found.stdout, `${dir}\n`);
    rmSync(join(cwd, dir), { recursive: true });
  }
});
