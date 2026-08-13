// Acceptance fence for the opt-in cross-vendor review pass. It covers the
// bundled skills/cross-model-review/external-review.mjs runner (L1 pure
// core + L3 subprocess against fake CLIs on a controlled PATH), the
// no-bypass sweep, the skill/agent/docs wiring tripwires, the
// orchestrator's per-round disposition persistence to cross-model-notes.md
// (including the terminal halt naming the file), and the PR review-notes
// copy rules that keep every round appearing exactly once.
//
// Free tier per docs/testing.md: no model call, no metered API. Fake CLIs
// are bash stubs in a mkdtemp bin dir; the child PATH is fully controlled.

import { afterAll, describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";

import { frontmatter, read, squash } from "./helpers/text";

const REPO_ROOT = process.cwd();

// Literals shared between the script, the skills, and the docs. Every
// drift tripwire below reuses these constants.
const DISPOSITION_HEADING = "### Cross-model disposition";
const MARKER_PATH = ".team/cross-model-review";
const NOTES_FILENAME = "cross-model-notes.md";
const MARKER_ABSENT_HEADING = "## When the marker is absent";

// Named caps: 120 s, 128 KB, 32 KB.
const EXPECTED_TIMEOUT_MS = 120_000;
const EXPECTED_PROMPT_CAP_BYTES = 131_072;
const EXPECTED_OUTPUT_CAP_BYTES = 32_768;

const SKILL_DIR = join(REPO_ROOT, "skills", "cross-model-review");
const SKILL_MD = join(SKILL_DIR, "SKILL.md");
const SCRIPT = join(SKILL_DIR, "external-review.mjs");
const CODE_REVIEWER = join(REPO_ROOT, "agents", "code-reviewer.md");
const TEAM_SKILL = join(REPO_ROOT, "skills", "team", "SKILL.md");
const TEAM_IMPLEMENT_SKILL = join(REPO_ROOT, "skills", "team-implement", "SKILL.md");
const TEAM_PR_SKILL = join(REPO_ROOT, "skills", "team-pr", "SKILL.md");
const ARTIFACT_SKILL = join(REPO_ROOT, "skills", "artifact-frontmatter", "SKILL.md");
const SKILLS_MD = join(REPO_ROOT, "docs", "skills.md");

// Missing-file reads return "" so dependent checks fail as assertions
// (expected "" to contain ...), never as ENOENT crashes.
function readOrEmpty(path: string): string {
  return existsSync(path) ? read(path) : "";
}

// The exported pure core of external-review.mjs. Imported only when the
// file exists so a not-yet-written script fails these tests as assertions
// (received undefined), never as a module-resolution crash.
type ExternalReviewModule = {
  TIMEOUT_MS: number;
  PROMPT_CAP_BYTES: number;
  OUTPUT_CAP_BYTES: number;
  buildArgv: (cli: string, prompt: string) => { command: string; args: string[] };
  promptWithinCap: (prompt: string) => boolean;
  truncateOutput: (text: string) => string;
};

const mod: Partial<ExternalReviewModule> = existsSync(SCRIPT)
  ? ((await import(SCRIPT)) as ExternalReviewModule)
  : {};

// ---------------------------------------------------------------------------
// L3 harness: run the bundled script with node against fake CLIs placed in a
// mkdtemp bin dir. PATH is replaced wholesale (bin dir + /usr/bin:/bin for
// bash/cat/head), so no real codex/gemini install can leak in.
// ---------------------------------------------------------------------------

const NODE = Bun.which("node") ?? "node";
const SYSTEM_PATH = "/usr/bin:/bin";
const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function makeBin(fakes: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), `cross-model-bin-${process.pid}-`));
  tempDirs.push(dir);
  for (const [name, body] of Object.entries(fakes)) {
    writeFileSync(join(dir, name), body);
    chmodSync(join(dir, name), 0o755);
  }
  return dir;
}

