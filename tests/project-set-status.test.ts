// tests/project-set-status.test.ts
//
// Regression + contract tests for the dev board status setter,
// `.claude/scripts/project-set-status.sh`. The script must set a card's Status
// column AND verify the move took — it re-reads the authoritative project-side
// status after the edit and fails loudly if it does not match the target.
//
// Regression: this pins bug #141 — the setter fired `gh project item-edit` with
// its output suppressed (`>/dev/null`) and trusted the exit code, never reading
// back the result. A silent or partial write (or a UI/consistency discrepancy)
// was therefore reported as success. The fix makes the move verifiable:
// read the authoritative status back and fail loudly on mismatch. These tests
// drive the script against a stateful fake `gh` and assert that a masked write
// (read-back never reflects the edit) fails loudly, while an honest write
// confirms.
//
// Hermetic: a fake `gh` is placed first on PATH, so the script never touches the
// network. Free, fast, gate-tier (L3 per docs/testing.md).

import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { read } from "./helpers/text";

const REPO_ROOT = join(import.meta.dir, "..");
const SCRIPT = join(REPO_ROOT, ".claude", "scripts", "project-set-status.sh");

// A stateful fake `gh` covering the four project subcommands the setter uses:
//   field-list  → the Status field + its column options
//   view        → the project node id (script reads it via --jq '.id')
//   item-edit   → records the option id it was asked to set into $GH_FAKE_STATE
//   item-list   → reports each item's status. In honest mode it reflects the
//                 last item-edit; in masked mode ($GH_FAKE_MASK=1) it always
//                 reports a STALE "Backlog", simulating a silent/partial write
//                 or a board that never converges on the new value.
const FAKE_GH = `#!/usr/bin/env bash
sub="$2"
opt=""; prev=""
for a in "$@"; do
  case "$prev" in --single-select-option-id) opt="$a" ;; esac
  prev="$a"
done
case "$sub" in
  field-list)
    jq -n '{fields:[{id:"FIELD_STATUS", name:"Status", options:[
      {id:"OPT_BACKLOG", name:"Backlog"},
      {id:"OPT_READY", name:"Ready"},
      {id:"OPT_INPROG", name:"In progress"},
      {id:"OPT_INREVIEW", name:"In review"},
      {id:"OPT_DONE", name:"Done"}
    ]}]}'
    ;;
  view)
    printf '%s\\n' "PVT_TEST"
    ;;
  item-edit)
    printf '%s' "$opt" > "$GH_FAKE_STATE"
    ;;
  item-list)
    if [ "\${GH_FAKE_MASK:-0}" = "1" ]; then
      status="Backlog"
    else
      optid="$(cat "$GH_FAKE_STATE" 2>/dev/null)"
      case "$optid" in
        OPT_BACKLOG) status="Backlog" ;;
        OPT_READY) status="Ready" ;;
        OPT_INPROG) status="In progress" ;;
        OPT_INREVIEW) status="In review" ;;
        OPT_DONE) status="Done" ;;
        *) status="Backlog" ;;
      esac
    fi
    jq -n --arg s "$status" '{items:[{id:"PVTI_TEST", status:$s, content:{number:42}}], totalCount:1}'
    ;;
esac
`;

const binDir = mkdtempSync(join(tmpdir(), "project-set-status-"));
writeFileSync(join(binDir, "gh"), FAKE_GH);
chmodSync(join(binDir, "gh"), 0o755);
const stateFile = join(binDir, "state");

afterAll(() => rmSync(binDir, { recursive: true, force: true }));

// Run the setter with the fake `gh` first on PATH (real `jq` still resolves).
// `mask` flips the fake into masked-write mode.
function run(status: string, itemId: string, mask = false) {
  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    GH_FAKE_STATE: stateFile,
    GH_FAKE_MASK: mask ? "1" : "0",
  };
  const r = spawnSync("bash", [SCRIPT, status, itemId], { encoding: "utf8", env });
  return { status: r.status, out: (r.stdout ?? "").trim(), err: r.stderr ?? "" };
}

describe("project-set-status.sh: verifies the move (#141)", () => {
  test("regression: fails loudly when the read-back does not match the target", () => {
    const r = run("In review", "PVTI_TEST", /* mask */ true);
    expect(r.status).not.toBe(0);
    expect(r.err).toMatch(/in review/i); // names the requested target
    expect(r.err).toMatch(/backlog/i); // names the actual (stale) status
  });

  test("confirms the move when the read-back matches the target", () => {
    const r = run("In review", "PVTI_TEST");
    expect(r.status).toBe(0);
    expect(r.err).toMatch(/in review/i);
  });

  test("still rejects an unknown status before touching the board", () => {
    const r = run("Nonsense", "PVTI_TEST");
    expect(r.status).not.toBe(0);
    expect(r.err).toMatch(/unknown status/i);
  });
});

describe("project-set-status.sh: source contract", () => {
  // Lock the fix in: the setter must NOT suppress item-edit's result and MUST
  // re-read the authoritative status to verify the move (#141).
  test("does not suppress the item-edit command's output with >/dev/null", () => {
    // Anchor on the actual invocation, not any prose mention of "item-edit".
    expect(read(SCRIPT)).not.toMatch(/gh project item-edit[\s\S]*?>\s*\/dev\/null/);
  });

  test("re-reads the authoritative status with item-list", () => {
    expect(read(SCRIPT)).toContain("item-list");
  });
});
