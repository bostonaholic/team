// tests/discover-topic.test.ts
//
// L3 subprocess tests (TESTING.md §L3) for the extracted discovery script
// skills/qrspi-workflow/discover-topic.sh — the single source of truth for the
// three-tier artifact-directory discovery the /team-* phase skills run. Ported
// from the executable cases in .claude/scripts/check-discovery-consistency.sh,
// now gated on every PR by `bun test` instead of an orphaned dev script.
//
// Plus a drift tripwire (TESTING.md §2): the script's ID_RE + PHASE_FILES must
// stay in sync with the node hooks' findActiveTopic(). The two implementations
// (bash for the skills' Bash tool, JS for the SessionStart/PreCompact hooks)
// share one contract; this fails the build the moment they diverge.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { read } from "./helpers/text";

const REPO_ROOT = process.cwd();
const SCRIPT = join(REPO_ROOT, "skills", "qrspi-workflow", "discover-topic.sh");

let work: string;

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "discover-topic-"));
});
afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

// Seed docs/plans/<id>/<file> under the temp work dir, optionally backdating its
// mtime (seconds) so the newest-mtime tiebreak is deterministic.
function seed(id: string, file: string, content = "", mtimeSec?: number): void {
  const dir = join(work, "docs", "plans", id);
  mkdirSync(dir, { recursive: true });
  const p = join(dir, file);
  writeFileSync(p, content);
  if (mtimeSec !== undefined) utimesSync(p, mtimeSec, mtimeSec);
}

// Run the real script in the temp work dir; assert clean exit; return stdout.
function discover(pred: string, requireApproved = "", explicit = ""): string {
  const r = spawnSync("bash", [SCRIPT, pred, requireApproved, explicit], {
    cwd: work,
    encoding: "utf8",
  });
  expect(r.status).toBe(0);
  return r.stdout.trim();
}

describe("discover-topic.sh — three-tier discovery (L3)", () => {
  test("(a) predecessor filter: resolves the only dir holding PRED", () => {
    seed("2026-01-01-alpha", "research.md");
    seed("2026-01-02-beta", "questions.md"); // no research.md -> skipped
    expect(discover("research.md")).toBe("docs/plans/2026-01-01-alpha/");
  });

  test("(b) newest-mtime tiebreak among valid dirs", () => {
    seed("2026-01-01-older", "research.md", "", 1_000_000); // backdated
    seed("2026-01-02-newer", "research.md"); // ~now
    expect(discover("research.md")).toBe("docs/plans/2026-01-02-newer/");
  });

  test("(c) empty docs/plans -> tier 3 (prints nothing)", () => {
    mkdirSync(join(work, "docs", "plans"), { recursive: true });
    expect(discover("research.md")).toBe("");
  });

  test("(d) non-existent explicit dir falls through to discovery", () => {
    seed("2026-01-01-alpha", "research.md");
    expect(discover("research.md", "", "/no/such/path-typo")).toBe(
      "docs/plans/2026-01-01-alpha/",
    );
  });

  test("(e) non-ID_RE dir excluded from discovery, honored when explicit", () => {
    seed("NotAValidId", "research.md");
    expect(discover("research.md")).toBe(""); // excluded from tier 2
    expect(discover("research.md", "", "docs/plans/NotAValidId")).toBe(
      "docs/plans/NotAValidId",
    ); // honored verbatim as tier 1
  });

  test("(f) require_approved: approved older beats unapproved newer", () => {
    seed("2026-01-01-approved", "design.md", "---\napproved: true\n---\n", 1_000_000);
    seed("2026-01-02-pending", "design.md", "---\napproved: false\n---\n");
    expect(discover("design.md", "1")).toBe("docs/plans/2026-01-01-approved/");
  });

  test("(g) require_approved: only unapproved candidate -> tier 3", () => {
    seed("2026-01-02-pending", "design.md", "---\napproved: false\n---\n");
    expect(discover("design.md", "1")).toBe("");
  });

  test("explicit existing dir is honored verbatim (tier 1, no scan)", () => {
    seed("2026-01-01-alpha", "research.md");
    expect(discover("research.md", "", "docs/plans/2026-01-01-alpha")).toBe(
      "docs/plans/2026-01-01-alpha",
    );
  });
});

describe("discover-topic.sh drift tripwire (TESTING.md §2)", () => {
  // ID_RE + PHASE_FILES live once in the shared hook lib (both runtime hooks
  // import them); the bash script must stay in sync with that single JS source.
  const SYNC_SOURCES = [join(REPO_ROOT, "hooks", "lib", "pipeline-state.mjs")];

  // The bash script writes [0-9]; the JS lib writes \d. Normalize so the two
  // forms are compared as one contract.
  const normalize = (re: string): string => re.replace(/\\d/g, "[0-9]");

  test("script ID_RE matches the hook lib's ID_RE (normalized \\d -> [0-9])", () => {
    const scriptIdRe = read(SCRIPT).match(/ID_RE='(\^.*\$)'/)?.[1];
    expect(scriptIdRe).toBeTruthy();
    for (const src of SYNC_SOURCES) {
      const jsIdRe = read(src).match(/const ID_RE = \/(\^.*\$)\//)?.[1];
      expect(jsIdRe).toBeTruthy();
      expect(normalize(jsIdRe!)).toBe(scriptIdRe!);
    }
  });

  test("script PHASE_FILES matches the hook lib's PHASE_FILES", () => {
    const scriptPhases = read(SCRIPT)
      .match(/PHASE_FILES="([^"]+)"/)?.[1]
      ?.split(/\s+/);
    expect(scriptPhases).toEqual([
      "task",
      "questions",
      "research",
      "design",
      "structure",
      "plan",
    ]);
    for (const src of SYNC_SOURCES) {
      const jsPhases = read(src)
        .match(/const PHASE_FILES = \[([^\]]+)\]/)?.[1]
        ?.match(/"([^"]+)"/g)
        ?.map((s) => s.replace(/"/g, ""));
      expect(jsPhases).toEqual(scriptPhases);
    }
  });
});