function makeRepo(withMarker: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), `cross-model-repo-${process.pid}-`));
  tempDirs.push(dir);
  if (withMarker) {
    mkdirSync(join(dir, ".team"), { recursive: true });
    writeFileSync(join(dir, ".team", "cross-model-review"), "");
  }
  return dir;
}

function runScript(
  args: string[],
  options: { binDir?: string; input?: string; extraEnv?: Record<string, string> } = {},
): { status: number | null; stdout: string; stderr: string; combined: string } {
  const path = options.binDir ? `${options.binDir}:${SYSTEM_PATH}` : SYSTEM_PATH;
  const result = spawnSync(NODE, [SCRIPT, ...args], {
    encoding: "utf8",
    input: options.input,
    env: { ...process.env, ...options.extraEnv, PATH: path },
    timeout: 10_000,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  return { status: result.status, stdout, stderr, combined: stdout + stderr };
}

// Matches the script's positive availability token ("codex: ready");
// no negative line ("unavailable (...)") ever carries it.
const CLAIMS_READY = /\bready\b/i;

// A recording fake writes a sibling `ran` file when executed, so a test can
// prove the script never spawned it (env-free: it locates itself via $0).
const RECORDING_FAKE = `#!/bin/bash
touch "$(dirname "$0")/ran"
cat >/dev/null
echo "fake findings"
`;

// ---------------------------------------------------------------------------
// external-review.mjs pure core (L1)
// ---------------------------------------------------------------------------

describe("external-review.mjs pure core (L1)", () => {
  test("exports the three named cap constants: TIMEOUT_MS 120 s, PROMPT_CAP_BYTES 128 KB, OUTPUT_CAP_BYTES 32 KB", () => {
    expect(mod.TIMEOUT_MS).toBe(EXPECTED_TIMEOUT_MS);
    expect(mod.PROMPT_CAP_BYTES).toBe(EXPECTED_PROMPT_CAP_BYTES);
    expect(mod.OUTPUT_CAP_BYTES).toBe(EXPECTED_OUTPUT_CAP_BYTES);
  });

  test("buildArgv pins the codex read-only argv exactly (prompt rides stdin)", () => {
    expect(typeof mod.buildArgv).toBe("function");
    const built = mod.buildArgv!("codex", "PROMPT");
    expect(built.command).toBe("codex");
    expect(built.args).toEqual(["exec", "-s", "read-only", "--skip-git-repo-check", "-"]);
  });

  test("buildArgv pins the gemini plan-mode argv exactly (prompt via -p)", () => {
    expect(typeof mod.buildArgv).toBe("function");
    const built = mod.buildArgv!("gemini", "PROMPT");
    expect(built.command).toBe("gemini");
    expect(built.args).toEqual(["--approval-mode", "plan", "-p", "PROMPT"]);
  });

  test("promptWithinCap accepts exactly PROMPT_CAP_BYTES and rejects one byte more", () => {
    expect(typeof mod.promptWithinCap).toBe("function");
    expect(mod.promptWithinCap!("x".repeat(EXPECTED_PROMPT_CAP_BYTES))).toBe(true);
    expect(mod.promptWithinCap!("x".repeat(EXPECTED_PROMPT_CAP_BYTES + 1))).toBe(false);
  });

  test("truncateOutput passes output at or under the cap through untouched", () => {
    expect(typeof mod.truncateOutput).toBe("function");
    expect(mod.truncateOutput!("short output")).toBe("short output");
  });

  test("truncateOutput cuts at OUTPUT_CAP_BYTES, keeps the head, and appends a truncation marker", () => {
    expect(typeof mod.truncateOutput).toBe("function");
    const oversized = "y".repeat(EXPECTED_OUTPUT_CAP_BYTES + 5_000);
    const out = mod.truncateOutput!(oversized);
    expect(out.slice(0, 4)).toBe("yyyy");
    expect(out.length).toBeLessThan(oversized.length);
    expect(out).toMatch(/truncat/i);
    // Cap plus slack for the marker itself.
    expect(Buffer.byteLength(out, "utf8")).toBeLessThanOrEqual(
      EXPECTED_OUTPUT_CAP_BYTES + 256,
    );
  });
});

// ---------------------------------------------------------------------------
// detect: fail-closed, marker-first (L3)
// ---------------------------------------------------------------------------

describe("detect is fail-closed and marker-first (L3)", () => {
  test("no marker → unavailable naming the marker path, with no ready claim even when a fake codex sits on PATH", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    // Positive control: the matcher sees the script's real positive token
    // (asserted end-to-end by the marker-present test below).
    expect("codex: ready").toMatch(CLAIMS_READY);
    expect("codex: unavailable (binary not found on PATH)").not.toMatch(CLAIMS_READY);

    const bin = makeBin({ codex: RECORDING_FAKE });
    const repo = makeRepo(/* withMarker */ false);
    const r = runScript(["detect", repo], { binDir: bin });
    expect(r.combined).toContain(MARKER_PATH);
    expect(r.combined).toMatch(/unavailable/i);
    expect(r.combined).not.toMatch(CLAIMS_READY);
  });

  test("marker present + fake binaries on PATH → per-CLI ready, and detect spawns nothing", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const bin = makeBin({ codex: RECORDING_FAKE, gemini: RECORDING_FAKE });
    const repo = makeRepo(/* withMarker */ true);
    const r = runScript(["detect", repo], { binDir: bin });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("codex: ready");
    expect(r.stdout).toContain("gemini: ready");
    // detect only vets PATH; the recording fake proves it never spawned.
    expect(existsSync(join(bin, "ran"))).toBe(false);
  });

  test("marker present + missing binaries → per-CLI unavailable", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const repo = makeRepo(/* withMarker */ true);
    // No bin dir: PATH carries only /usr/bin:/bin, where no codex/gemini live.
    const r = runScript(["detect", repo]);
    expect(r.combined).toContain("codex");
    expect(r.combined).toContain("gemini");
    expect(r.combined).toMatch(/unavailable/i);
    expect(r.combined).not.toMatch(CLAIMS_READY);
  });

  test("lookup error (nonexistent repo root) → unavailable, never a crash claim of availability", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const bin = makeBin({ codex: RECORDING_FAKE });
    const r = runScript(["detect", join(tmpdir(), "cross-model-does-not-exist")], {
      binDir: bin,
    });
    expect(r.combined).toMatch(/unavailable/i);
    expect(r.combined).not.toMatch(CLAIMS_READY);
  });
});

