// tests/codex-dev-install.test.ts
//
// Acceptance tests for the Codex CLI dev install pair,
// `script/codex-dev-install` and `script/codex-dev-uninstall`.
//
// Two layers:
//
// - L2 forbidden-pattern tripwire: the codex-dev-* scripts must NEVER
//   reference Codex's `plugins/cache` path. The Claude Code dev-install
//   trick — replacing the plugin cache dir with a symlink to the checkout —
//   makes Codex report the plugin `not installed` and drops the catalog to
//   zero skills. Porting it would silently break the install.
//
// - L3 subprocess-snapshot with a fake `codex` on PATH: the install script
//   must refuse to delete any non-symlink entry under its script-owned
//   `team/` directory. The real target can resolve into a git-tracked
//   dotfiles repo, so that guard is what makes user-data destruction
//   impossible. Both scripts derive their target root from
//   `${HOME}/.agents/skills`, so every test isolates with HOME=<tempdir>.
//   No test drives or mocks the real `codex` catalog — the catalog
//   self-check stays script-side.

import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
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

// Hermetic temp dirs keyed by pid, cleaned up after.
const fixtures: string[] = [];
afterAll(() => {
  for (const dir of fixtures) rmSync(dir, { recursive: true, force: true });
});

function newTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-${process.pid}-`));
  fixtures.push(dir);
  return dir;
}

// A fake `codex` on PATH — stub the boundary, never the subject. `plugin
// list` reports a clean slate so the coexistence guard passes and the run
// reaches the filter and delete guard under test. Anything else (e.g.
// `debug prompt-input`) exits 0 with no output — if a buggy script got past
// the guard, its self-check would then fail, and the file-intact assertion
// below would catch the destruction. With `pluginListFails`, `plugin list`
// instead exits 1, to drive the guard's fail-closed path.
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

// A synthetic checkout: the real install script copied under script/, plus a
// hand-authored skills/ tree. The script derives its skill source from its
// own location, so running the copy exercises the real filter against
// fixtures whose expected outcome is written by hand — an oracle
// independent of the script's own parsing. `raw` bypasses the frontmatter
// template for fixtures that malform the file itself (CRLF endings, a
// leading blank line, missing delimiters).
function makeFixtureCheckout(
  skills: Array<{
    name: string;
    frontmatter?: string;
    body?: string;
    raw?: string;
  }>,
): string {
  const root = newTempDir("fixture-checkout");
  mkdirSync(join(root, "script"), { recursive: true });
  const script = join(root, "script", "codex-dev-install");
  copyFileSync(INSTALL_SCRIPT, script);
  chmodSync(script, 0o755);
  for (const skill of skills) {
    const dir = join(root, "skills", skill.name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "SKILL.md"),
      skill.raw ?? `---\n${skill.frontmatter}\n---\n${skill.body ?? "Body.\n"}`,
    );
  }
  return root;
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

