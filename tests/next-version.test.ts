// tests/next-version.test.ts
//
// Deterministic tests for the dev land-time version helper,
// `.claude/scripts/next-version.sh`. The script must print
// `bump(base, level)` and NOTHING else — a pure function of (base, level).
//
// Hermetic: every behavior case injects `BASE_VERSION`, so the script never
// reads git or the network. Free, fast, gate-tier (L1/L3 per docs/testing.md).
//
// Regression: this pins the "0.5.1 -> 0.7.0, skipping 0.6.0" bug. The script
// used to scan open PRs via the GitHub API and walk past any version they
// claimed; a stale PR claiming 0.6.0 made a minor bump skip to 0.7.0. The walk
// is removed — the next version depends ONLY on (base, level), so a minor bump
// from 0.5.1 is always 0.6.0. The tripwire at the bottom locks the scan out.

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { read } from "./helpers/text";

const REPO_ROOT = join(import.meta.dir, "..");
const SCRIPT = join(REPO_ROOT, ".claude", "scripts", "next-version.sh");

// Run the script with an injected base version (hermetic — no git/network).
function run(level: string, base?: string) {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  if (base !== undefined) env.BASE_VERSION = base;
  else delete env.BASE_VERSION;
  const r = spawnSync("bash", [SCRIPT, level], { encoding: "utf8", env });
  return { status: r.status, out: (r.stdout ?? "").trim(), err: r.stderr ?? "" };
}

describe("next-version.sh: deterministic bump(base, level)", () => {
  test("minor: 0.5.1 -> 0.6.0", () => {
    const r = run("minor", "0.5.1");
    expect(r.status).toBe(0);
    expect(r.out).toBe("0.6.0");
  });

  test("patch: 0.5.1 -> 0.5.2", () => {
    expect(run("patch", "0.5.1").out).toBe("0.5.2");
  });

  test("major: 0.5.1 -> 1.0.0", () => {
    expect(run("major", "0.5.1").out).toBe("1.0.0");
  });

  test("minor: 0.6.0 -> 0.7.0", () => {
    expect(run("minor", "0.6.0").out).toBe("0.7.0");
  });

  test("major zeroes the lower components: 2.4.9 -> 3.0.0", () => {
    expect(run("major", "2.4.9").out).toBe("3.0.0");
  });

  test("minor zeroes patch: 2.4.9 -> 2.5.0", () => {
    expect(run("minor", "2.4.9").out).toBe("2.5.0");
  });

  // The regression that prompted this test. A minor bump from 0.5.1 is 0.6.0
  // and stays 0.6.0 across runs — it does NOT consult open PRs, so a stale PR
  // statically claiming 0.6.0 can no longer make it skip to 0.7.0.
  test("regression: 0.5.1 minor stays 0.6.0, never skips to 0.7.0", () => {
    const a = run("minor", "0.5.1");
    const b = run("minor", "0.5.1");
    expect(a.out).toBe("0.6.0");
    expect(b.out).toBe("0.6.0");
    expect(a.out).not.toBe("0.7.0");
  });

  test("prints only the version on stdout (pipes cleanly)", () => {
    const r = run("minor", "0.5.1");
    expect(r.out).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("next-version.sh: input validation", () => {
  test("rejects an invalid level", () => {
    const r = run("huge", "0.5.1");
    expect(r.status).not.toBe(0);
    expect(r.err).toMatch(/level must be major, minor, or patch/);
  });

  test("rejects a non-semver base", () => {
    const r = run("minor", "1.2");
    expect(r.status).not.toBe(0);
    expect(r.err).toMatch(/not 3-part semver/);
  });

  test("requires exactly one argument", () => {
    const r = spawnSync("bash", [SCRIPT], {
      encoding: "utf8",
      env: { ...process.env, BASE_VERSION: "0.5.1" },
    });
    expect(r.status).not.toBe(0);
  });
});

describe("next-version.sh: L2 tripwire — no open-PR collision scan", () => {
  // The land-time model removed the GitHub-API walk-past-open-PRs. Reintroducing
  // any PR scan would make the output non-deterministic and could skip free
  // versions again (the 0.6.0 bug). Lock it out at the source.
  const src = read(SCRIPT);

  test("does not invoke the gh CLI", () => {
    expect(/(^|[^a-zA-Z])gh\s/.test(src)).toBe(false);
  });

  test("does not query open PRs or walk past claimed versions", () => {
    expect(/pulls\?state=open/.test(src)).toBe(false);
    expect(/is_claimed|walking forward|claimed by an open PR/.test(src)).toBe(false);
  });

  test("resolves the default branch via origin/HEAD, not a hardcoded main", () => {
    // matches the convention shipit/team-pr use; survives a default-branch rename
    expect(/symbolic-ref[^\n]*refs\/remotes\/origin\/HEAD/.test(src)).toBe(true);
    // the version read must go through the resolved branch, never `origin/main:`
    expect(/git show ["']?origin\/main:/.test(src)).toBe(false);
  });
});