// ---------------------------------------------------------------------------
// run: pre-spawn refusals, truncation, timeout, skip (L3)
// ---------------------------------------------------------------------------

describe("run guards and skip paths (L3)", () => {
  test("run rejects an unknown CLI name with a usage error and non-zero exit before any spawn", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const bin = makeBin({ codex: RECORDING_FAKE });
    const repo = makeRepo(true);
    const r = runScript(["run", "qwen", repo], { binDir: bin, input: "prompt" });
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/usage/i);
    // The recording fake proves no child process ever ran.
    expect(existsSync(join(bin, "ran"))).toBe(false);
  });

  test("run rejects a prompt over PROMPT_CAP_BYTES with a usage error and non-zero exit before any spawn", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const bin = makeBin({ codex: RECORDING_FAKE });
    const repo = makeRepo(true);
    const oversized = "x".repeat(EXPECTED_PROMPT_CAP_BYTES + 1);
    const r = runScript(["run", "codex", repo], { binDir: bin, input: oversized });
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/usage/i);
    expect(existsSync(join(bin, "ran"))).toBe(false);
  });

  test("run refuses without the consent marker: non-zero exit and no spawn, even with a CLI on PATH", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const bin = makeBin({ codex: RECORDING_FAKE });
    const repo = makeRepo(/* withMarker */ false);
    const r = runScript(["run", "codex", repo], { binDir: bin, input: "prompt" });
    expect(r.status).not.toBe(0);
    expect(r.combined).toContain(MARKER_PATH);
    // The recording fake proves no child process ever ran.
    expect(existsSync(join(bin, "ran"))).toBe(false);
  });

  test("run spawns the CLI with an env allowlist: an unrelated credential variable never reaches the child", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const bin = makeBin({
      codex: `#!/bin/bash
cat >/dev/null
echo "canary=[\${CROSS_MODEL_TEST_CANARY:-unset}]"
`,
    });
    const repo = makeRepo(true);
    const r = runScript(["run", "codex", repo], {
      binDir: bin,
      input: "prompt",
      extraEnv: { CROSS_MODEL_TEST_CANARY: "leaked-credential" },
    });
    expect(r.stdout).toContain("canary=[unset]");
    expect(r.combined).not.toContain("leaked-credential");
  });

  test("run caps the stderr carried into a skip reason instead of concatenating it whole", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const bin = makeBin({
      codex: `#!/bin/bash
cat >/dev/null
head -c 100000 /dev/zero | tr '\\0' e >&2
exit 7
`,
    });
    const repo = makeRepo(true);
    const r = runScript(["run", "codex", repo], { binDir: bin, input: "prompt" });
    expect(r.combined).toMatch(/skip/i);
    expect(r.combined).toContain("7");
    expect(Buffer.byteLength(r.stdout, "utf8")).toBeLessThanOrEqual(8 * 1024);
  });

  test("run truncates child stdout at OUTPUT_CAP_BYTES with a truncation marker, dropping the tail", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const bin = makeBin({
      codex: `#!/bin/bash
cat >/dev/null
head -c 40000 /dev/zero | tr '\\0' x
echo
echo tail-sentinel-past-the-cap
`,
    });
    const repo = makeRepo(true);
    const r = runScript(["run", "codex", repo], { binDir: bin, input: "prompt" });
    expect(r.stdout).toMatch(/truncat/i);
    expect(r.stdout).not.toContain("tail-sentinel-past-the-cap");
    expect(Buffer.byteLength(r.stdout, "utf8")).toBeLessThanOrEqual(
      EXPECTED_OUTPUT_CAP_BYTES + 512,
    );
  });

  test(
    "run kills a hanging CLI at the (argument-accelerated) timeout and reads as skip",
    () => {
      expect(existsSync(SCRIPT)).toBe(true);
      const bin = makeBin({
        codex: `#!/bin/bash
sleep 60
`,
      });
      const repo = makeRepo(true);
      // Trailing timeout-ms argument exists for this test only; the skill's
      // documented invocation never passes it.
      const r = runScript(["run", "codex", repo, "500"], { binDir: bin, input: "prompt" });
      expect(r.combined).toMatch(/skip/i);
      expect(r.combined).toMatch(/time/i);
    },
    15_000,
  );

  test("codex child never receives gemini/google credentials; its own vendor block passes through", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const bin = makeBin({
      codex: `#!/bin/bash
cat >/dev/null
echo "gemini=[\${GEMINI_API_KEY:-unset}] google=[\${GOOGLE_API_KEY:-unset}] gac=[\${GOOGLE_APPLICATION_CREDENTIALS:-unset}] openai=[\${OPENAI_API_KEY:-unset}]"
`,
    });
    const repo = makeRepo(true);
    const r = runScript(["run", "codex", repo], {
      binDir: bin,
      input: "prompt",
      extraEnv: {
        GEMINI_API_KEY: "gemini-credential-leaked",
        GOOGLE_API_KEY: "google-credential-leaked",
        GOOGLE_APPLICATION_CREDENTIALS: "/tmp/google-adc-leaked.json",
        OPENAI_API_KEY: "openai-own-credential",
      },
    });
    expect(r.stdout).toContain("gemini=[unset]");
    expect(r.stdout).toContain("google=[unset]");
    expect(r.stdout).toContain("gac=[unset]");
    // Positive control: the codex child still gets its own vendor variable,
    // so the absences above are partitioning, not a broken allowlist.
    expect(r.stdout).toContain("openai=[openai-own-credential]");
    expect(r.combined).not.toContain("credential-leaked");
  });

  test("gemini child never receives openai/codex credentials; its own vendor block passes through", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const bin = makeBin({
      gemini: `#!/bin/bash
echo "openai=[\${OPENAI_API_KEY:-unset}] codexhome=[\${CODEX_HOME:-unset}] gemini=[\${GEMINI_API_KEY:-unset}]"
`,
    });
    const repo = makeRepo(true);
    const r = runScript(["run", "gemini", repo], {
      binDir: bin,
      input: "prompt",
      extraEnv: {
        OPENAI_API_KEY: "openai-credential-leaked",
        CODEX_HOME: "/tmp/codex-home-leaked",
        GEMINI_API_KEY: "gemini-own-credential",
      },
    });
    expect(r.stdout).toContain("openai=[unset]");
    expect(r.stdout).toContain("codexhome=[unset]");
    // Positive control: the gemini child still gets its own vendor variable.
    expect(r.stdout).toContain("gemini=[gemini-own-credential]");
    expect(r.combined).not.toContain("credential-leaked");
  });

  test("run spawns the vendor CLI in an empty scratch cwd outside the repo root, cleaned up after", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const bin = makeBin({
      codex: `#!/bin/bash
cat >/dev/null
pwd
ls -A
`,
    });
    const repo = makeRepo(true);
    const r = runScript(["run", "codex", repo], { binDir: bin, input: "prompt" });
    const lines = r.stdout.trim().split("\n");
    const reportedCwd = lines[0] ?? "";
    const rest = lines.slice(1);
    expect(reportedCwd.length).toBeGreaterThan(0);
    // Compare against both the symlinked and the resolved repo path (macOS
    // tmpdir rides /private), so a regression to cwd: repoRoot cannot slip
    // past a path-form mismatch.
    expect(reportedCwd.startsWith(repo)).toBe(false);
    expect(reportedCwd.startsWith(realpathSync(repo))).toBe(false);
    expect(reportedCwd.startsWith(REPO_ROOT)).toBe(false);
    // The scratch cwd is empty (ls -A printed nothing) and gone after settle.
    expect(rest.join("")).toBe("");
    expect(existsSync(reportedCwd)).toBe(false);
  });

  test("run keeps repo-resident files out of the child's relative-path reach: a planted .env never leaks", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const bin = makeBin({
      codex: `#!/bin/bash
cat >/dev/null
if cat .env 2>/dev/null; then
  echo "env-read-succeeded"
else
  echo "env-read-failed"
fi
`,
    });
    const repo = makeRepo(true);
    writeFileSync(join(repo, ".env"), "SECRET_TOKEN=planted-secret\n");
    const r = runScript(["run", "codex", repo], { binDir: bin, input: "prompt" });
    // The failure branch printing proves the fake ran and the read failed —
    // not a vacuous pass.
    expect(r.stdout).toContain("env-read-failed");
    expect(r.combined).not.toContain("env-read-succeeded");
    expect(r.combined).not.toContain("planted-secret");
  });

  test("run skips a CLI reachable only through a relative PATH entry, so the vetted file is always the executed file", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const bin = makeBin({ codex: RECORDING_FAKE });
    const repo = makeRepo(true);
    // The same fake through an absolute entry runs (the truncation tests
    // above are that positive control); only the PATH spelling changes here.
    const relativeBin = relative(REPO_ROOT, bin);
    expect(isAbsolute(relativeBin)).toBe(false);
    const r = runScript(["run", "codex", repo], { binDir: relativeBin, input: "prompt" });
    expect(r.status).toBe(0);
    expect(r.combined).toMatch(/skip/i);
    expect(r.combined).toMatch(/not found/i);
    // The recording fake proves no child process ever ran.
    expect(existsSync(join(bin, "ran"))).toBe(false);
  });

  test("run reads a non-zero child exit as skip, naming the reason", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const bin = makeBin({
      codex: `#!/bin/bash
cat >/dev/null
echo "boom" >&2
exit 7
`,
    });
    const repo = makeRepo(true);
    const r = runScript(["run", "codex", repo], { binDir: bin, input: "prompt" });
    expect(r.combined).toMatch(/skip/i);
    expect(r.combined).toContain("7");
  });
});

