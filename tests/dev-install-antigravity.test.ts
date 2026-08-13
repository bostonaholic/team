// tests/dev-install-antigravity.test.ts
//
// Acceptance tests for the Antigravity half of the dev install,
// `script/dev-install-antigravity` and `script/dev-uninstall-antigravity`, plus
// the root `plugin.json` that makes this host install Team through its own
// native plugin path.
//
// Two layers:
//
// - L2 static tripwires. Read the source and assert a contract, in
//   milliseconds, executing nothing: the harness list must not drift across its
//   registration surfaces, the repo must carry this host's native manifest with
//   `skills/` and `agents/` beside it, the install must be one symlink to the
//   checkout root, neither script may depend on the `agy` binary or on a path
//   tool macOS bash 3.2 lacks, and the README must carry the install command.
//   Every extractor guards against a vacuous pass, because one that finds
//   nothing makes each assertion under it green while looking at nothing.
//
// - L3 subprocess snapshots. Spawn the real bash scripts with an isolated HOME
//   in a tmpdir, then read exit status, output, and symlink state through
//   `lstat`/`readlink`. Nothing is written outside that tmpdir, and nothing is
//   ever written under the real `$HOME`.
//
// NOTHING HERE DRIVES THE REAL `agy` BINARY. It is installed (1.1.12) on the
// machine this was written on, so `run()` *replaces* PATH with SAFE_PATH instead
// of prepending to the inherited one: the live host is out of reach by
// construction rather than by luck. The scripts no longer shell out to `agy` at
// all, and one tripwire below pins that.
//
// Why this file is a fraction of its former size. The install used to filter the
// skill corpus and link it one skill at a time into the host's flat global skill
// directory, so it carried a frontmatter reader, an exclusion set, and a
// collision scanner, and most of the tests here interrogated those. None of it is
// needed: the host takes a root `plugin.json` as its plugin marker, resolves
// `skills/` and `agents/` beside it, follows a symlinked plugin root, and honors
// `disable-model-invocation` itself. So Team ships that manifest, the install is
// one link, and there is no filtering left to test. Whether `agy` discovers a
// linked plugin can only be checked against the live host, so it stays a manual
// PR test-plan step.
//
// Output contract the assertions below read, so the scripts must emit it:
// `Linked:` for the link created, `Removed:` for the link removed, `Note:` when
// a removed link pointed at another checkout, `Error:` on an abort, `already
// installed` when there is nothing to do, and `Nothing to do` when the uninstall
// finds no target.

