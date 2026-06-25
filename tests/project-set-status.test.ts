// tests/project-set-status.test.ts
//
// Hermetic L3 tests for the dev board-status setter
// `.claude/scripts/project-set-status.sh`. A fake `gh` first on PATH serves the
// Status field/option ids and records the `item-edit` call, so the script's
// name->option resolution, stdin item-id sourcing, and error paths are pinned
// without touching the network. Real `jq` still resolves. Free, fast.

import {
  afterAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const SCRIPT = join(REPO_ROOT, ".claude", "scripts", "project-set-status.sh");

// Fake `gh`: serves the Status field + options for `project field-list`, a
// scalar id for `project view --jq .id`, and records `project item-edit` args
// to $EDIT_LOG. Any other subcommand is a hard failure (catches drift).
const FAKE_GH = `#!/usr/bin/env bash
case "$1 $2" in
"project field-list")
  cat <<'JSON'
{"fields":[{"name":"Status","id":"FIELD_STATUS","options":[
  {"name":"Backlog","id":"OPT_BACKLOG"},
  {"name":"Ready","id":"OPT_READY"},
  {"name":"In progress","id":"OPT_INPROG"},
  {"name":"In review","id":"OPT_INREVIEW"},
  {"name":"Done","id":"OPT_DONE"}
]}]}
JSON
  ;;
"project view")
  echo "PROJ_123"
  ;;
"project item-edit")
  printf '%s\\n' "$*" >> "$EDIT_LOG"
  ;;
*)
  echo "fake gh: unhandled: $*" >&2; exit 1 ;;
esac
`;

const binDir = mkdtempSync(join(tmpdir(), "project-set-status-bin-"));
writeFileSync(join(binDir, "gh"), FAKE_GH);
chmodSync(join(binDir, "gh"), 0o755);
afterAll(() => rmSync(binDir, { recursive: true, force: true }));

let editLog: string;
beforeEach(() => {
  editLog = join(mkdtempSync(join(tmpdir(), "project-set-status-log-")), "edits");
});

function run(args: string[], stdin = ""): {
  status: number | null;
  out: string;
  err: string;
} {
  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    EDIT_LOG: editLog,
  };
  const r = spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    env,
    input: stdin,
  });
  return { status: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
}

function editCall(): string {
  try {
    return readFileSync(editLog, "utf8");
  } catch {
    return "";
  }
}

describe("project-set-status.sh: resolves status name -> option id", () => {
  test("happy path edits the item with the resolved field + option ids", () => {
    const r = run(["In review", "PVTI_42"]);
    expect(r.status).toBe(0);
    const call = editCall();
    expect(call).toContain("--id PVTI_42");
    expect(call).toContain("--field-id FIELD_STATUS");
    expect(call).toContain("--single-select-option-id OPT_INREVIEW");
    expect(call).toContain("--project-id PROJ_123");
  });

  test("status match is case-insensitive", () => {
    const r = run(["in review", "PVTI_7"]);
    expect(r.status).toBe(0);
    expect(editCall()).toContain("--single-select-option-id OPT_INREVIEW");
  });

  test("confirmation goes to stderr; stdout stays empty (pipe-clean)", () => {
    const r = run(["Done", "PVTI_9"]);
    expect(r.status).toBe(0);
    expect(r.out).toBe("");
    expect(r.err).toMatch(/set PVTI_9 -> "Done"/);
  });
});

describe("project-set-status.sh: item id from stdin", () => {
  test("reads the item id from stdin when omitted (pipe sink)", () => {
    const r = run(["In progress"], "PVTI_55\n");
    expect(r.status).toBe(0);
    const call = editCall();
    expect(call).toContain("--id PVTI_55");
    expect(call).toContain("--single-select-option-id OPT_INPROG");
  });

  test("reads the item id from stdin when the arg is '-'", () => {
    const r = run(["Done", "-"], "PVTI_56\n");
    expect(r.status).toBe(0);
    expect(editCall()).toContain("--id PVTI_56");
  });
});

describe("project-set-status.sh: error paths", () => {
  test("unknown status name dies without editing", () => {
    const r = run(["Nonsense", "PVTI_1"]);
    expect(r.status).not.toBe(0);
    expect(r.err).toMatch(/unknown status/i);
    expect(editCall()).toBe("");
  });

  test("missing args prints usage", () => {
    const r = run([]);
    expect(r.status).not.toBe(0);
    expect(r.err).toMatch(/usage/i);
  });

  test("no item id (none piped, none passed) dies", () => {
    const r = run(["Done"], "");
    expect(r.status).not.toBe(0);
    expect(r.err).toMatch(/no item id/i);
  });
});