// ---------------------------------------------------------------------------
// CLI main guard through a symlinked install path (L3)
// ---------------------------------------------------------------------------

describe("CLI main guard through a symlinked invocation path (L3)", () => {
  // script/dev-install-* install the plugin as a symlink. Node realpaths
  // import.meta.url but leaves argv[1] as typed, so a main guard comparing
  // the two literally makes every symlinked invocation a silent no-op:
  // empty stdout + exit 0, which reads as "no findings".
  test("detect invoked through a symlinked skill directory prints real output, never an empty exit 0", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const linkParent = mkdtempSync(join(tmpdir(), `cross-model-link-${process.pid}-`));
    tempDirs.push(linkParent);
    const linkedSkillDir = join(linkParent, "linked-skill");
    symlinkSync(SKILL_DIR, linkedSkillDir);
    const repo = makeRepo(true);
    const result = spawnSync(
      NODE,
      [join(linkedSkillDir, "external-review.mjs"), "detect", repo],
      { encoding: "utf8", env: { ...process.env, PATH: SYSTEM_PATH }, timeout: 10_000 },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("codex");
    expect(result.stdout).toContain("gemini");
  });
});

// ---------------------------------------------------------------------------
// detached child is reaped when the parent dies (L4)
// ---------------------------------------------------------------------------

