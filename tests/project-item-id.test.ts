// tests/project-item-id.test.ts
//
// Regression + contract tests for the dev board resolver,
// `.claude/scripts/project-item-id.sh`. The script must resolve
// <issue-number> -> board item ID, printing ONLY the id on stdout.
//
// Regression: this pins bug #105 — the resolver used `gh project item-list`
// with no `--limit`, which defaults to 30 items, so any issue/PR past the first
// page (the common case on an active board) was silently reported as "not on
// the board". This broke the auto-move dev binding (#114) for exactly the
// recent items it is used on. The fix requests a high `--limit`; these tests
// drive the script against a fake `gh` that honors `--limit` over a 40-item
// board and assert a target past the first page is found.
//
// Hermetic: a fake `gh` is placed first on PATH, so the script never touches
// the network. Free, fast, gate-tier (L3 per docs/testing.md).

import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { read } from "./helpers/text";

const REPO_ROOT = join(import.meta.dir, "..");
const SCRIPT = join(REPO_ROOT, ".claude", "scripts", "project-item-id.sh");

// A fake `gh` whose `project item-list` honors `--limit` over a 40-item board
// (items numbered 1..40, id "PVTI_<n>"), returning the first `--limit` of them
// just like real pagination. Default limit is 30, so #40 is only reachable when
// the script passes a sufficiently high `--limit`.
const FAKE_GH = `#!/usr/bin/env bash
TOTAL=40
limit=30
prev=""
for a in "$@"; do
  case "$prev" in --limit|-L) limit="$a" ;; esac
  prev="$a"
done
n="$limit"; [ "$n" -gt "$TOTAL" ] && n="$TOTAL"
items="$(seq 1 "$n" | jq -R 'tonumber | {id:("PVTI_\\(.)"), content:{number:., type:"Issue"}}' | jq -s .)"
jq -n --argjson items "$items" --argjson total "$TOTAL" '{items:$items, totalCount:$total}'
`;

const binDir = mkdtempSync(join(tmpdir(), "project-item-id-"));
writeFileSync(join(binDir, "gh"), FAKE_GH);
chmodSync(join(binDir, "gh"), 0o755);

afterAll(() => rmSync(binDir, { recursive: true, force: true }));

// Run the resolver with the fake `gh` first on PATH (real `jq` still resolves).
function run(issue: string) {
  const env = { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ""}` };
  const r = spawnSync("bash", [SCRIPT, issue], { encoding: "utf8", env });
  return { status: r.status, out: (r.stdout ?? "").trim(), err: r.stderr ?? "" };
}

describe("project-item-id.sh: resolves across the whole board (#105)", () => {
  test("regression: finds an item past the default first page (#40)", () => {
    const r = run("40");
    expect(r.status).toBe(0);
    expect(r.out).toBe("PVTI_40");
  });

  test("finds an item on the first page (#1)", () => {
    const r = run("1");
    expect(r.status).toBe(0);
    expect(r.out).toBe("PVTI_1");
  });

  test("prints ONLY the id on stdout (pipes cleanly)", () => {
    const r = run("40");
    expect(r.out).toBe("PVTI_40");
    expect(r.out.split("\n")).toHaveLength(1);
  });

  test("exits non-zero for an issue not on the board", () => {
    const r = run("999");
    expect(r.status).not.toBe(0);
    expect(r.err).toMatch(/not on project/i);
    expect(r.out).toBe("");
  });
});

describe("project-item-id.sh: source contract", () => {
  // Lock the fix in: the resolver must request a high page limit so it never
  // regresses to the silent 30-item default that caused #105.
  test("passes --limit to gh project item-list", () => {
    expect(read(SCRIPT)).toContain("--limit");
  });
});
