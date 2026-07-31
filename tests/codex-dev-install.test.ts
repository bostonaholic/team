// tests/codex-dev-install.test.ts
//
// Acceptance tests for the Codex CLI dev install pair,
// `script/codex-dev-install` and `script/codex-dev-uninstall`
// (docs/plans/57-codex-skills-install/). One file spans slices 1-2 (A3):
// slice 1 owns the install tests below; slice 2 appends the uninstall tests.
//
// Two layers per docs/testing.md:
//
// - L2 forbidden-pattern tripwire (§2 L2, :124-125): the codex-dev-* scripts
//   must NEVER reference Codex's `plugins/cache` path. The Claude Code
//   dev-install trick — replacing the plugin cache dir with a symlink to the
//   checkout — makes Codex report the plugin `not installed` and drops the
//   catalog to zero skills (research run 3). Porting it would silently break
//   the install. Written in the same change as the scripts.
//
// - L3 subprocess-snapshot (§2 L3, :171-178; fake CLI on PATH per :358-360):
//   the install script must refuse to delete any non-symlink entry under its
//   script-owned `team/` directory. The real target resolves into a
//   git-tracked dotfiles repo, so the guard is what makes user-data
//   destruction impossible. Per plan assumption P1 the script derives its
//   target root from `${HOME}/.agents/skills`, so tests isolate with
//   HOME=<tempdir>. No test drives or mocks the real `codex` catalog
//   (design decision 7) — the catalog self-check stays script-side.

import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const SCRIPT_DIR = join(REPO_ROOT, "script");
const INSTALL_SCRIPT = join(SCRIPT_DIR, "codex-dev-install");
const UNINSTALL_SCRIPT = join(SCRIPT_DIR, "codex-dev-uninstall");

// Hermetic temp dirs keyed by pid (docs/testing.md L1 rule), cleaned up after.
const fixtures: string[] = [];
afterAll(() => {
  for (const dir of fixtures) rmSync(dir, { recursive: true, force: true });
});

function newTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-${process.pid}-`));
  fixtures.push(dir);
  return dir;
}

// A fake `codex` on PATH (docs/testing.md:358-360 — stub the boundary, never
// the subject). `plugin list` reports a clean slate so the coexistence guard
// passes and the run reaches the delete guard under test. Anything else
// (e.g. `debug prompt-input`) exits 0 with no output — if a buggy script got
// past the guard, its self-check would then fail, and the file-intact
// assertion below would catch the destruction. With `pluginListFails`,
// `plugin list` instead exits 1, to drive the guard's fail-closed path.
function makeStubCodexDir(pluginListFails = false): string {
  const dir = newTempDir("codex-stub");
  const stub = join(dir, "codex");
  writeFileSync(
    stub,
    [
      "#!/usr/bin/env bash",
      'if [ "${1:-}" = "plugin" ] && [ "${2:-}" = "list" ]; then',
      ...(pluginListFails
        ? ['  echo "error: unknown subcommand" >&2', "  exit 1"]
        : ['  echo "No marketplace plugins found."']),
      "fi",
      "exit 0",
      "",
    ].join("\n"),
  );
  chmodSync(stub, 0o755);
  return dir;
}

// The link set the installer must produce, re-derived from the live skills
// tree (never a hard-coded count): every skill whose frontmatter carries
// neither `user-invocable: false` nor `disable-model-invocation: true` —
// Codex ignores the latter key, so relying on it must exclude the skill.
function expectedLinkedSkills(): string[] {
  return readdirSync(join(REPO_ROOT, "skills")).filter((name) => {
    const md = join(REPO_ROOT, "skills", name, "SKILL.md");
    if (!existsSync(md)) return false;
    const text = readFileSync(md, "utf8");
    return (
      !/^user-invocable:\s*false/m.test(text) &&
      !/^disable-model-invocation:\s*true/m.test(text)
    );
  });
}

// Spawn a codex-dev-* script with an isolated HOME and the stub codex first
// on PATH. Invoking the file directly also pins its executable bit.
function runScript(script: string, env: { HOME: string; PATH: string }) {
  const r = spawnSync(script, [], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: { ...process.env, HOME: env.HOME, PATH: env.PATH },
  });
  return {
    // -1 when the spawn itself failed (e.g. the script does not exist yet);
    // the spawn error is folded into `output` so assertion failures name it.
    status: r.status ?? -1,
    output:
      (r.stdout ?? "") + (r.stderr ?? "") + (r.error ? String(r.error) : ""),
  };
}

describe("slice 1: codex-dev-install", () => {
  // The "never port the cache symlink swap" rule (design decision 7;
  // docs/testing.md forbidden-pattern tripwire). Scans every codex-dev-*
  // script — slice 2's uninstaller is covered by the same glob with no edit.
  test("L2 tripwire: codex-dev-* scripts never reference plugins/cache", () => {
    const scripts = readdirSync(SCRIPT_DIR)
      .filter((name) => name.startsWith("codex-dev-"))
      .map((name) => join(SCRIPT_DIR, name));

    // At least one script must exist, or the sweep would pass vacuously.
    expect(scripts.length).toBeGreaterThanOrEqual(1);

    const combined = scripts
      .map((path) => `--- ${path} ---\n${readFileSync(path, "utf8")}`)
      .join("\n");
    expect(combined).not.toContain("plugins/cache");
  });

  // The delete guard (design edge case "first-run collision"): a foreign
  // regular file inside the script-owned team/ directory must abort the run
  // — non-zero exit, entry named, nothing deleted. The script must never
  // destroy user data it did not create.
  test("L3 delete guard: non-symlink entry in team/ aborts, file intact", () => {
    const home = newTempDir("codex-home");
    const teamDir = join(home, ".agents", "skills", "team");
    mkdirSync(teamDir, { recursive: true });
    const foreignContent = "user data not created by codex-dev-install\n";
    writeFileSync(join(teamDir, "foreign.txt"), foreignContent);
    const stubDir = makeStubCodexDir();

    const r = runScript(INSTALL_SCRIPT, {
      HOME: home,
      PATH: `${stubDir}:${process.env.PATH}`,
    });

    expect(r.output).toContain("foreign.txt");
    expect(r.status).toBeGreaterThan(0);
    expect(readFileSync(join(teamDir, "foreign.txt"), "utf8")).toBe(
      foreignContent,
    );
  });

  // The frontmatter filter, derived mechanically from the live skills tree.
  // A skill relying on `disable-model-invocation: true` (a hard guard Codex
  // ignores) must never be linked. The stub codex returns an empty catalog,
  // so the self-check mismatches — and per the documented semantics the run
  // exits non-zero with the links left installed.
  test("L3 filter: links exactly the Codex-safe set; mismatch leaves links", () => {
    const home = newTempDir("codex-home");
    const stubDir = makeStubCodexDir();

    const r = runScript(INSTALL_SCRIPT, {
      HOME: home,
      PATH: `${stubDir}:${process.env.PATH}`,
    });

    const teamDir = join(home, ".agents", "skills", "team");
    const linked = readdirSync(teamDir).sort();
    expect(linked).toEqual(expectedLinkedSkills().sort());
    expect(linked).not.toContain("pr-approve-watch");
    expect(r.status).toBeGreaterThan(0); // self-check mismatch on empty stub
    expect(r.output).toContain("codex-dev-uninstall"); // points at the remedy
  });

  // Fail closed (design decision 5): when `codex plugin list` itself fails,
  // the coexistence guard proves nothing and must abort before any
  // filesystem change — never silently pass on empty output.
  test("L3 guard: failing `codex plugin list` aborts before linking", () => {
    const home = newTempDir("codex-home");
    const stubDir = makeStubCodexDir(true);

    const r = runScript(INSTALL_SCRIPT, {
      HOME: home,
      PATH: `${stubDir}:${process.env.PATH}`,
    });

    expect(r.status).toBeGreaterThan(0);
    expect(existsSync(join(home, ".agents"))).toBe(false);
  });
});

describe("slice 2: codex-dev-uninstall", () => {
  // The uninstaller needs no codex on PATH (it never invokes it), so these
  // tests pass the real PATH through unchanged.

  // Mirror cleanup (plan assumption P5): remove the symlink tree, then each
  // now-empty parent; a second run finds nothing and still exits 0.
  test("L3: uninstall removes symlink tree and empty parents; idempotent", () => {
    const home = newTempDir("codex-home");
    const skillsDir = join(home, ".agents", "skills");
    const teamDir = join(skillsDir, "team");
    mkdirSync(teamDir, { recursive: true });
    const target = newTempDir("skill-target");
    symlinkSync(target, join(teamDir, "alpha"));
    symlinkSync(target, join(teamDir, "beta"));

    const env = { HOME: home, PATH: process.env.PATH ?? "" };
    const r1 = runScript(UNINSTALL_SCRIPT, env);
    expect(r1.status).toBe(0);
    expect(existsSync(teamDir)).toBe(false);
    expect(existsSync(skillsDir)).toBe(false);
    expect(existsSync(join(home, ".agents"))).toBe(false);

    const r2 = runScript(UNINSTALL_SCRIPT, env);
    expect(r2.status).toBe(0);
  });

  // Ownership boundary at a symlinked root — the stated target scenario:
  // `~/.agents/skills` points into a dotfiles repo. Parent cleanup must not
  // reach through the symlink; the resolved parents belong to the user.
  // Round-trip: after uninstall the root symlink still resolves, so a
  // re-install cannot hit the dangling-symlink abort.
  test("L3: symlinked root — parents survive, symlink still resolves", () => {
    const home = newTempDir("codex-home");
    const dotfiles = newTempDir("dotfiles");
    const realSkills = join(dotfiles, "agents", "skills");
    const teamDir = join(realSkills, "team");
    mkdirSync(teamDir, { recursive: true });
    mkdirSync(join(home, ".agents"), { recursive: true });
    symlinkSync(realSkills, join(home, ".agents", "skills"));
    symlinkSync(newTempDir("skill-target"), join(teamDir, "alpha"));

    const r = runScript(UNINSTALL_SCRIPT, {
      HOME: home,
      PATH: process.env.PATH ?? "",
    });

    expect(r.status).toBe(0);
    expect(existsSync(teamDir)).toBe(false); // team/ links removed
    expect(existsSync(realSkills)).toBe(true); // dotfiles dirs survive
    expect(existsSync(join(dotfiles, "agents"))).toBe(true);
    // existsSync resolves symlinks: true means the root is not dangling.
    expect(existsSync(join(home, ".agents", "skills"))).toBe(true);
  });

  // The same delete guard as the installer: user data the script did not
  // create is never removed — fail loud, leave the file intact.
  test("L3: foreign regular file in team/ aborts, file intact", () => {
    const home = newTempDir("codex-home");
    const teamDir = join(home, ".agents", "skills", "team");
    mkdirSync(teamDir, { recursive: true });
    const foreignContent = "user data not created by codex-dev-install\n";
    writeFileSync(join(teamDir, "foreign.txt"), foreignContent);

    const r = runScript(UNINSTALL_SCRIPT, {
      HOME: home,
      PATH: process.env.PATH ?? "",
    });

    expect(r.output).toContain("foreign.txt");
    expect(r.status).toBeGreaterThan(0);
    expect(readFileSync(join(teamDir, "foreign.txt"), "utf8")).toBe(
      foreignContent,
    );
  });
});