describe("detached child group is reaped on parent death (L4)", () => {
  test(
    "SIGTERM to the running script kills the spawned CLI's process group",
    async () => {
      expect(existsSync(SCRIPT)).toBe(true);
      const bin = makeBin({
        codex: `#!/bin/bash
echo $$ > "$(dirname "$0")/child-pid"
cat >/dev/null
sleep 60
`,
      });
      const repo = makeRepo(true);
      const parent = spawn(NODE, [SCRIPT, "run", "codex", repo, "30000"], {
        env: { ...process.env, PATH: `${bin}:${SYSTEM_PATH}` },
        stdio: ["pipe", "pipe", "pipe"],
      });
      parent.stdin.write("prompt");
      parent.stdin.end();

      const pidFile = join(bin, "child-pid");
      const spawnDeadline = Date.now() + 8_000;
      while (!existsSync(pidFile) && Date.now() < spawnDeadline) await Bun.sleep(50);
      expect(existsSync(pidFile)).toBe(true);
      const fakePid = Number(readFileSync(pidFile, "utf8").trim());
      expect(Number.isInteger(fakePid)).toBe(true);
      // Positive control: the fake CLI is alive before the parent dies.
      expect(() => process.kill(fakePid, 0)).not.toThrow();

      parent.kill("SIGTERM");
      let alive = true;
      const reapDeadline = Date.now() + 5_000;
      while (alive && Date.now() < reapDeadline) {
        try {
          process.kill(fakePid, 0);
          await Bun.sleep(50);
        } catch {
          alive = false;
        }
      }
      expect(alive).toBe(false);
    },
    20_000,
  );
});

