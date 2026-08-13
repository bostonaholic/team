// Acceptance fence for the always-on cross-vendor review pass. It covers
// the bundled skills/cross-model-review/external-review.mjs runner (L1
// pure core + L3 subprocess against fake CLIs on a controlled PATH), the
// TEAM_DISABLE_CROSS_MODEL kill-switch, the
// no-bypass sweep, the skill/agent/docs wiring tripwires, the
// orchestrator's per-round disposition persistence to cross-model-notes.md
// (including the terminal halt naming the file), the design-review gate's
// external pass and its records (cross-model-raw.md, the bold round
// label), the two standalone design-gate entrances, and the PR
// review-notes copy rules that keep every round appearing exactly once.
//
// Free tier per docs/testing.md: no model call, no metered API. Fake CLIs
// are bash stubs in a mkdtemp bin dir; the child PATH is fully controlled,
// so no real codex/agy install can leak in.

import { afterAll, describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
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
const NOTES_FILENAME = "cross-model-notes.md";
const RAW_FILENAME = "cross-model-raw.md";
const UNAVAILABLE_HEADING = "## When a vendor CLI is unavailable";
const EXTERNAL_INPUT_HEADING = "## External review input";
const KILL_SWITCH_VAR = "TEAM_DISABLE_CROSS_MODEL";
// The label the orchestrator prepends inside the blockquote wrap when a
// design-round disposition lands in cross-model-notes.md. Bold form, never
// an h4 — a heading inside the wrap would leak into the PR body's outline.
const ROUND_LABEL = "> **Design round <n>**";

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
const ENG_REVIEW_SKILL = join(REPO_ROOT, "skills", "eng-design-doc-review", "SKILL.md");
const TEAM_DESIGN_SKILL = join(REPO_ROOT, "skills", "team-design", "SKILL.md");
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
  buildArgv: (cli: string, prompt?: string) => { command: string; args: string[] };
  promptWithinCap: (prompt: string) => boolean;
  truncateOutput: (text: string) => string;
};

const mod: Partial<ExternalReviewModule> = existsSync(SCRIPT)
  ? ((await import(SCRIPT)) as ExternalReviewModule)
  : {};

// ---------------------------------------------------------------------------
// L3 harness: run the bundled script with node against fake CLIs placed in a
// mkdtemp bin dir. PATH is replaced wholesale (bin dir + /usr/bin:/bin for
// bash/cat/head), so no real codex/agy install can leak in.
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

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), `cross-model-repo-${process.pid}-`));
  tempDirs.push(dir);
  return dir;
}

