// Acceptance fence for the multi-model adversarial review pass
// (docs/plans/2026-08-12-multi-model-adversarial-review/plan.md).
//
// Slice 1 — opt-in cross-vendor pass on the code-reviewer: the bundled
//   skills/cross-model-review/external-review.mjs script (L1 pure core +
//   L3 subprocess with fake CLIs on a controlled PATH), the no-bypass
//   sweep, and the skill/agent/docs wiring tripwires.
// Slice 2 — per-round disposition record: the orchestrator appends each
//   round's `### Cross-model disposition` block to cross-model-notes.md
//   and the terminal halt names the file (L2 contract tripwires).
// Slice 3 — PR review notes carry every round exactly once (L2).
//
// Free tier per docs/testing.md: no model call, no metered API. Fake CLIs
// are bash stubs in a mkdtemp bin dir; the child PATH is fully controlled.

import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { frontmatter, read, squash } from "./helpers/text";

const REPO_ROOT = process.cwd();

// The cross-slice literals. Slice 1 produces them; slices 2-3 consume them,
// so every drift tripwire below reuses these constants.
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
  options: { binDir?: string; input?: string } = {},
): { status: number | null; stdout: string; stderr: string; combined: string } {
  const path = options.binDir ? `${options.binDir}:${SYSTEM_PATH}` : SYSTEM_PATH;
  const result = spawnSync(NODE, [SCRIPT, ...args], {
    encoding: "utf8",
    input: options.input,
    env: { ...process.env, PATH: path },
    timeout: 10_000,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  return { status: result.status, stdout, stderr, combined: stdout + stderr };
}

// Matches a positive availability claim without matching "unavailable".
const CLAIMS_AVAILABLE = /(?<!un)available/i;

// A recording fake writes a sibling `ran` file when executed, so a test can
// prove the script never spawned it (env-free: it locates itself via $0).
const RECORDING_FAKE = `#!/bin/bash
touch "$(dirname "$0")/ran"
cat >/dev/null
echo "fake findings"
`;

// ---------------------------------------------------------------------------
// Slice 1 — external-review.mjs pure core (L1)
// ---------------------------------------------------------------------------

describe("slice 1 — external-review.mjs pure core (L1)", () => {
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
// Slice 1 — detect: fail-closed, marker-first (L3)
// ---------------------------------------------------------------------------

describe("slice 1 — detect is fail-closed and marker-first (L3)", () => {
  test("no marker → unavailable naming the marker path, with no binary claim even when a fake codex sits on PATH", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    // Positive control: the availability matcher can see a positive claim.
    expect("codex: available").toMatch(CLAIMS_AVAILABLE);
    expect("codex: unavailable").not.toMatch(CLAIMS_AVAILABLE);

    const bin = makeBin({ codex: RECORDING_FAKE });
    const repo = makeRepo(/* withMarker */ false);
    const r = runScript(["detect", repo], { binDir: bin });
    expect(r.combined).toContain(MARKER_PATH);
    expect(r.combined).toMatch(/unavailable/i);
    expect(r.combined).not.toMatch(CLAIMS_AVAILABLE);
  });

  test("marker present + missing binaries → per-CLI unavailable", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const repo = makeRepo(/* withMarker */ true);
    // No bin dir: PATH carries only /usr/bin:/bin, where no codex/gemini live.
    const r = runScript(["detect", repo]);
    expect(r.combined).toContain("codex");
    expect(r.combined).toContain("gemini");
    expect(r.combined).toMatch(/unavailable/i);
    expect(r.combined).not.toMatch(CLAIMS_AVAILABLE);
  });

  test("lookup error (nonexistent repo root) → unavailable, never a crash claim of availability", () => {
    expect(existsSync(SCRIPT)).toBe(true);
    const bin = makeBin({ codex: RECORDING_FAKE });
    const r = runScript(["detect", join(tmpdir(), "cross-model-does-not-exist")], {
      binDir: bin,
    });
    expect(r.combined).toMatch(/unavailable/i);
    expect(r.combined).not.toMatch(CLAIMS_AVAILABLE);
  });
});

// ---------------------------------------------------------------------------
// Slice 1 — run: pre-spawn rejections, truncation, timeout, skip (L3)
// ---------------------------------------------------------------------------

describe("slice 1 — run guards and skip paths (L3)", () => {
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
// Slice 1 — no-bypass sweep (L2)
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

describe("slice 1 — no approval-bypass flag anywhere in skills/cross-model-review/ (L2)", () => {
  const FORBIDDEN = ["--yolo", "--full-auto", "-s workspace-write", "${CLAUDE_PLUGIN_ROOT}"];

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
// Slice 1 — wiring tripwires (L2)
// ---------------------------------------------------------------------------

describe("slice 1 — skill and agent wiring (L2)", () => {
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
// Slice 2 — orchestrator appends the per-round disposition record (L2)
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

describe("slice 2 — orchestrator contract in skills/team/SKILL.md (L2)", () => {
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
  });
});

describe("slice 2 — artifact schema in skills/artifact-frontmatter/SKILL.md (L2)", () => {
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
// Slice 3 — PR review notes carry every round exactly once (L2)
// ---------------------------------------------------------------------------

function reviewNotesSpec(): string {
  const paragraphs = read(TEAM_PR_SKILL).split(/\n\s*\n/);
  return paragraphs.find((p) => p.includes("`## Review notes` (conditional)")) ?? "";
}

describe("slice 3 — PR contract in skills/team-pr/SKILL.md (L2)", () => {
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

  test("the literal notes filename agrees across team, team-pr, and artifact-frontmatter skills", () => {
    for (const path of [TEAM_SKILL, TEAM_PR_SKILL, ARTIFACT_SKILL]) {
      expect(read(path)).toContain(NOTES_FILENAME);
    }
  });
});
