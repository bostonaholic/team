// tests/dev-install-antigravity.test.ts
//
// Acceptance tests for the Antigravity half of the dev install,
// `script/dev-install-antigravity` and `script/dev-uninstall-antigravity`.
//
// Two layers:
//
// - L2 static tripwires. Read the source and assert a contract, in
//   milliseconds, executing nothing: the harness list must not drift across
//   its registration surfaces, the exclusion set stays pinned to the two
//   guarded skills, neither script may name this host's plugin root
//   `~/.gemini/config/plugins/` or reach for a path tool macOS bash 3.2 lacks,
//   the path helpers the two scripts share must stay byte-identical, and the
//   README section must carry the commands and names a reader needs. Every one
//   guards against a vacuous pass, because an extractor that finds nothing
//   makes each assertion under it green while looking at nothing.
//
// - L3 subprocess snapshots. Spawn the real bash scripts with an isolated
//   HOME in a tmpdir, then read exit status, output, and symlink state
//   through `lstat`/`readlink`. Nothing is written outside that tmpdir, and
//   nothing is ever written under the real `$HOME`.
//
// NOTHING HERE DRIVES THE REAL `agy` BINARY. It is installed (1.1.12) on the
// machine this was written on, so `run()` *replaces* PATH with SAFE_PATH
// instead of prepending to the inherited one: the live host is out of reach by
// construction rather than by luck. Whether `agy` discovers a linked skill is
// a live-host question and stays a manual PR test-plan step.
//
// Filter edge cases run against a synthetic checkout in a tmpdir — both real
// scripts copied beside a hand-authored `skills/` tree — because the scripts
// derive their source from `dirname "$0"/..` and no source-directory env
// override ships.
//
// Output contract the assertions below read, so the scripts must emit it:
// `Linked:` for each link created, `Removed:` for each link removed — by the
// uninstall's sweep and by the install reconciling a name that stopped being
// installable — `Warning:` for a name collision and for nothing else (so a
// clean run can assert none), `Error:` on an abort, and `Nothing to do` when
// uninstall finds no target directory. Every skip prints the skill name and the
// frontmatter key that caused it on one line.

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
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import { frontmatter, squash } from "./helpers/text";

// `pwd -P` in the scripts yields a physical path, so resolve this side the
// same way. On macOS `/var` is a symlink to `/private/var`, which is exactly
// where an unresolved tmpdir path would diverge from the script's own view.
const REPO_ROOT = realpathSync(join(import.meta.dir, ".."));
const SKILLS_ROOT = join(REPO_ROOT, "skills");
const INSTALL = join(REPO_ROOT, "script", "dev-install-antigravity");
const UNINSTALL = join(REPO_ROOT, "script", "dev-uninstall-antigravity");
const DEV_INSTALL = join(REPO_ROOT, "script", "dev-install");
const DEV_UNINSTALL = join(REPO_ROOT, "script", "dev-uninstall");
const DEV_YML = join(REPO_ROOT, "dev.yml");
const README = join(REPO_ROOT, "README.md");
const PORTABILITY = join(REPO_ROOT, "docs", "cross-host-portability.md");
const DOCS_INDEX = join(REPO_ROOT, "docs", "index.md");

// A PATH with no `agy` on it, and none of the machine's own bin dirs. Every
// run uses it so the real host binary can never be reached.
const SAFE_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";

// Harness name → the display name the docs matrix must use for it. A harness
// with no entry here fails the docs-matrix tripwire until someone maps it.
const HARNESS_DISPLAY_NAMES: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex CLI",
  antigravity: "Antigravity CLI",
};

// The nine installed skills that load and then find no agent to dispatch.
// The README section owes a reader all nine by name.
const AGENT_DEPENDENT_COMMANDS = [
  "team",
  "team-question",
  "team-research",
  "team-design",
  "team-structure",
  "team-plan",
  "team-implement",
  "eng-design-doc-review",
  "code-review",
];

const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { force: true, recursive: true });
});

// ---------------------------------------------------------------------------
// Defensive readers. A missing file or link must make an assertion FAIL, never
// throw — a thrown test is a broken test, not a failing one.
// ---------------------------------------------------------------------------

function readIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function linkTextOf(path: string): string {
  try {
    return readlinkSync(path);
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Isolated HOME and script invocation
// ---------------------------------------------------------------------------

/** A throwaway HOME, resolved physically so printed paths match assertions. */
function newHome(): string {
  const dir = realpathSync(
    mkdtempSync(join(tmpdir(), `antigravity-home-${process.pid}-`)),
  );
  tempDirs.push(dir);
  return dir;
}

/**
 * Put a fake `agy` first on PATH that prints `output` and exits `exitCode`.
 * The scripts shell out to `agy plugin list`; the real binary is not the
 * subject here, so it is stubbed at the boundary. Returns the dir to prepend.
 */
function stubAgy(home: string, output: string, exitCode = 0): string {
  const binDir = join(home, "stub-bin");
  mkdirSync(binDir, { recursive: true });
  const stub = join(binDir, "agy");
  writeFileSync(
    stub,
    `#!/usr/bin/env bash\nprintf '%b\\n' "${output}"\nexit ${exitCode}\n`,
  );
  chmodSync(stub, 0o755);
  return binDir;
}

/** An empty bin dir, for the case where `agy` is absent entirely. */
function emptyBinDir(home: string): string {
  const binDir = join(home, "empty-bin");
  mkdirSync(binDir, { recursive: true });
  return binDir;
}

type RunOptions = { pathPrefix?: string; path?: string };

/**
 * Run a script with an isolated HOME and a PATH that cannot reach the real
 * `agy`. `pathPrefix` prepends a stub dir to SAFE_PATH; `path` replaces PATH
 * outright.
 */
function run(script: string, home: string, options: RunOptions = {}) {
  const path =
    options.path ??
    (options.pathPrefix ? `${options.pathPrefix}:${SAFE_PATH}` : SAFE_PATH);
  const result = spawnSync("bash", [script], {
    encoding: "utf8",
    env: { ...process.env, HOME: home, PATH: path },
  });
  return {
    status: result.status ?? -1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}`,
  };
}

/** Does `agy` resolve under this PATH? The absent-binary case must prove not. */
function agyResolvesUnder(path: string): boolean {
  const probe = spawnSync("bash", ["-c", "command -v agy"], {
    encoding: "utf8",
    env: { PATH: path },
  });
  return (probe.status ?? -1) === 0;
}

// ---------------------------------------------------------------------------
// The target directory under the isolated HOME
// ---------------------------------------------------------------------------

const targetDir = (home: string) =>
  join(home, ".gemini", "config", "skills");
const targetPath = (home: string, name: string) => join(targetDir(home), name);

function ensureTargetDir(home: string): string {
  const dir = targetDir(home);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Every entry directly under the target dir, dangling links included. */
function entryNames(home: string): string[] {
  const dir = targetDir(home);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).sort();
}

/** Only the symlinks directly under the target dir. */
function linkNames(home: string): string[] {
  return entryNames(home).filter((name) => isSymlink(targetPath(home, name)));
}

/** Output lines that name `skill` as a whole token. */
function linesNaming(output: string, skill: string): string[] {
  const token = new RegExp(
    `(^|[^A-Za-z0-9._-])${skill}([^A-Za-z0-9._-]|$)`,
  );
  return output.split("\n").filter((line) => token.test(line));
}

/** Every collision-warning line. `Warning:` is reserved for collisions. */
function warningLines(output: string): string[] {
  return output.split("\n").filter((line) => line.includes("Warning:"));
}

// ---------------------------------------------------------------------------
// The real skill corpus, derived from the files. Never a hardcoded count.
// ---------------------------------------------------------------------------

function skillDirsOnDisk(): string[] {
  if (!existsSync(SKILLS_ROOT)) return [];
  return readdirSync(SKILLS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(SKILLS_ROOT, name, "SKILL.md")))
    .sort();
}

function frontmatterOf(name: string): string {
  return frontmatter(readIfExists(join(SKILLS_ROOT, name, "SKILL.md")));
}

/** Skills pass 2 drops: `user-invocable: false`. */
function nonInvocableSkills(): string[] {
  return skillDirsOnDisk().filter((name) =>
    /^user-invocable:\s*false\s*$/m.test(frontmatterOf(name)),
  );
}

/** Skills pass 3 drops: `disable-model-invocation: true`. */
function guardedSkills(): string[] {
  return skillDirsOnDisk().filter((name) =>
    /^disable-model-invocation:\s*true\s*$/m.test(frontmatterOf(name)),
  );
}

/** What the install must link: user-invocable and unguarded. */
function installableSkills(): string[] {
  const dropped = new Set([...nonInvocableSkills(), ...guardedSkills()]);
  return skillDirsOnDisk().filter((name) => !dropped.has(name));
}

// ---------------------------------------------------------------------------
// Synthetic checkout: the only way to test the filter's edge cases, since the
// scripts resolve their source from `dirname "$0"/..` (no env override ships).
// ---------------------------------------------------------------------------

type Checkout = { root: string; install: string; uninstall: string };

/**
 * A tmpdir checkout: both real scripts copied into `<tmp>/script/`, and a
 * hand-authored `skills/` tree beside them. Keys of `files` are paths under
 * `skills/`. `skillsDir: false` omits `skills/` entirely.
 *
 * A script that does not exist yet is simply not copied — the spawn then fails
 * the exit-status assertion instead of throwing here.
 */
function syntheticCheckout(
  files: Record<string, string>,
  options: { skillsDir?: boolean } = {},
): Checkout {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), `antigravity-checkout-${process.pid}-`)),
  );
  tempDirs.push(root);

  const scriptDir = join(root, "script");
  mkdirSync(scriptDir, { recursive: true });
  for (const source of [INSTALL, UNINSTALL]) {
    if (!existsSync(source)) continue;
    const destination = join(scriptDir, basename(source));
    copyFileSync(source, destination);
    chmodSync(destination, 0o755);
  }

  if (options.skillsDir !== false) {
    mkdirSync(join(root, "skills"), { recursive: true });
    for (const [relative, contents] of Object.entries(files)) {
      const file = join(root, "skills", relative);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, contents);
    }
  }

  return {
    root,
    install: join(scriptDir, "dev-install-antigravity"),
    uninstall: join(scriptDir, "dev-uninstall-antigravity"),
  };
}

/** A minimal SKILL.md. `keys` go inside the leading `---` block. */
function skillMd(name: string, keys: string[] = [], body = "Body.\n"): string {
  return ["---", `name: ${name}`, ...keys, "---", "", body].join("\n");
}

// ---------------------------------------------------------------------------
// Source extractors for the L2 tripwires
// ---------------------------------------------------------------------------

/** The `HARNESSES=(...)` array of a dispatcher, sorted. */
function harnessesIn(scriptText: string): string[] {
  const match = /^HARNESSES=\(([^)]*)\)/m.exec(scriptText);
  if (!match) return [];
  return (match[1] ?? "")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .sort();
}

/**
 * The key list of every `subcommands:` block in dev.yml, in file order. No
 * YAML parser exists in this harness, so this is a line-based indentation
 * scan: collect keys indented deeper than the `subcommands:` line itself,
 * and stop at the first line that dedents back to it or past it.
 */
function subcommandBlocks(yaml: string): string[][] {
  const lines = yaml.split("\n");
  const blocks: string[][] = [];
  for (let i = 0; i < lines.length; i++) {
    const opener = /^(\s*)subcommands:\s*$/.exec(lines[i] ?? "");
    if (!opener) continue;
    const baseIndent = (opener[1] ?? "").length;
    const keys: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j] ?? "";
      if (line.trim() === "") continue;
      const indent = line.length - line.replace(/^\s*/, "").length;
      if (indent <= baseIndent) break;
      const key = /^\s*([A-Za-z0-9_-]+)\s*:/.exec(line);
      if (key) keys.push(key[1] ?? "");
    }
    blocks.push(keys.sort());
  }
  return blocks;
}

/**
 * The text of a top-level bash function, from its `name() {` line through the
 * closing `}` in column 0. Leading comments are excluded on purpose: the two
 * scripts explain the same helper differently, and it is the code that must
 * agree.
 */
function bashFunction(scriptText: string, name: string): string {
  const start = scriptText.indexOf(`\n${name}() {\n`);
  if (start === -1) return "";
  const end = scriptText.indexOf("\n}\n", start);
  if (end === -1) return "";
  return scriptText.slice(start + 1, end + 2);
}

/** The body of the README `<details>` block whose summary names Antigravity. */
function antigravitySection(readme: string): string {
  for (const block of readme.split("<details>").slice(1)) {
    const body = block.split("</details>")[0] ?? "";
    const summary = body.split("</summary>")[0] ?? "";
    if (summary.includes("Antigravity")) return body;
  }
  return "";
}

/**
 * Top-level markdown bullets containing `needle`, each squashed so a
 * hard-wrapped bullet still matches as one phrase.
 */
function bulletsContaining(text: string, needle: string): string[] {
  return text
    .split(/\n(?=- )/)
    .filter((chunk) => chunk.startsWith("- "))
    .map((chunk) => squash(chunk))
    .filter((chunk) => chunk.includes(needle));
}

describe("dev install: antigravity harness", () => {
  describe("L2 tripwires: harness registration, pinned exclusion set, forbidden paths, README section contract", () => {
    test("every harness registration surface lists the same harnesses", () => {
      const fromInstall = harnessesIn(readIfExists(DEV_INSTALL));
      const fromUninstall = harnessesIn(readIfExists(DEV_UNINSTALL));
      const fromDevYml = subcommandBlocks(readIfExists(DEV_YML));

      // Guards: dev.yml carries one subcommands block per dispatcher, and an
      // extractor that returned nothing would make the equality below agree
      // about nothing at all.
      expect(fromDevYml.length).toBe(2);
      expect(fromInstall.length).toBeGreaterThan(0);
      expect(fromUninstall.length).toBeGreaterThan(0);
      expect((fromDevYml[0] ?? []).length).toBeGreaterThan(0);
      expect((fromDevYml[1] ?? []).length).toBeGreaterThan(0);

      // A harness registered on some surfaces but not all lands
      // half-installed: a bare `script/dev-install` runs it while `dev up`
      // cannot, or the install has no matching uninstall.
      expect(fromUninstall).toEqual(fromInstall);
      expect(fromDevYml[0] ?? []).toEqual(fromInstall);
      expect(fromDevYml[1] ?? []).toEqual(fromInstall);
      expect(fromInstall).toContain("antigravity");
    });

    test("the exclusion set is exactly the two guarded skills", () => {
      // A deliberate change detector, not a non-empty assertion. Removing the
      // guard on purpose means editing this list in the same commit, and that
      // edit is the audit trail. A rename or a reshaped value fails here with
      // no such edit.
      expect(guardedSkills()).toEqual(["pr-rebase", "pr-watch-as-reviewer"]);
    });

    test("neither script ever names this host's plugin root", () => {
      const scripts = [INSTALL, UNINSTALL].filter((path) => existsSync(path));
      // Guard against a vacuous pass if the scripts are ever renamed.
      expect(scripts.length).toBe(2);
      // `~/.gemini/config/plugins/` is Antigravity's global plugin root and
      // the cache path `agy plugin import` owns. Reading or writing it is out
      // of scope, and touching it would put Team's skills under two roots with
      // no namespace to tell them apart.
      expect(readIfExists(INSTALL)).not.toContain(".gemini/config/plugins");
      expect(readIfExists(UNINSTALL)).not.toContain(".gemini/config/plugins");
    });

    test("neither script reaches for a path tool macOS bash 3.2 does not have", () => {
      const scripts = [INSTALL, UNINSTALL].filter((path) => existsSync(path));
      // Guard against a vacuous pass if the scripts are ever renamed.
      expect(scripts.length).toBe(2);

      // `readlink -f`, `realpath`, and `mapfile` are all absent from the
      // /bin/bash 3.2.57 + BSD userland a stock macOS ships, and all three are
      // present once a developer installs coreutils or a newer bash. So the
      // L3 runs below can pass on the author's machine and fail on a
      // colleague's, which is exactly the drift a static check catches and a
      // subprocess snapshot cannot.
      const found: string[] = [];
      for (const script of scripts) {
        // Comment lines are excluded on purpose: both scripts name these three
        // tools in a header comment to record why they are avoided, and the
        // contract is about what the script executes.
        const code = readIfExists(script)
          .split("\n")
          .filter((line) => !/^\s*#/.test(line))
          .join("\n");
        for (const tool of ["readlink -f", "realpath", "mapfile"]) {
          if (code.includes(tool)) found.push(`${basename(script)}: ${tool}`);
        }
      }
      expect(found).toEqual([]);
    });

    test("the path helpers the two scripts share are byte-identical", () => {
      // Duplicated verbatim rather than sourced from a shared file, so each
      // script stays a single file a reader can follow end to end. The install
      // then states that its ownership rule "is also the uninstall's sweep
      // criterion read forward, which is what keeps the two scripts agreeing" —
      // a claim only this test makes true. Desynchronizing them means one script
      // attributes a link to a checkout the other one will not.
      const installText = readIfExists(INSTALL);
      const uninstallText = readIfExists(UNINSTALL);

      for (const name of [
        "link_target_path",
        "link_target_parent",
        "link_text_parent",
        "link_owner_dir",
      ]) {
        const fromInstall = bashFunction(installText, name);
        const fromUninstall = bashFunction(uninstallText, name);
        // Guard: an extractor that found neither would compare "" to "".
        expect(fromInstall.length).toBeGreaterThan(0);
        expect(fromUninstall.length).toBeGreaterThan(0);
        expect(fromUninstall).toBe(fromInstall);
      }
    });

    test("the README Antigravity section carries the commands, paths, and names", () => {
      const section = squash(antigravitySection(readIfExists(README)));
      // Guard: a missing section must fail, not vacuously pass every absence
      // check below. A negative check has to be able to find a positive.
      expect(section.length).toBeGreaterThan(0);

      // The scripts are the only supported install and uninstall.
      expect(section).toContain("script/dev-install antigravity");
      expect(section).toContain("script/dev-uninstall antigravity");
      expect(section).toContain("~/.gemini/config/skills");

      // The two guarded skills are named as NOT installed, and every
      // agent-dependent command is named so the limitation is discoverable.
      const unnamedGuarded = guardedSkills().filter(
        (name) => !section.includes(name),
      );
      expect(unnamedGuarded).toEqual([]);

      // The slash-command form on its own: `/team` must appear as itself, not
      // only inside `/team-question`.
      const unnamedCommands = AGENT_DEPENDENT_COMMANDS.filter(
        (name) => !new RegExp(`/${name}(?![\\w-])`).test(section),
      );
      expect(unnamedCommands).toEqual([]);

      // No copyable recipe: `rm -rf` inside a link deletes checkout files,
      // a bare `ln -s` bypasses every safeguard the script carries, and
      // `agy plugin import` writes to the forbidden plugin root.
      expect(section).not.toContain("rm -rf");
      expect(section).not.toContain("ln -s");
      expect(section).not.toContain("agy plugin import");
    });
  });

  describe("L3: install links exactly the user-invocable unguarded skills, names every skip with its reason, and re-runs idempotently", () => {
    test("install links exactly the user-invocable unguarded skills", () => {
      const home = newHome();
      const installable = installableSkills();
      // Guard: an empty corpus would make every assertion below vacuous.
      expect(installable.length).toBeGreaterThan(0);

      const { status, output } = run(INSTALL, home);

      expect(status).toBe(0);
      expect(output).toContain("Linked:");
      expect(linkNames(home)).toEqual(installable);
      expect(linkNames(home)).toContain("shipit");

      // Each link points into this checkout, which is what makes an edit to a
      // SKILL.md live in the next session.
      expect(installable.map((name) => linkTextOf(targetPath(home, name)))).toEqual(
        installable.map((name) => join(SKILLS_ROOT, name)),
      );

      // Nothing filtered out may leave any entry behind, link or otherwise.
      const present = entryNames(home);
      const leaked = [...nonInvocableSkills(), ...guardedSkills()].filter(
        (name) => present.includes(name),
      );
      expect(leaked).toEqual([]);
    });

    test("install names every skip with the frontmatter key that caused it", () => {
      const { output } = run(INSTALL, newHome());

      const droppedByPass2 = nonInvocableSkills();
      const droppedByPass3 = guardedSkills();
      expect(droppedByPass2.length).toBeGreaterThan(0);
      expect(droppedByPass3.length).toBeGreaterThan(0);

      const unexplainedPass2 = droppedByPass2.filter(
        (name) =>
          !linesNaming(output, name).some((line) =>
            line.includes("user-invocable"),
          ),
      );
      expect(unexplainedPass2).toEqual([]);

      const unexplainedPass3 = droppedByPass3.filter(
        (name) =>
          !linesNaming(output, name).some((line) =>
            line.includes("disable-model-invocation"),
          ),
      );
      expect(unexplainedPass3).toEqual([]);
    });

    test("install re-runs idempotently", () => {
      const home = newHome();
      expect(run(INSTALL, home).status).toBe(0);
      const first = linkNames(home);

      const second = run(INSTALL, home);

      expect(second.status).toBe(0);
      expect(linkNames(home)).toEqual(first);
      expect(linkNames(home)).toEqual(installableSkills());
    });

    test("install exits 1 on a missing skills/ and creates nothing under HOME", () => {
      const checkout = syntheticCheckout({}, { skillsDir: false });
      const home = newHome();

      const { status, output } = run(checkout.install, home);

      expect(status).toBe(1);
      expect(output).toContain(checkout.root);
      expect(existsSync(join(home, ".gemini"))).toBe(false);
    });

    test("install exits 1 on an empty skills/ and creates nothing under HOME", () => {
      const checkout = syntheticCheckout({});
      const home = newHome();

      const { status } = run(checkout.install, home);

      expect(status).toBe(1);
      expect(existsSync(join(home, ".gemini"))).toBe(false);
    });

    test("install ignores a directory with no SKILL.md without erroring", () => {
      const checkout = syntheticCheckout({
        "alpha/SKILL.md": skillMd("alpha"),
        "not-a-skill/README.md": "Shared notes. Not a skill.\n",
      });
      const home = newHome();

      const { status } = run(checkout.install, home);

      expect(status).toBe(0);
      expect(linkNames(home)).toEqual(["alpha"]);
      expect(entryNames(home)).not.toContain("not-a-skill");
    });

    test("install exits 1 when every skill is filtered out", () => {
      const checkout = syntheticCheckout({
        "methodology/SKILL.md": skillMd("methodology", [
          "user-invocable: false",
        ]),
        "guarded/SKILL.md": skillMd("guarded", [
          "disable-model-invocation: true",
        ]),
      });
      const home = newHome();

      const { status } = run(checkout.install, home);

      // A zero-link success would read as an install that worked.
      expect(status).toBe(1);
      expect(existsSync(join(home, ".gemini"))).toBe(false);
    });

    test("install exits 1 naming the file and value on a quoted guard value", () => {
      // `disable-model-invocation: "true"` read as a plain string would
      // install the very skill the guard holds back.
      const checkout = syntheticCheckout({
        "alpha/SKILL.md": skillMd("alpha"),
        "quoted/SKILL.md": skillMd("quoted", [
          'disable-model-invocation: "true"',
        ]),
      });
      const home = newHome();

      const { status, output } = run(checkout.install, home);

      expect(status).toBe(1);
      expect(output).toContain(
        join(checkout.root, "skills", "quoted", "SKILL.md"),
      );
      expect(output).toContain('"true"');
      expect(existsSync(join(home, ".gemini"))).toBe(false);
    });

    test("install exits 1 naming the file when a SKILL.md has no frontmatter block", () => {
      const checkout = syntheticCheckout({
        "alpha/SKILL.md": skillMd("alpha"),
        "bare/SKILL.md": "# bare\n\nNo leading --- block at all.\n",
      });
      const home = newHome();

      const { status, output } = run(checkout.install, home);

      expect(status).toBe(1);
      expect(output).toContain(
        join(checkout.root, "skills", "bare", "SKILL.md"),
      );
      expect(existsSync(join(home, ".gemini"))).toBe(false);
    });

    test("pass 3 excludes true, includes false, and includes an absent key", () => {
      const checkout = syntheticCheckout({
        "absent-key/SKILL.md": skillMd("absent-key"),
        "explicit-false/SKILL.md": skillMd("explicit-false", [
          "disable-model-invocation: false",
        ]),
        "guarded/SKILL.md": skillMd("guarded", [
          "disable-model-invocation: true",
        ]),
      });
      const home = newHome();

      const { status, output } = run(checkout.install, home);

      expect(status).toBe(0);
      expect(linkNames(home)).toEqual(["absent-key", "explicit-false"]);
      expect(linesNaming(output, "guarded").join("\n")).toContain(
        "disable-model-invocation",
      );
    });

    test("pass 2 fails open on a user-invocable value it cannot read", () => {
      // Deliberate asymmetry with pass 3: the worst case here is one extra
      // catalog entry, not a hazardous skill, so only pass 3 aborts.
      const checkout = syntheticCheckout({
        "alpha/SKILL.md": skillMd("alpha"),
        "unreadable/SKILL.md": skillMd("unreadable", [
          'user-invocable: "false"',
        ]),
      });
      const home = newHome();

      const { status } = run(checkout.install, home);

      expect(status).toBe(0);
      expect(linkNames(home)).toEqual(["alpha", "unreadable"]);
    });

    test("a guard key in the body outside the frontmatter does not filter a skill", () => {
      // Both keys appear in skill bodies and in README prose, so a whole-file
      // grep misclassifies. The read is scoped to the leading --- block.
      const checkout = syntheticCheckout({
        "documenter/SKILL.md": skillMd("documenter", [], [
          "Two keys this skill documents rather than sets:",
          "",
          "user-invocable: false",
          "disable-model-invocation: true",
          "",
        ].join("\n")),
      });
      const home = newHome();

      const { status } = run(checkout.install, home);

      expect(status).toBe(0);
      expect(linkNames(home)).toEqual(["documenter"]);
    });

    test("install exits 1 naming the file when the frontmatter keys are indented", () => {
      // YAML permits an indented root mapping, so this document really does set
      // the guard — Ruby's Psych parses it as `disable-model-invocation: true`.
      // A reader that called the key absent here would link the one skill the
      // guard holds back, which is the only reshaped-frontmatter case that could
      // fail open rather than loud.
      const checkout = syntheticCheckout({
        "alpha/SKILL.md": skillMd("alpha"),
        "indented/SKILL.md":
          "---\n name: indented\n disable-model-invocation: true\n---\n\nBody.\n",
      });
      const home = newHome();

      const { status, output } = run(checkout.install, home);

      expect(status).toBe(1);
      expect(output).toContain(
        join(checkout.root, "skills", "indented", "SKILL.md"),
      );
      expect(existsSync(join(home, ".gemini"))).toBe(false);
    });

    test("a block scalar whose lines read like the guard keys does not filter a skill", () => {
      // The other half of the indentation rule, and the reason it may not
      // simply match a key at any indentation: a `description: |` body is
      // indented too, and `skills/pr-rebase/SKILL.md` carries one. Matching
      // there would filter skills on words inside a description.
      const checkout = syntheticCheckout({
        "alpha/SKILL.md": skillMd("alpha"),
        "described/SKILL.md": [
          "---",
          "name: described",
          "description: |",
          "  What this skill does, at length.",
          "  disable-model-invocation: true",
          "  user-invocable: false",
          "---",
          "",
          "Body.",
          "",
        ].join("\n"),
      });
      const home = newHome();

      const { status } = run(checkout.install, home);

      expect(status).toBe(0);
      expect(linkNames(home)).toEqual(["alpha", "described"]);
    });
  });

  describe("L3: a re-run reconciles a skill that stopped being installable, and the guarded note reports what each path holds", () => {
    /** A checkout with two plain skills, installed once into a fresh HOME. */
    function installedPair() {
      const checkout = syntheticCheckout({
        "alpha/SKILL.md": skillMd("alpha"),
        "beta/SKILL.md": skillMd("beta"),
      });
      const home = newHome();
      expect(run(checkout.install, home).status).toBe(0);
      expect(linkNames(home)).toEqual(["alpha", "beta"]);
      return { checkout, home };
    }

    function rewriteSkill(checkout: Checkout, name: string, keys: string[]) {
      writeFileSync(
        join(checkout.root, "skills", name, "SKILL.md"),
        skillMd(name, keys),
      );
    }

    test("a skill that gains the model-invocation guard loses its link on the next run", () => {
      // The upgrade path, and the reason the install reconciles instead of only
      // adding: on a host with no trust gate, a link left behind keeps a
      // model-invocable skill live in every session. `git pull` plus a re-run
      // is the whole trigger, and it must need no developer action.
      const { checkout, home } = installedPair();
      rewriteSkill(checkout, "beta", ["disable-model-invocation: true"]);

      const { status, output } = run(checkout.install, home);

      expect(status).toBe(0);
      expect(linkNames(home)).toEqual(["alpha"]);
      expect(entryNames(home)).toEqual(["alpha"]);
      expect(output).toContain("Removed:");
      expect(output).toContain(targetPath(home, "beta"));
    });

    test("the guarded note reports the observed path state, never the run's intent", () => {
      const { checkout, home } = installedPair();
      rewriteSkill(checkout, "beta", ["disable-model-invocation: true"]);

      const noteLines = linesNaming(run(checkout.install, home).output, "beta");

      // A note that stated intent could say "not installed" about a link that is
      // still on disk. Every line about a held-back skill names the path.
      expect(noteLines.length).toBeGreaterThan(0);
      expect(noteLines.join("\n")).toContain(targetPath(home, "beta"));
      expect(noteLines.join("\n")).not.toContain("not installed");
    });

    test("a skill that gains user-invocable: false loses its link on the next run", () => {
      const { checkout, home } = installedPair();
      rewriteSkill(checkout, "beta", ["user-invocable: false"]);

      const { status } = run(checkout.install, home);

      expect(status).toBe(0);
      expect(entryNames(home)).toEqual(["alpha"]);
    });

    test("reconciliation removes only this checkout's own link at an excluded name", () => {
      const { checkout, home } = installedPair();
      rewriteSkill(checkout, "beta", ["disable-model-invocation: true"]);
      // The user's own folder at the same name is not this install's to touch,
      // and the guard on beta is no license to remove it.
      rmSync(targetPath(home, "beta"));
      const own = targetPath(home, "beta");
      mkdirSync(own, { recursive: true });
      writeFileSync(join(own, "SKILL.md"), skillMd("my-own-thing"));

      const { status, output } = run(checkout.install, home);

      expect(status).toBe(0);
      expect(readIfExists(join(own, "SKILL.md"))).toContain("name: my-own-thing");
      expect(linesNaming(output, "beta").join("\n")).toContain("directory");
    });

    test("reconciliation leaves another checkout's link at a name that stopped being user-invocable", () => {
      // The ownership rule on its own terms. The sibling test above uses a
      // directory, which `rm` refuses anyway, so a build that dropped the
      // ownership check would still pass it. A symlink is removable, so only
      // the check itself keeps this one on disk.
      const { checkout, home } = installedPair();
      rewriteSkill(checkout, "beta", ["user-invocable: false"]);
      const other = syntheticCheckout({ "beta/SKILL.md": skillMd("beta") });
      const foreignTarget = join(other.root, "skills", "beta");
      rmSync(targetPath(home, "beta"));
      symlinkSync(foreignTarget, targetPath(home, "beta"));

      const { status } = run(checkout.install, home);

      // Exit 0, unlike the guarded case below: a methodology skill nobody can
      // invoke by name is tidiness, and the abort is reserved for the set whose
      // whole point is that it must not be reachable.
      expect(status).toBe(0);
      expect(linkTextOf(targetPath(home, "beta"))).toBe(foreignTarget);
    });

    test("install exits 1 when another checkout's link keeps a guarded skill installed", () => {
      // Reconciliation removes only this checkout's own links, so a link
      // another checkout wrote before the guard existed would outlive every
      // run — leaving a model-invocable skill live in every session on a host
      // with no trust gate. Two checkouts is the ordinary case here: Team's own
      // pipeline works inside `.claude/worktrees/`.
      const other = syntheticCheckout({ "beta/SKILL.md": skillMd("beta") });
      const checkout = syntheticCheckout({
        "alpha/SKILL.md": skillMd("alpha"),
        "beta/SKILL.md": skillMd("beta", ["disable-model-invocation: true"]),
      });
      const home = newHome();
      ensureTargetDir(home);
      const foreignTarget = join(other.root, "skills", "beta");
      symlinkSync(foreignTarget, targetPath(home, "beta"));

      const { status, output } = run(checkout.install, home);

      expect(status).toBe(1);
      expect(output).toContain(targetPath(home, "beta"));
      expect(output).toContain(foreignTarget);
      // The same remediation a foreign link at an installable name already
      // prints, because it is the same act that clears it.
      expect(output).toContain("script/dev-uninstall antigravity");
      // Never clobbered, and nothing else written: the abort is a stop, not a
      // takeover of a path this checkout does not own.
      expect(linkTextOf(targetPath(home, "beta"))).toBe(foreignTarget);
      expect(entryNames(home)).toEqual(["beta"]);
    });

    test("a dangling link at a guarded name is reported rather than an abort", () => {
      // The boundary of the rule above. This link resolves to nothing, so it
      // holds no skill open, and the note at the end of the run says what sits
      // there. Aborting on it would block the install over a state with no
      // consequence.
      const checkout = syntheticCheckout({
        "alpha/SKILL.md": skillMd("alpha"),
        "beta/SKILL.md": skillMd("beta", ["disable-model-invocation: true"]),
      });
      const home = newHome();
      ensureTargetDir(home);
      symlinkSync(
        join(home, "gone-checkout", "skills", "beta"),
        targetPath(home, "beta"),
      );

      const { status, output } = run(checkout.install, home);

      expect(status).toBe(0);
      expect(linkNames(home)).toContain("alpha");
      expect(linesNaming(output, "beta").join("\n")).toContain(
        targetPath(home, "beta"),
      );
    });

    test("a re-run distinguishes itself from a fresh install in its counts", () => {
      // A developer cannot tell a no-op from real work if both runs print the
      // same bytes.
      const { checkout, home } = installedPair();
      const first = run(checkout.install, newHome()).output;

      const second = run(checkout.install, home).output;

      expect(first).toContain("2 newly linked");
      expect(second).toContain("0 newly linked");
      expect(second).toContain("2 already linked");
    });
  });

  describe("L3: install writes nothing on an occupied target path or an unreadable guard value, and uninstall removes only what this checkout owns", () => {
    // Any installable skill works; the pre-check is per path, so one occupied
    // path aborts the whole run.
    const OCCUPIED = "groom-backlog";

    test("install exits 1 when a directory occupies a target path", () => {
      expect(installableSkills()).toContain(OCCUPIED);
      const home = newHome();
      const occupied = targetPath(home, OCCUPIED);
      mkdirSync(occupied, { recursive: true });
      writeFileSync(join(occupied, "SKILL.md"), skillMd("my-own-thing"));

      const { status, output } = run(INSTALL, home);

      expect(status).toBe(1);
      expect(output).toContain(occupied);
      expect(linkNames(home)).toEqual([]);
      expect(entryNames(home)).not.toContain("shipit");
      expect(readIfExists(join(occupied, "SKILL.md"))).toContain(
        "name: my-own-thing",
      );
    });

    test("install exits 1 when a regular file occupies a target path", () => {
      expect(installableSkills()).toContain(OCCUPIED);
      const home = newHome();
      ensureTargetDir(home);
      const occupied = targetPath(home, OCCUPIED);
      writeFileSync(occupied, "not ours\n");

      const { status, output } = run(INSTALL, home);

      expect(status).toBe(1);
      expect(output).toContain(occupied);
      expect(readFileSync(occupied, "utf8")).toBe("not ours\n");
      expect(entryNames(home)).not.toContain("shipit");
    });

    test("install exits 1 when a target path holds another checkout's link", () => {
      expect(installableSkills()).toContain(OCCUPIED);
      const other = syntheticCheckout({
        [`${OCCUPIED}/SKILL.md`]: skillMd(OCCUPIED),
      });
      const home = newHome();
      ensureTargetDir(home);
      const foreignTarget = join(other.root, "skills", OCCUPIED);
      symlinkSync(foreignTarget, targetPath(home, OCCUPIED));

      const { status, output } = run(INSTALL, home);

      expect(status).toBe(1);
      expect(output).toContain(targetPath(home, OCCUPIED));
      expect(output).toContain(foreignTarget);
      // Never clobbered: no test separates another checkout's link from the
      // user's own, and uninstall could not restore either one.
      expect(linkTextOf(targetPath(home, OCCUPIED))).toBe(foreignTarget);
      expect(entryNames(home)).not.toContain("shipit");
    });

    test("install exits 1 when a target path holds a link into the user's own skill folder", () => {
      expect(installableSkills()).toContain(OCCUPIED);
      const home = newHome();
      ensureTargetDir(home);
      const userSkill = join(home, "my-skills", OCCUPIED);
      mkdirSync(userSkill, { recursive: true });
      writeFileSync(join(userSkill, "SKILL.md"), skillMd("my-own-thing"));
      symlinkSync(userSkill, targetPath(home, OCCUPIED));

      const { status, output } = run(INSTALL, home);

      expect(status).toBe(1);
      expect(output).toContain(targetPath(home, OCCUPIED));
      expect(output).toContain(userSkill);
      expect(linkTextOf(targetPath(home, OCCUPIED))).toBe(userSkill);
      expect(entryNames(home)).not.toContain("shipit");
    });

    test("install exits 1 when a target path holds a dangling absolute link", () => {
      expect(installableSkills()).toContain(OCCUPIED);
      const home = newHome();
      ensureTargetDir(home);
      // The parent resolves, so the link is attributable; the leaf is gone,
      // so the path is not one this checkout owns.
      const goneParent = join(home, "removed-checkout", "skills");
      mkdirSync(goneParent, { recursive: true });
      const dangling = join(goneParent, OCCUPIED);
      symlinkSync(dangling, targetPath(home, OCCUPIED));

      const { status, output } = run(INSTALL, home);

      expect(status).toBe(1);
      expect(output).toContain(targetPath(home, OCCUPIED));
      expect(output).toContain(dangling);
      expect(entryNames(home)).not.toContain("shipit");
    });

    test("install exits 1 when a target path holds an unresolvable relative link", () => {
      expect(installableSkills()).toContain(OCCUPIED);
      const home = newHome();
      ensureTargetDir(home);
      symlinkSync("../../nowhere/skills/x", targetPath(home, OCCUPIED));

      const { status, output } = run(INSTALL, home);

      expect(status).toBe(1);
      expect(output).toContain(targetPath(home, OCCUPIED));
      expect(output).toContain("../../nowhere/skills/x");
      expect(output).toContain("relative");
      expect(entryNames(home)).not.toContain("shipit");
    });

    test("install names the missing directory when an absolute link's checkout is gone", () => {
      // Removing a worktree you installed from is the ordinary way to reach
      // this, since Team's own pipeline works inside `.claude/worktrees/`. The
      // link text is absolute and names a real path, so calling it relative and
      // unresolvable would send the reader looking for the wrong thing.
      expect(installableSkills()).toContain(OCCUPIED);
      const home = newHome();
      ensureTargetDir(home);
      const goneSkills = join(home, "gone-worktree", "skills");
      const goneTarget = join(goneSkills, OCCUPIED);
      symlinkSync(goneTarget, targetPath(home, OCCUPIED));

      const { status, output } = run(INSTALL, home);

      expect(status).toBe(1);
      expect(output).toContain(goneSkills);
      expect(output).not.toContain("relative");
      // The advice must not stop at "run the uninstall from the owning
      // checkout": that checkout is what went missing.
      expect(output).toContain("removing that link");
      expect(entryNames(home)).not.toContain("shipit");
    });

    test("install names the mismatch when a link points into this checkout under another skill's name", () => {
      expect(installableSkills()).toContain(OCCUPIED);
      const home = newHome();
      ensureTargetDir(home);
      const otherSkill = installableSkills().filter(
        (name) => name !== OCCUPIED,
      )[0] as string;
      symlinkSync(join(SKILLS_ROOT, otherSkill), targetPath(home, OCCUPIED));

      const { status, output } = run(INSTALL, home);

      expect(status).toBe(1);
      // The path displayed is this checkout's own, so "a symlink this checkout
      // does not own" would contradict what the same line prints.
      const reason = linesNaming(output, otherSkill).join("\n");
      expect(reason).toContain(OCCUPIED);
      expect(reason).not.toContain("does not own");
      expect(entryNames(home)).not.toContain("shipit");
    });

    test("a second checkout's install aborts naming the owning checkout and the uninstall command", () => {
      const files = {
        "alpha/SKILL.md": skillMd("alpha"),
        "beta/SKILL.md": skillMd("beta"),
      };
      const owner = syntheticCheckout(files);
      const newcomer = syntheticCheckout(files);
      const home = newHome();
      expect(run(owner.install, home).status).toBe(0);

      const { status, output } = run(newcomer.install, home);

      expect(status).toBe(1);
      expect(output).toContain(join(owner.root, "skills", "alpha"));
      expect(output).toContain("script/dev-uninstall antigravity");
      expect(linkTextOf(targetPath(home, "alpha"))).toBe(
        join(owner.root, "skills", "alpha"),
      );
    });

    test("uninstall removes every owned link and leaves every parent directory", () => {
      const home = newHome();
      expect(run(INSTALL, home).status).toBe(0);

      const { status, output } = run(UNINSTALL, home);

      expect(status).toBe(0);
      expect(output).toContain("Removed:");
      expect(entryNames(home)).toEqual([]);
      expect(existsSync(targetDir(home))).toBe(true);
      expect(existsSync(join(home, ".gemini", "config"))).toBe(true);
      expect(existsSync(join(home, ".gemini"))).toBe(true);
    });

    test("uninstall exits 0 when the target directory does not exist", () => {
      const home = newHome();

      const { status, output } = run(UNINSTALL, home);

      expect(status).toBe(0);
      expect(output).toContain("Nothing to do");
      expect(existsSync(join(home, ".gemini"))).toBe(false);
    });

    test("uninstall leaves a foreign link, a foreign directory, and an unattributable link, naming each, and exits 0", () => {
      const home = newHome();
      expect(run(INSTALL, home).status).toBe(0);
      const other = syntheticCheckout({
        "elsewhere/SKILL.md": skillMd("elsewhere"),
      });
      const foreignTarget = join(other.root, "skills", "elsewhere");
      symlinkSync(foreignTarget, targetPath(home, "foreign-link"));
      const foreignDir = targetPath(home, "foreign-dir");
      mkdirSync(foreignDir, { recursive: true });
      writeFileSync(join(foreignDir, "SKILL.md"), skillMd("foreign-dir"));
      symlinkSync("../../nowhere/skills/zz", targetPath(home, "unattributable"));

      const { status, output } = run(UNINSTALL, home);

      // Exit 0 for everything it does not own: the sweep's whole job is to
      // remove what this checkout owns, and a user's own folder in the skill
      // directory must not make a bare `script/dev-uninstall` fail forever.
      expect(status).toBe(0);
      // Exactly the three foreign entries survive, so every link this
      // checkout owned is gone.
      expect(entryNames(home)).toEqual([
        "foreign-dir",
        "foreign-link",
        "unattributable",
      ]);
      expect(output).toContain("foreign-link");
      expect(output).toContain(foreignTarget);
      expect(output).toContain("foreign-dir");
      expect(output).toContain("unattributable");
      expect(existsSync(join(home, ".gemini", "config"))).toBe(true);
    });

    test("uninstall sweeps an orphan link by its resolved target, not by its name", () => {
      const home = newHome();
      ensureTargetDir(home);
      // Named nothing like its target, and the target no longer exists —
      // selection is by link text alone.
      symlinkSync(
        join(SKILLS_ROOT, "deleted-skill"),
        targetPath(home, "zz-orphan"),
      );

      const { status, output } = run(UNINSTALL, home);

      expect(status).toBe(0);
      expect(output).toContain("Removed:");
      expect(entryNames(home)).not.toContain("zz-orphan");
    });

    test("uninstall sweeps its own links after this checkout's skills/ is gone", () => {
      // A checkout whose skills/ has been deleted still owns links that point
      // into it, and nothing else can attribute them. Both sides of the
      // ownership comparison fall back to the lexical path, so the link text
      // naming this checkout is enough.
      const checkout = syntheticCheckout({
        "alpha/SKILL.md": skillMd("alpha"),
        "beta/SKILL.md": skillMd("beta"),
      });
      const home = newHome();
      expect(run(checkout.install, home).status).toBe(0);
      rmSync(join(checkout.root, "skills"), { force: true, recursive: true });

      const { status, output } = run(checkout.uninstall, home);

      expect(status).toBe(0);
      expect(output).toContain("Removed:");
      expect(entryNames(home)).toEqual([]);
      expect(existsSync(targetDir(home))).toBe(true);
    });

    test("uninstall leaves a link naming another checkout whose skills/ is gone", () => {
      const owner = syntheticCheckout({ "alpha/SKILL.md": skillMd("alpha") });
      const sweeper = syntheticCheckout({ "alpha/SKILL.md": skillMd("alpha") });
      const home = newHome();
      expect(run(owner.install, home).status).toBe(0);
      rmSync(join(owner.root, "skills"), { force: true, recursive: true });

      const { status, output } = run(sweeper.uninstall, home);

      // Attributable now, and attributable to someone else: the lexical
      // fallback must not widen the sweep past this checkout's own links.
      expect(status).toBe(0);
      expect(entryNames(home)).toEqual(["alpha"]);
      expect(output).toContain("Left in place:");
      expect(output).toContain(join(owner.root, "skills", "alpha"));
      expect(output).not.toContain("relative");
      // The install says this about the same state, and a developer chasing a
      // leftover link needs the same detail from either script: the checkout it
      // names is gone, so no uninstall run from anywhere will clear it.
      expect(output).toContain("no longer exists");
    });

    test("uninstall names an unresolvable relative link as relative", () => {
      const home = newHome();
      ensureTargetDir(home);
      symlinkSync("../../nowhere/skills/x", targetPath(home, "zz-relative"));

      const { status, output } = run(UNINSTALL, home);

      expect(status).toBe(0);
      expect(entryNames(home)).toEqual(["zz-relative"]);
      expect(linesNaming(output, "zz-relative").join("\n")).toContain(
        "relative",
      );
    });
  });

  describe("L3: install warns on a sibling entry whose frontmatter name matches a Team skill, links anyway at exit 0, and reports no collision for its own links on a re-run", () => {
    test("install warns naming both the sibling directory and the shadowed Team skill", () => {
      expect(installableSkills()).toContain("shipit");
      const home = newHome();
      const sibling = targetPath(home, "my-ship");
      mkdirSync(sibling, { recursive: true });
      writeFileSync(join(sibling, "SKILL.md"), skillMd("shipit"));

      const { status, output } = run(INSTALL, home);

      // A warning never changes the exit status: Team's link is still made,
      // and the host picks the winner by precedence.
      expect(status).toBe(0);
      const warnings = warningLines(output);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.join("\n")).toContain("my-ship");
      expect(warnings.join("\n")).toContain("shipit");
      expect(linkNames(home)).toContain("shipit");
    });

    test("a re-run over this checkout's own links reports no collision", () => {
      const home = newHome();
      expect(run(INSTALL, home).status).toBe(0);

      const second = run(INSTALL, home);

      expect(second.status).toBe(0);
      // Without the own-links skip every one of Team's links reports as a
      // collision, because each `name:` matches by construction. The test
      // above is this negative check's positive control: it proves a
      // `Warning:` line can be produced at all.
      expect(warningLines(second.output)).toEqual([]);
    });

    test("a sibling with no SKILL.md and one with no name key are neither a collision nor an error", () => {
      const home = newHome();
      mkdirSync(targetPath(home, "no-skill-file"), { recursive: true });
      const noNameKey = targetPath(home, "no-name-key");
      mkdirSync(noNameKey, { recursive: true });
      writeFileSync(
        join(noNameKey, "SKILL.md"),
        "---\ndescription: no name key here\n---\n\nBody.\n",
      );

      const { status, output } = run(INSTALL, home);

      expect(status).toBe(0);
      expect(warningLines(output)).toEqual([]);
      expect(linkNames(home)).toEqual(installableSkills());
    });
  });

  describe("L3: install aborts on an installed team@ plugin row and proceeds when agy is absent or erroring", () => {
    test("install aborts on an installed team@ plugin row", () => {
      const home = newHome();
      const stub = stubAgy(
        home,
        "PLUGIN         STATUS              VERSION  PATH\\nteam@team-dev  installed, enabled  0.43.1   /somewhere",
      );

      const { status, output } = run(INSTALL, home, { pathPrefix: stub });

      // Stacking on a native install loads every skill twice, and with no
      // namespace on this host the double-load shadows rather than errors.
      expect(status).toBe(1);
      expect(output).toContain("team@team-dev");
      expect(existsSync(targetDir(home))).toBe(false);
    });

    test("install proceeds past a registered-but-uninstalled plugin row", () => {
      const home = newHome();
      const stub = stubAgy(
        home,
        "PLUGIN         STATUS         VERSION  PATH\\nteam@team-dev  not installed           /somewhere",
      );

      const { status } = run(INSTALL, home, { pathPrefix: stub });

      expect(status).toBe(0);
      expect(linkNames(home)).toEqual(installableSkills());
    });

    test("install proceeds when agy exits non-zero", () => {
      const home = newHome();
      const stub = stubAgy(home, "agy: error: could not read plugin state", 3);

      const { status } = run(INSTALL, home, { pathPrefix: stub });

      expect(status).toBe(0);
      expect(linkNames(home)).toEqual(installableSkills());
    });

    test("install proceeds when agy is absent", () => {
      const home = newHome();
      const path = `${emptyBinDir(home)}:/usr/bin:/bin`;
      // A real `agy` sits on this machine's PATH, so replace PATH rather than
      // prepend to it, and prove the replacement really hides the binary —
      // otherwise this case silently exercises the live host.
      expect(agyResolvesUnder(path)).toBe(false);

      const { status } = run(INSTALL, home, { path });

      expect(status).toBe(0);
      expect(linkNames(home)).toEqual(installableSkills());
    });
  });

  describe("L2: every harness in script/dev-install's HARNESSES reaches the docs matrix surfaces (docs/index.md portability line, docs/cross-host-portability.md scope line)", () => {
    test("every harness has a docs display name", () => {
      const harnesses = harnessesIn(readIfExists(DEV_INSTALL));
      expect(harnesses.length).toBeGreaterThan(0);
      expect(harnesses).toContain("antigravity");

      // A fourth harness fails here until someone maps it, which is what
      // makes the two docs assertions below reach every harness.
      const unmapped = harnesses.filter(
        (harness) => !(harness in HARNESS_DISPLAY_NAMES),
      );
      expect(unmapped).toEqual([]);
    });

    test("the portability scope bullet names every harness", () => {
      const harnesses = harnessesIn(readIfExists(DEV_INSTALL));
      // Guard: until antigravity is a harness, the assertions below say
      // nothing about this feature.
      expect(harnesses).toContain("antigravity");

      const scope = bulletsContaining(readIfExists(PORTABILITY), "in the matrix");
      // Guard: the extractor must find exactly the one bullet, or it is
      // measuring the wrong text.
      expect(scope.length).toBe(1);

      // One-directional on purpose: Gemini CLI is in the matrix and is not a
      // harness, so the matrix may name more than this list.
      const bullet = scope[0] ?? "";
      const missing = harnesses
        .map((harness) => HARNESS_DISPLAY_NAMES[harness] ?? harness)
        .filter((display) => !bullet.includes(display));
      expect(missing).toEqual([]);
    });

    test("the docs index portability bullet names every non-Claude harness", () => {
      const harnesses = harnessesIn(readIfExists(DEV_INSTALL));
      expect(harnesses).toContain("antigravity");

      const bullet = bulletsContaining(
        readIfExists(DOCS_INDEX),
        "cross-host-portability.md",
      );
      expect(bullet.length).toBe(1);
      const line = bullet[0] ?? "";

      // That bullet names the matrix's non-Claude hosts, so Claude Code is
      // absent from it by design.
      expect(line).not.toContain("Claude Code");
      const missing = harnesses
        .map((harness) => HARNESS_DISPLAY_NAMES[harness] ?? harness)
        .filter((display) => display !== "Claude Code")
        .filter((display) => !line.includes(display));
      expect(missing).toEqual([]);
    });
  });
});