describe("codex-dev-install", () => {
  // The "never port the cache symlink swap" rule. Scans every codex-dev-*
  // script — the uninstaller is covered by the same glob with no edit.
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

  // The delete guard: a foreign regular file inside the script-owned team/
  // directory must abort the run — non-zero exit, entry named, nothing
  // deleted. The script must never destroy user data it did not create.
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

  // The frontmatter filter against the live skills tree, asserted pointwise
  // (a re-derived expected set would restate the script's own parsing and
  // prove nothing). A skill relying on `disable-model-invocation` — a hard
  // guard Codex ignores — must never be linked. The stub codex returns an
  // empty catalog, so the self-check mismatches — and per the documented
  // semantics the run exits non-zero with the links left installed.
  test("L3 filter: live tree links entry points, never the guard-reliant skill", () => {
    const home = newTempDir("codex-home");
    const stubDir = makeStubCodexDir();

    const r = runScript(INSTALL_SCRIPT, {
      HOME: home,
      PATH: `${stubDir}:${process.env.PATH}`,
    });

    const teamDir = join(home, ".agents", "skills", "team");
    const linked = readdirSync(teamDir);
    expect(linked).toContain("shipit");
    expect(linked).toContain("code-review");
    expect(linked).not.toContain("pr-approve-watch"); // guard-reliant
    expect(linked).not.toContain("git-commit"); // user-invocable: false
    expect(r.status).toBeGreaterThan(0); // self-check mismatch on empty stub
    expect(r.output).toContain("codex-dev-uninstall"); // points at the remedy
  });

  // Fail closed on every YAML spelling of the guard: `disable-model-
  // invocation` links only when absent, or when every occurrence
  // normalizes to a recognized falsey token inside a well-formed
  // frontmatter block. Any non-falsey occurrence anywhere excludes —
  // position never matters, so a duplicate with one truthy value, an
  // over-scan that pulls a falsey body line into the region, a
  // mismatched quote pair, and a file with no delimiters at all must
  // never fail open into a link. A skill body quoting either key at
  // column 0 must never filter a *well-formed* skill — only the
  // frontmatter block decides. The scan must fail safe on malformed
  // files too: CRLF endings, a leading blank line, a `---` inside a
  // quoted value, a quoted key. And a skill dropped for any reason
  // other than a well-formed authored `user-invocable: false` must be
  // dropped LOUDLY (a per-skill Skipping line), never silently.
  test("L3 filter: fixture tree — guard spellings never link, bodies never filter", () => {
    const mustNotLink = [
      { name: "guard-plain", frontmatter: "disable-model-invocation: true" },
      { name: "guard-quoted", frontmatter: 'disable-model-invocation: "true"' },
      { name: "guard-single", frontmatter: "disable-model-invocation: 'true'" },
      { name: "guard-capital", frontmatter: "disable-model-invocation: True" },
      { name: "guard-upper", frontmatter: "disable-model-invocation: TRUE" },
      { name: "guard-yes", frontmatter: "disable-model-invocation: yes" },
      { name: "guard-on", frontmatter: "disable-model-invocation: on" },
      {
        name: "guard-tagged",
        frontmatter: "disable-model-invocation: !!bool true",
      },
      { name: "guard-spaced", frontmatter: "disable-model-invocation : true" },
      { name: "guard-bare", frontmatter: "disable-model-invocation:" },
      {
        name: "guard-quoted-key",
        frontmatter: '"disable-model-invocation": true',
      },
      {
        name: "guard-dup-last-true",
        frontmatter:
          "disable-model-invocation: false\ndisable-model-invocation: true",
      },
      {
        // Any truthy occurrence excludes, even when a later falsey one
        // would win under YAML's last-wins reading: a duplicated guard
        // key is ambiguous, and ambiguity fails closed.
        name: "guard-dup-true-then-false",
        frontmatter:
          "disable-model-invocation: true\ndisable-model-invocation: false",
      },
      {
        // Quotes are stripped only as a MATCHED pair: `"false'` must not
        // reduce to a falsey token.
        name: "guard-mismatched-quotes",
        frontmatter: "disable-model-invocation: \"false'",
      },
      {
        name: "guard-crlf",
        raw: "---\r\ndisable-model-invocation: true\r\n---\r\nBody.\r\n",
      },
      {
        name: "guard-blank-lead",
        raw: "\n---\ndisable-model-invocation: true\n---\nBody.\n",
      },
      {
        name: "guard-quoted-dashes",
        raw: [
          "---",
          'description: "one',
          "---",
          'two"',
          "disable-model-invocation: true",
          "---",
          "Body.",
          "",
        ].join("\n"),
      },
      {
        // The round-4 security repro: an unmatched quote inside a
        // description block over-scans past the closing `---`, pulling a
        // FALSEY body occurrence into the region after the real truthy
        // guard. Last-wins would fail open here; any-truthy-excludes
        // must not.
        name: "guard-overscan-falsey-body",
        raw: [
          "---",
          "description: |",
          '  Watches for the trigger word: "approve in review threads.',
          "disable-model-invocation: true",
          "---",
          "Body prose.",
          "disable-model-invocation: false",
          "",
        ].join("\n"),
      },
      {
        name: "guard-no-delimiters",
        raw: "No frontmatter at all.\ndisable-model-invocation: true\nBody.\n",
      },
      { name: "not-invocable", frontmatter: "user-invocable: false" },
      {
        name: "not-invocable-quoted",
        frontmatter: 'user-invocable: "false"',
      },
      { name: "not-invocable-upper", frontmatter: "user-invocable: FALSE" },
      {
        // A trailing YAML comment must not defeat classification: this
        // reads as false to any YAML parser and must skip.
        name: "not-invocable-comment",
        frontmatter: "user-invocable: false # not an entry point",
      },
      {
        // A delimiter-less file whose body carries the key at column 0:
        // the whole-file fallback drops it — but LOUDLY (asserted on
        // output below), never as a silent disappearance.
        name: "not-invocable-no-delimiters",
        raw: "No delimiters here.\nuser-invocable: false\nBody.\n",
      },
    ];
    const mustLink = [
      { name: "plain", frontmatter: "description: a plain skill" },
      {
        name: "guard-off",
        frontmatter: "disable-model-invocation: false",
      },
      {
        // A trailing comment on a falsey guard still reads as falsey.
        name: "guard-off-comment",
        frontmatter: "disable-model-invocation: false # opted out",
      },
      {
        // Duplicates are ambiguous only when they disagree: every
        // occurrence falsey is an unambiguous opt-out.
        name: "guard-dup-all-falsey",
        frontmatter:
          "disable-model-invocation: false\ndisable-model-invocation: no",
      },
      {
        name: "body-mention",
        frontmatter: "description: documents the keys",
        body: [
          "A fenced example documenting both keys:",
          "```yaml",
          "user-invocable: false",
          "disable-model-invocation: true",
          "```",
          "",
        ].join("\n"),
      },
    ];
    const checkout = makeFixtureCheckout([...mustNotLink, ...mustLink]);
    const home = newTempDir("codex-home");
    const stubDir = makeStubCodexDir();

    const r = runScript(join(checkout, "script", "codex-dev-install"), {
      HOME: home,
      PATH: `${stubDir}:${process.env.PATH}`,
    });

    const teamDir = join(home, ".agents", "skills", "team");
    const linked = readdirSync(teamDir).sort();
    expect(linked).toEqual(mustLink.map((s) => s.name).sort());
    expect(r.status).toBeGreaterThan(0); // self-check mismatch on empty stub
    // Loud-drop contract: a skill dropped for any reason other than a
    // well-formed authored `user-invocable: false` names itself.
    expect(r.output).toContain("Skipping not-invocable-no-delimiters");
    expect(r.output).toContain("Skipping guard-overscan-falsey-body");
    // The one silent drop: well-formed authored user-invocable: false.
    expect(r.output).not.toContain("Skipping not-invocable-comment");
    expect(r.output).not.toContain("Skipping not-invocable-quoted");
  });

  // Fail closed: when `codex plugin list` itself fails, the coexistence
  // guard proves nothing and must abort before any filesystem change —
  // never silently pass on empty output.
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

describe("codex-dev-uninstall", () => {
  // The uninstaller needs no codex on PATH (it never invokes it), so these
  // tests pass the real PATH through unchanged.

  // Mirror cleanup: remove the symlink tree, then each now-empty parent; a
  // second run finds nothing and still exits 0.
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

  // Same ownership boundary one level up: with `~/.agents` itself the
  // symlink and `skills/` a real directory inside its target, parent
  // cleanup must not reach through and remove the user's real directory.
  test("L3: symlink at ~/.agents — cleanup never reaches through", () => {
    const home = newTempDir("codex-home");
    const dotfiles = newTempDir("dotfiles");
    const realAgents = join(dotfiles, "agents");
    const teamDir = join(realAgents, "skills", "team");
    mkdirSync(teamDir, { recursive: true });
    symlinkSync(realAgents, join(home, ".agents"));
    symlinkSync(newTempDir("skill-target"), join(teamDir, "alpha"));

    const r = runScript(UNINSTALL_SCRIPT, {
      HOME: home,
      PATH: process.env.PATH ?? "",
    });

    expect(r.status).toBe(0);
    expect(existsSync(teamDir)).toBe(false); // team/ links removed
    expect(existsSync(join(realAgents, "skills"))).toBe(true); // real dir survives
    expect(lstatSync(join(home, ".agents")).isSymbolicLink()).toBe(true);
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