function runScript(
  args: string[],
  options: { binDir?: string; input?: string; extraEnv?: Record<string, string> } = {},
): { status: number | null; stdout: string; stderr: string; combined: string } {
  const path = options.binDir ? `${options.binDir}:${SYSTEM_PATH}` : SYSTEM_PATH;
  const env: Record<string, string | undefined> = {
    ...process.env,
    ...options.extraEnv,
    PATH: path,
  };
  // A developer machine may set the kill-switch globally. Unless a test
  // opts in through extraEnv, scrub it so marker-present expectations
  // never go red on that machine's policy.
  if (!(options.extraEnv && KILL_SWITCH_VAR in options.extraEnv)) {
    delete env[KILL_SWITCH_VAR];
  }
  const result = spawnSync(NODE, [SCRIPT, ...args], {
    encoding: "utf8",
    input: options.input,
    env,
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

  test("buildArgv pins the codex full-access argv exactly (prompt rides stdin)", () => {
    expect(typeof mod.buildArgv).toBe("function");
    const built = mod.buildArgv!("codex");
    expect(built.command).toBe("codex");
    expect(built.args).toEqual([
      "exec",
      "--dangerously-bypass-approvals-and-sandbox",
      "--skip-git-repo-check",
      "-",
    ]);
  });

  test("buildArgv pins the agy full-access argv with the prompt as the -p value", () => {
    // agy cannot read stdin: the prompt must be the -p flag's value, so
    // for this CLI alone it is visible in the process table.
    expect(typeof mod.buildArgv).toBe("function");
    const built = mod.buildArgv!("agy", "PROMPT-SENTINEL");
    expect(built.command).toBe("agy");
    expect(built.args).toEqual(["--dangerously-skip-permissions", "-p", "PROMPT-SENTINEL"]);
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
// detect: availability report (L3)
// ---------------------------------------------------------------------------

describe("detect reports per-CLI availability (L3)", () => {
  test("fake binaries on PATH → per-CLI ready, and detect spawns nothing", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    // Positive control: the matcher sees the script's real positive token.
    expect("codex: ready").toMatch(CLAIMS_READY);
    expect("codex: unavailable (binary not found on PATH)").not.toMatch(CLAIMS_READY);
    const bin = makeBin({ codex: RECORDING_FAKE, agy: RECORDING_FAKE });
    const r = runScript(["detect"], { binDir: bin });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("codex: ready");
    expect(r.stdout).toContain("agy: ready");
    // detect only vets PATH; the recording fake proves it never spawned.
    expect(existsSync(join(bin, "ran"))).toBe(false);
  });

  test("missing binaries → per-CLI unavailable naming the reason, so the caller can notify the user", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    // No bin dir: PATH carries only /usr/bin:/bin, where no vendor CLI lives.
    const r = runScript(["detect"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("codex: unavailable (binary not found on PATH)");
    expect(r.stdout).toContain("agy: unavailable (binary not found on PATH)");
    expect(r.combined).not.toMatch(CLAIMS_READY);
  });

  test("one vendor present, one missing → mixed report, never all-or-nothing", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const bin = makeBin({ codex: RECORDING_FAKE });
    const r = runScript(["detect"], { binDir: bin });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("codex: ready");
    expect(r.stdout).toContain("agy: unavailable (binary not found on PATH)");
  });
});

// ---------------------------------------------------------------------------
// run: pre-spawn refusals, truncation, timeout, skip (L3)
// ---------------------------------------------------------------------------

describe("run guards and skip paths (L3)", () => {
  test("run rejects an unknown CLI name with a usage error and non-zero exit before any spawn", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const bin = makeBin({ codex: RECORDING_FAKE });
    const repo = makeRepo();
    const r = runScript(["run", "qwen", repo], { binDir: bin, input: "prompt" });
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/usage/i);
    // The recording fake proves no child process ever ran.
    expect(existsSync(join(bin, "ran"))).toBe(false);
  });

  test("run rejects a prompt over PROMPT_CAP_BYTES with a usage error and non-zero exit before any spawn", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const bin = makeBin({ codex: RECORDING_FAKE });
    const repo = makeRepo();
    const oversized = "x".repeat(EXPECTED_PROMPT_CAP_BYTES + 1);
    const r = runScript(["run", "codex", repo], { binDir: bin, input: oversized });
    expect(r.status).not.toBe(0);
    expect(r.combined).toMatch(/usage/i);
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
    const repo = makeRepo();
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
    const repo = makeRepo();
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
    const repo = makeRepo();
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
      const repo = makeRepo();
      // Trailing timeout-ms argument exists for this test only; the skill's
      // documented invocation never passes it.
      const r = runScript(["run", "codex", repo, "500"], { binDir: bin, input: "prompt" });
      expect(r.combined).toMatch(/skip/i);
      expect(r.combined).toMatch(/time/i);
    },
    15_000,
  );

  test("codex child never receives agy's google-family credentials; its own vendor block passes through", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const bin = makeBin({
      codex: `#!/bin/bash
cat >/dev/null
echo "GEMINI_API_KEY=[\${GEMINI_API_KEY:-unset}] GOOGLE_API_KEY=[\${GOOGLE_API_KEY:-unset}] GOOGLE_APPLICATION_CREDENTIALS=[\${GOOGLE_APPLICATION_CREDENTIALS:-unset}] OPENAI_API_KEY=[\${OPENAI_API_KEY:-unset}]"
`,
    });
    const repo = makeRepo();
    const r = runScript(["run", "codex", repo], {
      binDir: bin,
      input: "prompt",
      extraEnv: {
        GEMINI_API_KEY: "agy-credential-leaked",
        GOOGLE_API_KEY: "google-credential-leaked",
        GOOGLE_APPLICATION_CREDENTIALS: "/tmp/google-adc-leaked.json",
        OPENAI_API_KEY: "openai-own-credential",
      },
    });
    expect(r.stdout).toContain("GEMINI_API_KEY=[unset]");
    expect(r.stdout).toContain("GOOGLE_API_KEY=[unset]");
    expect(r.stdout).toContain("GOOGLE_APPLICATION_CREDENTIALS=[unset]");
    // Positive control: the codex child still gets its own vendor variable,
    // so the absences above are partitioning, not a broken allowlist.
    expect(r.stdout).toContain("OPENAI_API_KEY=[openai-own-credential]");
    expect(r.combined).not.toContain("credential-leaked");
  });

  test("run spawns the full-access CLIs in the repo root cwd so they can read the codebase they review", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const PWD_FAKE = `#!/bin/bash
cat >/dev/null
pwd
`;
    const repo = makeRepo();
    for (const cli of ["codex", "agy"]) {
      const bin = makeBin({ [cli]: PWD_FAKE });
      const r = runScript(["run", cli, repo], { binDir: bin, input: "prompt" });
      const reportedCwd = r.stdout.trim();
      // Accept either path form (macOS tmpdir rides /private).
      expect([repo, realpathSync(repo)]).toContain(reportedCwd);
    }
  });

  test("run skips a CLI reachable only through a relative PATH entry, so the vetted file is always the executed file", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const bin = makeBin({ codex: RECORDING_FAKE });
    const repo = makeRepo();
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

  test("run reads a non-zero child exit as skip, naming the reason behind a vendor-stderr fence", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const bin = makeBin({
      codex: `#!/bin/bash
cat >/dev/null
echo "boom" >&2
exit 7
`,
    });
    const repo = makeRepo();
    const r = runScript(["run", "codex", repo], { binDir: bin, input: "prompt" });
    expect(r.combined).toMatch(/skip/i);
    expect(r.combined).toContain("7");
    // Vendor stderr is fenced so it can never read as runner protocol.
    expect(r.stdout).toContain("[vendor stderr] boom");
  });

  test("run delivers the prompt to codex on stdin", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const bin = makeBin({
      codex: `#!/bin/bash
printf 'stdin-received: '
cat
`,
    });
    const repo = makeRepo();
    // The fake echoes its stdin back, so the sentinel appearing is a
    // positive proof of stdin delivery, never an absence check. The
    // accelerated timeout bounds a stdin-starved fake.
    const r = runScript(["run", "codex", repo, "2000"], {
      binDir: bin,
      input: "prompt-sentinel-on-stdin",
    });
    expect(r.stdout).toContain("stdin-received: prompt-sentinel-on-stdin");
  });

  test("run delivers the prompt to agy as the -p argv value", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const bin = makeBin({
      agy: `#!/bin/bash
echo "argv-prompt: $3"
`,
    });
    const repo = makeRepo();
    // The fake echoes argv position 3 (after --dangerously-skip-permissions
    // and -p), so the sentinel appearing proves argv delivery. It never
    // reads stdin, so a runner regression that blocks on writing agy's
    // stdin would time out instead of passing.
    const r = runScript(["run", "agy", repo, "5000"], {
      binDir: bin,
      input: "prompt-sentinel-via-argv",
    });
    expect(r.stdout).toContain("argv-prompt: prompt-sentinel-via-argv");
  });

  test("agy child never receives openai/codex credentials; its google-family block passes through", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const bin = makeBin({
      agy: `#!/bin/bash
echo "OPENAI_API_KEY=[\${OPENAI_API_KEY:-unset}] CODEX_HOME=[\${CODEX_HOME:-unset}] GEMINI_API_KEY=[\${GEMINI_API_KEY:-unset}]"
`,
    });
    const repo = makeRepo();
    const r = runScript(["run", "agy", repo], {
      binDir: bin,
      input: "prompt",
      extraEnv: {
        OPENAI_API_KEY: "openai-credential-leaked",
        CODEX_HOME: "/tmp/codex-home-leaked",
        GEMINI_API_KEY: "agy-own-credential",
      },
    });
    expect(r.stdout).toContain("OPENAI_API_KEY=[unset]");
    expect(r.stdout).toContain("CODEX_HOME=[unset]");
    // Positive control: the agy child still gets its google-family block
    // (variable names inherited from the CLI it superseded).
    expect(r.stdout).toContain("GEMINI_API_KEY=[agy-own-credential]");
    expect(r.combined).not.toContain("credential-leaked");
  });

  test("run collapses a multi-line vendor stderr into a single-line skip", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const bin = makeBin({
      codex: `#!/bin/bash
cat >/dev/null
echo "auth error: token expired" >&2
echo "  at vendor.stack.frame.two" >&2
echo "  at vendor.stack.frame.three" >&2
exit 1
`,
    });
    const repo = makeRepo();
    const r = runScript(["run", "codex", repo], { binDir: bin, input: "prompt" });
    // The caller contract says a skip is exactly one line starting
    // "skip: " — a vendor stack trace on stderr must not break it.
    const lines = r.stdout.trimEnd().split("\n");
    expect(lines.length).toBe(1);
    expect(lines[0]!.startsWith("skip: codex")).toBe(true);
    // Positive control: the collapse kept the stderr content, first line
    // and last, so the single line is a fold, not a truncation.
    expect(lines[0]).toContain("auth error: token expired");
    expect(lines[0]).toContain("vendor.stack.frame.three");
  });

  test("run reads exit 0 with empty stdout as a produced-no-output skip", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const bin = makeBin({
      codex: `#!/bin/bash
cat >/dev/null
exit 0
`,
    });
    const repo = makeRepo();
    const r = runScript(["run", "codex", repo], { binDir: bin, input: "prompt" });
    // Silence from a healthy CLI must never read as agreement: the runner
    // says so out loud, on one line the caller can discriminate.
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("skip: codex produced no output");
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
    const result = spawnSync(
      NODE,
      [join(linkedSkillDir, "external-review.mjs"), "detect"],
      { encoding: "utf8", env: { ...process.env, PATH: SYSTEM_PATH }, timeout: 10_000 },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("codex");
    expect(result.stdout).toContain("agy");
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
      const repo = makeRepo();
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

describe("no unsanctioned bypass flag anywhere in skills/cross-model-review/ (L2)", () => {
  // The sanctioned full-access flags (codex's
  // --dangerously-bypass-approvals-and-sandbox, agy's
  // --dangerously-skip-permissions) are pinned exactly by the buildArgv
  // pins above; every other bypass or escalation spelling stays banned.
  // The bare "yolo" token subsumes --yolo and any yolo=true config
  // spelling.
  const FORBIDDEN = [
    "yolo",
    "--full-auto",
    "workspace-write",
    "danger-full-access",
    "--dangerously-bypass-hook-trust",
    "--approve-for-me",
    "disk-full-read-access",
    "${CLAUDE_PLUGIN_ROOT}",
  ];

  for (const token of FORBIDDEN) {
    test(`zero matches for ${token}`, () => {
      // Positive control: the sweep can see the token it hunts
      // (docs/testing.md — prove a negative check can find a positive).
      expect(`argv carries ${token} by mistake`).toContain(token);
      // Guard: a missing or empty skill dir must fail, not vacuously pass.
      // The exact shipped file count is pinned by the dedicated floor test
      // in the role-named prompt templates block; this lower bound only
      // keeps the sweep from running over an emptied directory.
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

  test("skill body carries the unavailable-CLI notification section", () => {
    expect(readOrEmpty(SKILL_MD)).toContain(UNAVAILABLE_HEADING);
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

// ---------------------------------------------------------------------------
// TEAM_DISABLE_CROSS_MODEL kill-switch (L3 + L2)
// ---------------------------------------------------------------------------

describe("TEAM_DISABLE_CROSS_MODEL kill-switch", () => {
  // Machine policy: any non-empty value hard-disables every cross-model
  // call, fail closed.
  test("detect with the kill-switch set reports disabled for every CLI and claims no binary", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    // Positive control: the matcher sees the script's real positive token.
    expect("codex: ready").toMatch(CLAIMS_READY);
    const bin = makeBin({ codex: RECORDING_FAKE, agy: RECORDING_FAKE });
    const r = runScript(["detect"], {
      binDir: bin,
      extraEnv: { [KILL_SWITCH_VAR]: "1" },
    });
    expect(r.stdout).toContain(`codex: unavailable (disabled by ${KILL_SWITCH_VAR})`);
    expect(r.stdout).toContain(`agy: unavailable (disabled by ${KILL_SWITCH_VAR})`);
    expect(r.combined).not.toMatch(CLAIMS_READY);
  });

  test("run with the kill-switch set exits 4 before any spawn", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const bin = makeBin({ codex: RECORDING_FAKE });
    const repo = makeRepo();
    const r = runScript(["run", "codex", repo], {
      binDir: bin,
      input: "prompt",
      extraEnv: { [KILL_SWITCH_VAR]: "1" },
    });
    // Exit 4 is the kill-switch refusal, and it names the variable it
    // enforces.
    expect(r.status).toBe(4);
    expect(r.stderr).toContain(KILL_SWITCH_VAR);
    // The recording fake proves no child process ever ran.
    expect(existsSync(join(bin, "ran"))).toBe(false);
  });

  test("skill names the kill-switch variable in the unavailable-CLI section", () => {
    const section = windowSection(
      readOrEmpty(SKILL_MD),
      /^## When a vendor CLI is unavailable/,
      /^## /,
    );
    // Guard: a renamed section must fail, not vacuously pass.
    expect(section.length).toBeGreaterThan(0);
    expect(section).toContain(KILL_SWITCH_VAR);
  });
});

// ---------------------------------------------------------------------------
// role-named prompt templates (L2)
// ---------------------------------------------------------------------------

describe("role-named prompt templates (L2)", () => {
  const CODE_TEMPLATE = join(SKILL_DIR, "prompt-template-code-review.md");
  const DESIGN_TEMPLATE = join(SKILL_DIR, "prompt-template-design-review.md");

  test("deny-list sweep floor guards four shipped files", () => {
    // SKILL.md, external-review.mjs, and the two role-named templates: a
    // dropped file shrinks the surface the forbidden-token sweep covers.
    expect(filesUnder(SKILL_DIR).length).toBeGreaterThanOrEqual(4);
  });

  test("skill names prompt-template-code-review.md, and the bare prompt-template.md name is gone", () => {
    // Positive control: the sweep can see the token it hunts.
    expect("Build the prompt from prompt-template.md plus the diff").toContain(
      "prompt-template.md",
    );
    // The role-named filenames do not carry the bare name as a substring,
    // so the sweep cannot false-positive on them.
    expect("prompt-template-code-review.md").not.toContain("prompt-template.md");
    expect(readOrEmpty(SKILL_MD)).toContain("prompt-template-code-review.md");
    const files = filesUnder(SKILL_DIR);
    // Guard: a missing or empty skill dir must fail, not vacuously pass.
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((file) => read(file).includes("prompt-template.md"));
    expect(offenders).toEqual([]);
  });

  test("both templates carry the optimality and blast-radius directives", () => {
    // Guards: a missing template must fail here, not vacuously pass.
    const codeTemplate = squash(readOrEmpty(CODE_TEMPLATE));
    expect(codeTemplate.length).toBeGreaterThan(0);
    expect(codeTemplate).toMatch(/optimal/i);
    expect(codeTemplate).toContain("blast radius");

    const designTemplate = squash(readOrEmpty(DESIGN_TEMPLATE));
    expect(designTemplate.length).toBeGreaterThan(0);
    expect(designTemplate).toMatch(/optimal/i);
    expect(designTemplate).toContain("blast radius");
  });
});

// ---------------------------------------------------------------------------
// The pipeline design gate runs the external pass (L2)
// ---------------------------------------------------------------------------

function designReviewGate(): string {
  return windowSection(read(TEAM_SKILL), /^### Design Review Gate/, /^#{1,3} /);
}

describe("design-review gate wiring (L2)", () => {
  test("the Design Review Gate section runs the external pass", () => {
    const gate = designReviewGate();
    // Guard: a renamed section must fail, not vacuously pass.
    expect(gate.length).toBeGreaterThan(0);
    expect(gate).toContain("`detect`");
    expect(gate).toContain("`run`");
    // Raw vendor output is fenced as DATA at capture time.
    expect(gate).toContain("DATA");
    expect(gate).toContain(EXTERNAL_INPUT_HEADING);
    // The one gate before any call is machine policy: the kill-switch.
    expect(gate).toContain(KILL_SWITCH_VAR);
    // The verdict: frontmatter derives from the last verdict token in the
    // reviewer's report body — the terminal line, never the first mention.
    expect(squash(gate)).toContain("last verdict token");
  });

  test("the review brief loads cross-model-review as the conditional fifth manual", () => {
    const text = read(ENG_REVIEW_SKILL);
    expect(text).toContain("cross-model-review");
    expect(text).toContain(EXTERNAL_INPUT_HEADING);
    // Positive control: the sweep can see the phrase it retires.
    expect("load these four methodology skills now").toContain("four methodology skills");
    expect(squash(text)).not.toContain("four methodology skills");
  });

  test("the disposition definition lives in exactly one skill, which states the skill-dir fallback", () => {
    const ANTI_LAUNDERING = "**Anti-laundering:**";
    // Positive control: the sweep can see the definition literal.
    expect(`${ANTI_LAUNDERING} no external claim`).toContain(ANTI_LAUNDERING);
    const skillFiles = filesUnder(join(REPO_ROOT, "skills"));
    // Guard: an empty skills tree must fail, not vacuously pass.
    expect(skillFiles.length).toBeGreaterThan(0);
    const holders = skillFiles.filter((file) => read(file).includes(ANTI_LAUNDERING));
    expect(holders).toEqual([SKILL_MD]);
    // The single home also carries the runner-not-found fallback the
    // referencing surfaces rely on.
    expect(readOrEmpty(SKILL_MD)).toContain("skip: cross-model runner not found");
  });
});

// ---------------------------------------------------------------------------
// untrusted-output containment rules (L2)
// ---------------------------------------------------------------------------

describe("untrusted-output containment rules (L2)", () => {
  test("the design-review pass states the fence-length containment rule", () => {
    const section = windowSection(readOrEmpty(SKILL_MD), /^## Design-review pass/, /^## /);
    // Guard: a renamed section must fail, not vacuously pass.
    expect(section.length).toBeGreaterThan(0);
    // Positive control: the matcher sees the phrase it hunts.
    expect(
      squash("a fence strictly longer than the\nlongest backtick run in the output"),
    ).toContain("longest backtick run");
    // A vendor line of backticks must never close the DATA fence early:
    // the fence length is chosen against the captured output.
    expect(squash(section)).toContain("longest backtick run");
  });

  test("the untrusted-output section binds the write sink to the Write tool and bans heredocs", () => {
    const section = windowSection(readOrEmpty(SKILL_MD), /^## Untrusted output/, /^## /);
    // Guard: a renamed section must fail, not vacuously pass.
    expect(section.length).toBeGreaterThan(0);
    const flattened = squash(section);
    // Raw vendor bytes reach disk only through a sink that cannot
    // evaluate them. A heredoc — quoted or not — is not such a sink: a
    // vendor line equal to the delimiter ends it early and the rest of
    // the text runs as shell (the groom-backlog rule). Interpolation
    // into a shell command would execute an embedded $(…) directly.
    expect(flattened).toContain("Write tool");
    expect(flattened).toContain("never a heredoc");
    expect(flattened).toContain("equal to the delimiter");
    expect(flattened).toMatch(/never interpolated/i);
  });

  test("all three entrances carry the fence-length and untrusted-opening-line pointers", () => {
    // Drift class: a containment rule stated in one surface and absent in
    // a sibling. Every entrance that restates the append must carry both
    // pointers into the shared section.
    for (const path of [TEAM_SKILL, TEAM_DESIGN_SKILL, ENG_REVIEW_SKILL]) {
      const flattened = squash(read(path));
      // Guard: an emptied file must fail, not vacuously pass.
      expect(flattened.length).toBeGreaterThan(0);
      expect(flattened).toContain("backtick run");
      expect(flattened).toContain("untrusted-content line");
    }
  });
});

// ---------------------------------------------------------------------------
// design rounds persist to the shared records (L2)
// ---------------------------------------------------------------------------

describe("design-round records (L2)", () => {
  test("the Design Review Gate names the notes file, the raw file, and the bold round-label literal", () => {
    const gate = designReviewGate();
    // Guard: a renamed section must fail, not vacuously pass.
    expect(gate.length).toBeGreaterThan(0);
    expect(gate).toContain(NOTES_FILENAME);
    expect(gate).toContain(RAW_FILENAME);
    expect(gate).toContain(ROUND_LABEL);
  });

  test("artifact-frontmatter documents cross-model-raw.md with phase: cross-model-raw and the label reading rule", () => {
    const text = read(ARTIFACT_SKILL);
    expect(text).toContain(RAW_FILENAME);
    expect(text).toContain("phase: cross-model-raw");
    // The reading rule keys on the label: a block opening with it came from
    // the design gate; an unlabeled block came from the IMPLEMENT gate.
    expect(text).toContain(ROUND_LABEL);
  });

  test("the Review notes clause (b) excludes the cross-model disposition heading", () => {
    const spec = reviewNotesSpec();
    // Guard: a reworded anchor must fail, not vacuously pass.
    expect(spec.length).toBeGreaterThan(0);
    // Clause (a)'s existing exclusion plus clause (b)'s: the copy in (d)
    // is the single carrier, so every round appears exactly once.
    const occurrences = spec.split(DISPOSITION_HEADING).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// /team-design carries the same gate procedure (L2)
// ---------------------------------------------------------------------------

describe("orchestrator contract in skills/team-design/SKILL.md (L2)", () => {
  // team-design carries its own complete design-gate procedure, so it needs
  // the same external-pass and persistence rules as skills/team/SKILL.md —
  // a standalone /team-design run must not silently drop them.
  test("team-design carries the disposition heading and the notes file", () => {
    const text = read(TEAM_DESIGN_SKILL);
    expect(text).toContain(DISPOSITION_HEADING);
    expect(text).toContain(NOTES_FILENAME);
  });

  test("the round-label literal is byte-identical between team and team-design", () => {
    expect(read(TEAM_SKILL)).toContain(ROUND_LABEL);
    expect(read(TEAM_DESIGN_SKILL)).toContain(ROUND_LABEL);
  });
});

// ---------------------------------------------------------------------------
// standalone /eng-design-doc-review runs the pass (L2)
// ---------------------------------------------------------------------------

describe("eng-design-doc-review standalone pass (L2)", () => {
  test("eng-design-doc-review execution runs the external pass and writes no artifact", () => {
    const execution = windowSection(read(ENG_REVIEW_SKILL), /^## Execution/, /^## /);
    // Guard: a renamed section must fail, not vacuously pass.
    expect(execution.length).toBeGreaterThan(0);
    expect(execution).toContain("external-review.mjs");
    expect(execution).toContain(EXTERNAL_INPUT_HEADING);
    // A standalone run records nothing: raw vendor text stays in the
    // invoking session — no notes append, no raw file.
    expect(squash(execution)).toMatch(/no artifact/i);
  });

  test("the completion notice reports unavailable CLIs and names the kill-switch", () => {
    const completion = windowSection(read(ENG_REVIEW_SKILL), /^## Completion/, /^## /);
    // Guard: a renamed section must fail, not vacuously pass.
    expect(completion.length).toBeGreaterThan(0);
    expect(completion).toMatch(/unavailable/i);
    expect(completion).toContain(KILL_SWITCH_VAR);
  });
});