import {
  afterAll,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";
import { spawnSync } from "node:child_process";
import {
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
import { join } from "node:path";

import { squash } from "./helpers/text";

// `pwd -P` in the scripts yields a physical path, so resolve this side the same
// way. On macOS `/var` is a symlink to `/private/var`, which is exactly where an
// unresolved tmpdir path would diverge from the script's own view.
const REPO_ROOT = realpathSync(join(import.meta.dir, ".."));
const SKILLS_ROOT = join(REPO_ROOT, "skills");
const AGENTS_ROOT = join(REPO_ROOT, "agents");
const ROOT_MANIFEST = join(REPO_ROOT, "plugin.json");
const INSTALL = join(REPO_ROOT, "script", "dev-install-antigravity");
const UNINSTALL = join(REPO_ROOT, "script", "dev-uninstall-antigravity");
const DEV_INSTALL = join(REPO_ROOT, "script", "dev-install");
const DEV_UNINSTALL = join(REPO_ROOT, "script", "dev-uninstall");
const DEV_YML = join(REPO_ROOT, "dev.yml");
const README = join(REPO_ROOT, "README.md");

// The plugin root this host scans, and the flat global skill directory an
// earlier revision of this install wrote into. The second must stay unused:
// skills there are un-namespaced and carry no agents.
//
// The `.gemini` spelling is Antigravity CLI's own config root, not a stale
// reference to a retired host. Nothing here drives the real `agy` binary, so
// a rename applied to these constants and the scripts together would keep
// this suite green while breaking every dev install. Never rename it.
const PLUGIN_SUBPATH = ".gemini/config/plugins/team";
const FLAT_SKILLS_SUBPATH = ".gemini/config/skills";

// A PATH with no `agy` on it, and none of the machine's own bin dirs. Every run
// uses it so the real host binary can never be reached.
const SAFE_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";

// Each script forks a handful of times, not once per skill as the filtering
// revision did, so these run well inside bun's default. The budget is declared
// anyway because every test here either spawns bash or reads source.
setDefaultTimeout(20_000);

// Harness name → the display name the docs matrix must use for it. A harness
// with no entry here fails the docs-matrix tripwire until someone maps it.
const HARNESS_DISPLAY_NAMES: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex CLI",
  antigravity: "Antigravity CLI",
};

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

/**
 * A path is a symlink, is something else, or could not be read at all. The
 * third case must stay distinct from the second, so that folding a failed
 * `lstat` into "not a symlink" cannot turn a negative assertion into a pass.
 */
type LinkState = "symlink" | "other" | "unreadable";

function linkStateOf(path: string): LinkState {
  try {
    return lstatSync(path).isSymbolicLink() ? "symlink" : "other";
  } catch {
    return "unreadable";
  }
}

function linkTextOf(path: string): string {
  try {
    return readlinkSync(path);
  } catch {
    return "";
  }
}

function entriesOf(path: string): string[] {
  try {
    return readdirSync(path).sort();
  } catch {
    return [];
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

/** The plugin root inside a throwaway HOME. */
function pluginRoot(home: string): string {
  return join(home, PLUGIN_SUBPATH);
}

/** Run a script with an isolated HOME and a PATH that cannot reach `agy`. */
function run(script: string, home: string, args: string[] = []) {
  const result = spawnSync("bash", [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, HOME: home, PATH: SAFE_PATH },
  });
  return {
    status: result.status ?? -1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}${result.error?.message ?? ""}`,
  };
}

/**
 * Assert an exit status and carry the script's own output into the failure
 * message when it does not match. A bare status comparison fails with
 * `1 !== 0` and nothing about why, which is the difference between a failure
 * someone can diagnose from the CI log and one they can only try to reproduce.
 */
function expectStatus(
  result: { status: number; output: string },
  expected: number,
) {
  expect({ status: result.status, output: result.output }).toMatchObject({
    status: expected,
  });
}

/** Build a plugin root that looks like a native `agy plugin install`. */
function seedNativeInstall(home: string): string {
  const root = pluginRoot(home);
  mkdirSync(join(root, "skills"), { recursive: true });
  mkdirSync(join(root, "agents"), { recursive: true });
  writeFileSync(join(root, "plugin.json"), '{"name":"team"}\n');
  return root;
}

/** Build a second checkout whose dev install already owns the target. */
function seedOtherCheckout(home: string): string {
  const other = join(home, "other-checkout");
  mkdirSync(join(other, "skills"), { recursive: true });
  mkdirSync(join(other, "agents"), { recursive: true });
  writeFileSync(join(other, "plugin.json"), '{"name":"team"}\n');
  mkdirSync(join(home, ".gemini/config/plugins"), { recursive: true });
  symlinkSync(other, pluginRoot(home));
  return other;
}

// ---------------------------------------------------------------------------
// Source extractors
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
 * The key list of every `subcommands:` block in dev.yml, in file order. No YAML
 * parser exists in this harness, so this is a line-based indentation scan:
 * collect keys indented deeper than the `subcommands:` line itself, and stop at
 * the first line that dedents back to it or past it.
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

/** The body of the README `<details>` block whose summary names Antigravity. */
function antigravitySection(readme: string): string {
  for (const block of readme.split("<details>").slice(1)) {
    const body = block.split("</details>")[0] ?? "";
    const summary = body.split("</summary>")[0] ?? "";
    if (summary.includes("Antigravity")) return body;
  }
  return "";
}

/** The script with its comment lines dropped, so prose cannot trip a code check. */
function codeOf(scriptText: string): string {
  return scriptText
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
}

/** Lines that execute the `agy` binary, as opposed to naming it in prose. */
function agyInvocations(scriptText: string): string[] {
  return codeOf(scriptText)
    .split("\n")
    .filter((line) => /(^|[^"'\w])agy\b/.test(line))
    .filter((line) => !/^\s*echo\b/.test(line.trim()));
}

const INSTALL_SRC = readIfExists(INSTALL);
const UNINSTALL_SRC = readIfExists(UNINSTALL);
const BOTH_SCRIPTS: Array<[string, string]> = [
  ["dev-install-antigravity", INSTALL_SRC],
  ["dev-uninstall-antigravity", UNINSTALL_SRC],
];

describe("dev install: antigravity harness", () => {
  describe("L2 tripwires: the native manifest, registration, one-link install, README contract", () => {
    test("the repo ships this host's own plugin manifest at the root", () => {
      // This is what makes `agy plugin install <path>` take its native path
      // rather than importing Team as a Claude Code plugin. The manifest cannot
      // move into a directory of its own: the host resolves components as
      // siblings of the manifest, so it has to sit beside skills/ and agents/.
      const manifest = readIfExists(ROOT_MANIFEST);
      expect(manifest.length).toBeGreaterThan(0);
      const parsed = JSON.parse(manifest);
      expect(parsed.name).toBe("team");
      expect(existsSync(SKILLS_ROOT)).toBe(true);
      expect(existsSync(AGENTS_ROOT)).toBe(true);
    });

    test("every harness registration surface lists the same harnesses", () => {
      const fromInstall = harnessesIn(readIfExists(DEV_INSTALL));
      const fromUninstall = harnessesIn(readIfExists(DEV_UNINSTALL));
      const blocks = subcommandBlocks(readIfExists(DEV_YML));

      // Guards against a vacuous pass: an extractor that finds nothing would
      // otherwise make every equality below compare [] with [].
      expect(fromInstall.length).toBeGreaterThan(0);
      expect(fromUninstall.length).toBeGreaterThan(0);
      expect(blocks.length).toBeGreaterThan(0);

      expect(fromInstall).toContain("antigravity");
      expect(fromUninstall).toEqual(fromInstall);
      for (const block of blocks) expect(block).toEqual(fromInstall);
    });

    test("both scripts are strict-mode bash", () => {
      for (const [name, src] of BOTH_SCRIPTS) {
        expect(src.length, `${name} is empty or missing`).toBeGreaterThan(0);
        expect(src.startsWith("#!/usr/bin/env bash"), name).toBe(true);
        expect(src.includes("set -euo pipefail"), name).toBe(true);
      }
    });

    test("both scripts address the plugin root, not the flat global skill directory", () => {
      for (const [name, src] of BOTH_SCRIPTS) {
        expect(src, name).toContain(`\${HOME}/${PLUGIN_SUBPATH}`);
        // The flat directory is un-namespaced and carries no agents. Writing
        // there is the shape this install was moved off, so it must not return.
        expect(src, name).not.toContain(FLAT_SKILLS_SUBPATH);
      }
    });

    test("the install is a single link to the checkout root", () => {
      // Linking the root, rather than skills/ and agents/ separately, is what
      // keeps the dev install and the native install the same shape: both hand
      // the host one plugin root that already carries a manifest.
      const linkLines = codeOf(INSTALL_SRC)
        .split("\n")
        .filter((line) => line.trim().startsWith("ln -s"));
      expect(linkLines).toHaveLength(1);
      expect(linkLines[0]).toContain("$PLUGIN_ROOT");
      expect(linkLines[0]).toContain("$TARGET");
      // No manifest is generated: the checkout's own is the one that ships.
      expect(codeOf(INSTALL_SRC)).not.toMatch(/>\s*"?\$\{?MANIFEST/);
    });

    test("neither script executes the agy binary", () => {
      // Both name `agy` in remedy text, which is fine. Running it is not: the
      // dev install must work on a machine where the host is not installed,
      // and a probe of it would be a second source of truth about ownership.
      for (const [name, src] of BOTH_SCRIPTS) {
        expect(agyInvocations(src), name).toEqual([]);
        expect(src, `${name} should still name agy in a remedy`).toContain(
          "agy plugin uninstall team",
        );
      }
    });

    test("neither script reaches for a path tool macOS bash 3.2 lacks", () => {
      for (const [name, src] of BOTH_SCRIPTS) {
        expect(src, name).not.toMatch(/readlink\s+-f/);
        expect(src, name).not.toMatch(/\brealpath\b/);
        expect(src, name).not.toMatch(/\bmapfile\b/);
      }
    });

    test("neither script contains a recursive delete", () => {
      // Each removes exactly one symlink, which it created. Comments are
      // stripped first, since a script may name a flag it does not use.
      for (const [name, src] of BOTH_SCRIPTS) {
        expect(codeOf(src), name).not.toMatch(/rm\s+-[a-z]*r/);
      }
    });

    test("the README documents the install and claims no dev-only limit", () => {
      const section = squash(antigravitySection(readIfExists(README)));
      expect(section.length).toBeGreaterThan(0);

      // The install command an end user needs, in the local-checkout form the
      // other two hosts' sections use.
      expect(section).toContain("agy plugin install");
      expect(section).toContain("script/dev-install antigravity");

      // Claims that turned out to be false. Each was in an earlier revision.
      expect(section).not.toContain("dev-install-only");
      expect(section).not.toContain("nothing distributed ships");
    });

    test("every harness has a docs display name", () => {
      const harnesses = harnessesIn(readIfExists(DEV_INSTALL));
      expect(harnesses.length).toBeGreaterThan(0);
      expect(harnesses).toContain("antigravity");
      for (const harness of harnesses) {
        expect(HARNESS_DISPLAY_NAMES[harness], harness).toBeTruthy();
      }
    });
  });

  describe("L3: install", () => {
    test("a fresh install links the checkout into the plugin directory", () => {
      const home = newHome();
      const result = run(INSTALL, home);
      expectStatus(result, 0);

      expect(linkStateOf(pluginRoot(home))).toBe("symlink");
      expect(linkTextOf(pluginRoot(home))).toBe(REPO_ROOT);
      expect(result.output).toContain("Linked:");
    });

    test("the whole corpus and the manifest are reachable through the link", () => {
      const home = newHome();
      expectStatus(run(INSTALL, home), 0);

      // Read through the installed link, and compare against the checkout.
      // This is the assertion that would fail if a filter ever came back.
      const root = pluginRoot(home);
      expect(JSON.parse(readIfExists(join(root, "plugin.json"))).name).toBe("team");
      const installedSkills = entriesOf(join(root, "skills"));
      expect(installedSkills.length).toBeGreaterThan(0);
      expect(installedSkills).toEqual(entriesOf(SKILLS_ROOT));
      expect(entriesOf(join(root, "agents"))).toEqual(entriesOf(AGENTS_ROOT));

      // The two skills an earlier revision withheld. The host keeps them out of
      // the model's reach itself, so the install ships them.
      expect(installedSkills).toContain("pr-rebase");
      expect(installedSkills).toContain("pr-watch-as-reviewer");
    });

    test("a re-run is idempotent", () => {
      const home = newHome();
      expectStatus(run(INSTALL, home), 0);

      const again = run(INSTALL, home);
      expectStatus(again, 0);
      expect(again.output).toContain("already installed");
      expect(linkTextOf(pluginRoot(home))).toBe(REPO_ROOT);
    });

    test("a native install is refused and left byte-identical", () => {
      const home = newHome();
      const root = seedNativeInstall(home);
      const before = readIfExists(join(root, "plugin.json"));

      const result = run(INSTALL, home);
      expectStatus(result, 1);
      expect(result.output).toContain("agy plugin uninstall team");
      // The real directory is still real, and the manifest is untouched.
      expect(linkStateOf(root)).toBe("other");
      expect(readIfExists(join(root, "plugin.json"))).toBe(before);
    });

    test("another checkout's link is refused, and that checkout is named", () => {
      const home = newHome();
      const other = seedOtherCheckout(home);

      const result = run(INSTALL, home);
      expectStatus(result, 1);
      expect(result.output).toContain(other);
      expect(result.output).toContain("dev-uninstall antigravity");
      // The other checkout's link is still the one installed.
      expect(linkTextOf(pluginRoot(home))).toBe(other);
    });
  });

  describe("L3: uninstall", () => {
    test("it removes the link it created and leaves the host's tree alone", () => {
      const home = newHome();
      expectStatus(run(INSTALL, home), 0);

      const result = run(UNINSTALL, home);
      expectStatus(result, 0);
      expect(result.output).toContain("Removed:");
      expect(linkStateOf(pluginRoot(home))).toBe("unreadable");
      expect(existsSync(join(home, ".gemini/config/plugins"))).toBe(true);
    });

    test("an absent target is reported, not an error", () => {
      const home = newHome();
      const result = run(UNINSTALL, home);
      expectStatus(result, 0);
      expect(result.output).toContain("Nothing to do");
    });

    test("a native install is refused and left intact", () => {
      const home = newHome();
      const root = seedNativeInstall(home);

      const result = run(UNINSTALL, home);
      expectStatus(result, 1);
      expect(result.output).toContain("Nothing was removed");
      expect(entriesOf(root)).toEqual(["agents", "plugin.json", "skills"]);
    });

    test("removing another checkout's link says so", () => {
      // The sweep is by link, not by which checkout wrote it, so this one is
      // removed — but silently removing another checkout's install would leave
      // someone guessing why their skills vanished.
      const home = newHome();
      const other = seedOtherCheckout(home);

      const result = run(UNINSTALL, home);
      expectStatus(result, 0);
      expect(result.output).toContain("another checkout");
      expect(result.output).toContain(other);
      expect(linkStateOf(pluginRoot(home))).toBe("unreadable");
    });
  });

  describe("L3: the dispatcher reaches this harness", () => {
    test("script/dev-install antigravity installs, and dev-uninstall removes", () => {
      const home = newHome();
      expectStatus(run(DEV_INSTALL, home, ["antigravity"]), 0);
      expect(linkTextOf(pluginRoot(home))).toBe(REPO_ROOT);

      expectStatus(run(DEV_UNINSTALL, home, ["antigravity"]), 0);
      expect(linkStateOf(pluginRoot(home))).toBe("unreadable");
    });
  });
});