// ---------------------------------------------------------------------------
// no-bypass sweep (L2)
// ---------------------------------------------------------------------------

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full));
    else out.push(full);
  }
  return out;
}

describe("no approval-bypass flag anywhere in skills/cross-model-review/ (L2)", () => {
  const FORBIDDEN = ["--yolo", "--full-auto", "workspace-write", "${CLAUDE_PLUGIN_ROOT}"];

  for (const token of FORBIDDEN) {
    test(`zero matches for ${token}`, () => {
      // Positive control: the sweep can see the token it hunts
      // (docs/testing.md — prove a negative check can find a positive).
      expect(`argv carries ${token} by mistake`).toContain(token);
      // Guard: a missing or empty skill dir must fail, not vacuously pass.
      // The skill ships three files: SKILL.md, external-review.mjs,
      // prompt-template.md.
      const files = filesUnder(SKILL_DIR);
      expect(files.length).toBeGreaterThanOrEqual(3);
      const offenders = files.filter((file) => read(file).includes(token));
      expect(offenders).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// wiring tripwires (L2)
// ---------------------------------------------------------------------------

describe("skill and agent wiring (L2)", () => {
  test("code-reviewer frontmatter preloads cross-model-review", () => {
    expect(frontmatter(read(CODE_REVIEWER))).toMatch(/^\s*-\s+cross-model-review\s*$/m);
  });

  test("skill frontmatter keys are exactly name + description + user-invocable: false (methodology convention)", () => {
    const fm = frontmatter(readOrEmpty(SKILL_MD));
    const keys = fm
      .split("\n")
      .filter((line) => /^[A-Za-z][\w-]*:/.test(line))
      .map((line) => line.split(":")[0]);
    expect(keys.sort()).toEqual(["description", "name", "user-invocable"]);
    expect(fm).toMatch(/^name:\s*cross-model-review\s*$/m);
    expect(fm).toMatch(/^user-invocable:\s*false\s*$/m);
  });

  test("skill body carries the literal disposition heading", () => {
    expect(readOrEmpty(SKILL_MD)).toContain(DISPOSITION_HEADING);
  });

  test("skill body names the literal consent-marker path", () => {
    expect(readOrEmpty(SKILL_MD)).toContain(MARKER_PATH);
  });

  test("skill body carries the marker-absent discoverability section", () => {
    expect(readOrEmpty(SKILL_MD)).toContain(MARKER_ABSENT_HEADING);
  });

  test("skill states the three caps, drift-guarded against the script's exported constants", () => {
    // MIN_VERSION precedent (tests/nested-agents.test.ts): the prose caps and
    // the script constants must never drift apart.
    expect(typeof mod.TIMEOUT_MS).toBe("number");
    expect(typeof mod.PROMPT_CAP_BYTES).toBe("number");
    expect(typeof mod.OUTPUT_CAP_BYTES).toBe("number");
    const text = squash(readOrEmpty(SKILL_MD));
    expect(text.length).toBeGreaterThan(0);
    expect(text).toMatch(new RegExp(`\\b${mod.TIMEOUT_MS! / 1000}\\s?s`));
    expect(text).toContain(`${mod.PROMPT_CAP_BYTES! / 1024} KB`);
    expect(text).toContain(`${mod.OUTPUT_CAP_BYTES! / 1024} KB`);
  });

  test("docs/skills.md documents cross-model-review", () => {
    expect(read(SKILLS_MD)).toContain("### cross-model-review");
  });
});

// ---------------------------------------------------------------------------
// Orchestrators append the per-round disposition record (L2)
// ---------------------------------------------------------------------------

// Window a section from its heading line to the next heading of the same or
// higher level; "" when the heading is missing, so a length guard fails.
function windowSection(text: string, headingPattern: RegExp, terminator: RegExp): string {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => headingPattern.test(line));
  if (start === -1) return "";
  const end = lines.findIndex((line, i) => i > start && terminator.test(line));
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

function aggregateGate(): string {
  return windowSection(read(TEAM_SKILL), /^### Aggregate Gate/, /^#{1,3} /);
}

describe("orchestrator contract in skills/team/SKILL.md (L2)", () => {
  test("the Aggregate Gate names the disposition heading and the notes file", () => {
    const gate = aggregateGate();
    // Guard: a renamed section must fail, not vacuously pass.
    expect(gate.length).toBeGreaterThan(0);
    expect(gate).toContain(DISPOSITION_HEADING);
    expect(gate).toContain(NOTES_FILENAME);
  });

  test("the terminal-halt step names the notes file beside the unresolved findings", () => {
    const gate = aggregateGate();
    expect(gate.length).toBeGreaterThan(0);
    const lines = gate.split("\n");
    const start = lines.findIndex((line) => /terminal halt/i.test(line));
    expect(start).toBeGreaterThanOrEqual(0);
    const end = lines.findIndex((line, i) => i > start && /^\d+\.\s/.test(line));
    const step = lines.slice(start, end === -1 ? undefined : end).join("\n");
    expect(step).toContain(NOTES_FILENAME);
  });

  test("the disposition heading is byte-identical between producer and orchestrator skills", () => {
    expect(readOrEmpty(SKILL_MD)).toContain(DISPOSITION_HEADING);
    expect(read(TEAM_SKILL)).toContain(DISPOSITION_HEADING);
    expect(read(TEAM_IMPLEMENT_SKILL)).toContain(DISPOSITION_HEADING);
  });
});

describe("orchestrator contract in skills/team-implement/SKILL.md (L2)", () => {
  // team-implement carries its own complete aggregate-gate procedure, so it
  // needs the same persistence rules as skills/team/SKILL.md — a standalone
  // /team-implement run must not silently drop the disposition record.
  test("the execution steps name the disposition heading and the notes file", () => {
    const text = read(TEAM_IMPLEMENT_SKILL);
    expect(text).toContain(DISPOSITION_HEADING);
    expect(text).toContain(NOTES_FILENAME);
  });

  test("the terminal-halt step names the notes file beside the unresolved findings", () => {
    const lines = read(TEAM_IMPLEMENT_SKILL).split("\n");
    const start = lines.findIndex((line) => /round count ≥ 5.*halt/i.test(line));
    expect(start).toBeGreaterThanOrEqual(0);
    const end = lines.findIndex((line, i) => i > start && /^\s*-\s|^\d+\.\s/.test(line));
    const step = lines.slice(start, end === -1 ? undefined : end).join("\n");
    expect(step).toContain(NOTES_FILENAME);
  });
});

describe("artifact schema in skills/artifact-frontmatter/SKILL.md (L2)", () => {
  test("documents cross-model-notes.md with phase: cross-model-review", () => {
    const text = read(ARTIFACT_SKILL);
    expect(text).toContain(NOTES_FILENAME);
    expect(text).toContain("phase: cross-model-review");
  });

  test("the notes record names the orchestrator as its writer", () => {
    const paragraphs = read(ARTIFACT_SKILL)
      .split(/\n\s*\n/)
      .filter((paragraph) => paragraph.includes(NOTES_FILENAME));
    // Guard: no paragraph mentioning the file means the record is missing.
    expect(paragraphs.length).toBeGreaterThan(0);
    expect(paragraphs.some((paragraph) => /orchestrator/i.test(paragraph))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PR review notes carry every round exactly once (L2)
// ---------------------------------------------------------------------------

function reviewNotesSpec(): string {
  const paragraphs = read(TEAM_PR_SKILL).split(/\n\s*\n/);
  return paragraphs.find((p) => p.includes("`## Review notes` (conditional)")) ?? "";
}

describe("PR contract in skills/team-pr/SKILL.md (L2)", () => {
  test("the Review notes spec names cross-model-notes.md as a source", () => {
    const spec = reviewNotesSpec();
    // Guard: a reworded anchor must fail, not vacuously pass.
    expect(spec.length).toBeGreaterThan(0);
    expect(spec).toContain(NOTES_FILENAME);
  });

  test("the Review notes spec strips the notes file's frontmatter on copy", () => {
    const spec = squash(reviewNotesSpec());
    expect(spec.length).toBeGreaterThan(0);
    expect(spec).toMatch(/frontmatter/i);
    expect(spec).toMatch(/strip/i);
  });

  test("the Review notes spec carries the dedup clause: the copy replaces the final round's inline disposition block", () => {
    const spec = squash(reviewNotesSpec());
    expect(spec.length).toBeGreaterThan(0);
    expect(spec).toContain(DISPOSITION_HEADING);
    expect(spec).toMatch(/replac|exclud/i);
  });

  test("the literal notes filename agrees across team, team-implement, team-pr, and artifact-frontmatter skills", () => {
    for (const path of [TEAM_SKILL, TEAM_IMPLEMENT_SKILL, TEAM_PR_SKILL, ARTIFACT_SKILL]) {
      expect(read(path)).toContain(NOTES_FILENAME);
    }
  });
});
