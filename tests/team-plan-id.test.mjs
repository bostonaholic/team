// Runs skills/team/scripts/plan-id.sh, the one owner of the docs/plans/<id> rule.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

const SCRIPT = resolve("skills/team/scripts/plan-id.sh");

function run(...args) {
  const result = spawnSync(SCRIPT, args, { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("builds a dated id", () => {
  assert.deepEqual(run("--date", "2026-05-01", "add-rate-limiting"), {
    status: 0,
    stdout: "id=2026-05-01-add-rate-limiting\ntopic=add-rate-limiting\ndate=2026-05-01\nticketId=null\n",
    stderr: "",
  });
});

test("a ticket replaces the date prefix and is reported as ticketId", () => {
  assert.equal(
    run("--ticket", "ENG-1234", "--date", "2026-05-01", "add-auth").stdout,
    "id=ENG-1234-add-auth\ntopic=add-auth\ndate=2026-05-01\nticketId=ENG-1234\n",
  );
});

test("defaults the date to today's local date", () => {
  const today = spawnSync("date", ["+%Y-%m-%d"], { encoding: "utf8" }).stdout.trim();
  assert.match(run("add-auth").stdout, new RegExp(`^id=${today}-add-auth\ntopic=add-auth\ndate=${today}\n`));
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
  ["--parse without an id", ["--parse"], /usage: plan-id\.sh --parse <id>/],
  ["--parse with two ids", ["--parse", "a", "b"], /usage: plan-id\.sh --parse <id>/],
]) {
  test(`exits 2 on ${name}`, () => {
    const result = run(...args);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, pattern);
  });
}

test("parses a ticket or dated id into its topic and ticketId", () => {
  assert.equal(run("--parse", "ENG-1234-add-auth").stdout, "id=ENG-1234-add-auth\ntopic=add-auth\nticketId=ENG-1234\n");
  assert.equal(run("--parse", "proj_x-7-5-x").stdout, "id=proj_x-7-5-x\ntopic=5-x\nticketId=proj_x-7\n");
  assert.equal(run("--parse", "2026-05-01-add-auth").stdout, "id=2026-05-01-add-auth\ntopic=add-auth\nticketId=null\n");
});

test("parse accepts a legacy one-word topic but no other shape", () => {
  assert.equal(run("--parse", "ENG-1-cache").status, 0);
  for (const name of ["notes", "add-auth", "2026-5-1-add-auth", "ENG-add-auth", "1ENG-1-add-auth", "ENG-1-Add-auth", "ENG-1-add_auth", "ENG-1-"]) {
    assert.deepEqual(run("--parse", name), { status: 1, stdout: "", stderr: "" }, name);
  }
});

test("every id it builds parses back to the same topic and ticket", () => {
  for (const args of [["--date", "2026-05-01", "add-auth"], ["--ticket", "ENG-1234", "add-rate-limiting"], ["--ticket", "proj_x-7", "fix-cache-key-bug"]]) {
    const built = Object.fromEntries(run(...args).stdout.trim().split("\n").map((line) => line.split("=")));
    const parsed = Object.fromEntries(run("--parse", built.id).stdout.trim().split("\n").map((line) => line.split("=")));
    assert.deepEqual(parsed, { id: built.id, topic: built.topic, ticketId: built.ticketId });
  }
});
