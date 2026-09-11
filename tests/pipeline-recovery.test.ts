import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const PROCESS_TIMEOUT_MS = 15_000;
const HOOKS = ["session-start-recover.mjs", "pre-compact-anchor.mjs"];
const ARTIFACTS = [
  ["1-task.md", "task"],
  ["2-questions.md", "question"],
  ["5-research.md", "research"],
  ["6-design.md", "design"],
  ["7-structure.md", "structure"],
] as const;

type Topic = {
  id: string;
  through: "research" | "design" | "structure";
  mtime: number;
  artifactMtimes?: Record<string, number>;
};
type Recovery = { id: string; phase: string } | null;

function review(verdict: string | null, verdictLine = 5, closingLine: number | null = 6) {
  const lines = Array<string>(closingLine ?? verdictLine).fill("# padding");
  lines[0] = "---";
  lines[1] = "topic: migration-baseline";
  lines[2] = "date: 2026-01-01";
  lines[3] = "phase: design-review";
  if (verdict !== null) lines[verdictLine - 1] = `verdict: ${verdict}`;
  if (closingLine !== null) lines[closingLine - 1] = "---";
  return lines.join("\n") + "\n";
}

const RECOVERY_CASES: Array<{
  scenario: string;
  topics: Topic[];
  malformedJSON: boolean;
  expected: Recovery;
}> = [
  { scenario: "zero topics", topics: [], malformedJSON: false, expected: null },
  {
    scenario: "one researched topic",
    topics: [{ id: "GH-369-researched", through: "research", mtime: 1767225600 }],
    malformedJSON: false,
    expected: { id: "GH-369-researched", phase: "DESIGN" },
  },
  {
    scenario: "structure resumes at PLAN",
    topics: [{ id: "GH-369-structured", through: "structure", mtime: 1767225600 }],
    malformedJSON: false,
    expected: { id: "GH-369-structured", phase: "PLAN" },
  },
  {
    scenario: "newest phase artifact selects the topic",
    topics: [
      { id: "GH-369-z-newer", through: "research", mtime: 1767225600,
        artifactMtimes: { "5-research.md": 1767398400 } },
      { id: "GH-369-a-older", through: "structure", mtime: 1767312000 },
    ],
    malformedJSON: false,
    expected: { id: "GH-369-z-newer", phase: "DESIGN" },
  },
  {
    scenario: "invalid prefix alone is ineligible",
    topics: [{ id: "NotAValidId", through: "research", mtime: 1767225600 }],
    malformedJSON: false,
    expected: null,
  },
  {
    scenario: "newer invalid prefix cannot replace an eligible topic",
    topics: [
      { id: "GH-369-eligible", through: "research", mtime: 1767225600 },
      { id: "NotAValidId", through: "structure", mtime: 1767312000 },
    ],
    malformedJSON: false,
    expected: { id: "GH-369-eligible", phase: "DESIGN" },
  },
  {
    scenario: "malformed JSON falls back to subprocess cwd",
    topics: [{ id: "GH-369-fallback", through: "research", mtime: 1767225600 }],
    malformedJSON: true,
    expected: { id: "GH-369-fallback", phase: "DESIGN" },
  },
];

const REVIEW_CASES: Array<{ scenario: string; reviews: Record<string, string>; phase: string }> = [
  { scenario: "missing review", reviews: {}, phase: "DESIGN" },
  { scenario: "missing verdict", reviews: { "design-review-1.md": review(null) }, phase: "DESIGN" },
  { scenario: "unknown verdict", reviews: { "design-review-1.md": review("UNKNOWN") }, phase: "DESIGN" },
  { scenario: "REQUEST CHANGES", reviews: { "design-review-1.md": review("REQUEST CHANGES") }, phase: "DESIGN" },
  { scenario: "APPROVE", reviews: { "design-review-1.md": review("APPROVE") }, phase: "STRUCTURE" },
  { scenario: "COMMENT", reviews: { "design-review-1.md": review("COMMENT") }, phase: "STRUCTURE" },
  {
    scenario: "failing review 10 supersedes passing review 9",
    reviews: {
      "design-review-10.md": review("REQUEST CHANGES"),
      "design-review-9.md": review("APPROVE"),
    },
    phase: "DESIGN",
  },
];

const BOUNDARY_CASES = [
  { scenario: "verdict at line 60", body: review("APPROVE", 60, 61), phase: "STRUCTURE", selected: "" },
  { scenario: "verdict at line 61", body: review("APPROVE", 61, 62), phase: "DESIGN", selected: "" },
  {
    scenario: "closing delimiter at line 60",
    body: review("APPROVE", 5, 60),
    phase: "STRUCTURE",
    selected: "docs/plans/GH-369-boundary/\n",
  },
  { scenario: "closing delimiter at line 61", body: review("APPROVE", 5, 61), phase: "STRUCTURE", selected: "" },
  { scenario: "unclosed passing header", body: review("APPROVE", 5, null), phase: "STRUCTURE", selected: "" },
];

describe("Slice 3: topic recovery and verdict parsing", () => {
  let owned: string[] = [];
  let consumer: string;
  let revision: string;
  let caseName: string;
  let scenario: string;
  let environment: NodeJS.ProcessEnv;

  beforeAll(() => {
    const result = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: ROOT, encoding: "utf8", timeout: PROCESS_TIMEOUT_MS, killSignal: "SIGKILL",
    });
    console.log(JSON.stringify({ operation: "source revision", status: result.status,
      stdout: result.stdout, stderr: result.stderr, error: result.error?.message ?? null }));
    expect(result.error, result.stderr).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    revision = result.stdout.trim();
  });

  beforeEach(() => {
    owned = [];
    caseName = "setup";
    scenario = "setup";
    const directory = mkdtempSync(join(tmpdir(), "team-recovery-consumer-"));
    owned.push(directory);
    consumer = realpathSync(directory);
    mkdirSync(join(consumer, "docs", "plans"), { recursive: true });
    environment = {
      PATH: process.env.PATH,
      HOME: consumer,
      TMPDIR: tmpdir(),
      LANG: "C", LC_ALL: "C", TZ: "UTC",
      GIT_CEILING_DIRECTORIES: realpathSync(tmpdir()),
    };
  });

  afterEach(() => {
    const failures: unknown[] = [];
    for (const path of owned) {
      try {
        rmSync(path, { recursive: true, force: true });
        const present = existsSync(path);
        console.log(JSON.stringify({ operation: "cleanup", case: caseName, scenario, revision, consumer, path,
          expected: "absent", actual: present ? "present" : "absent" }));
        expect(present, path).toBe(false);
      } catch (error) {
        console.log(JSON.stringify({ operation: "cleanup", case: caseName, scenario, revision, consumer, path,
          expected: "absent", error: String(error) }));
        failures.push(error);
      }
    }
    owned = [];
    if (failures.length > 0) throw new AggregateError(failures, "Recovery fixture cleanup failed");
  });

  function seed(name: string, scenarioName: string, topics: Topic[], reviews: Record<string, string> = {}) {
    caseName = name;
    scenario = scenarioName;
    for (const topic of topics) {
      const directory = join(consumer, "docs", "plans", topic.id);
      mkdirSync(directory, { recursive: true });
      const last = ARTIFACTS.findIndex(([, phase]) => phase === topic.through);
      for (const [index, [file, phase]] of ARTIFACTS.slice(0, last + 1).entries()) {
        const path = join(directory, file);
        writeFileSync(path, [
          "---", `topic: ${topic.id}`, "date: 2026-01-01", `phase: ${phase}`,
          ...(phase === "design" ? ["revision: 0"] : []),
          "---", "", "# Recovery fixture", "",
        ].join("\n"));
        const mtime = topic.artifactMtimes?.[file] ?? topic.mtime + index * 60;
        utimesSync(path, mtime, mtime);
      }
      for (const [index, [file, body]] of Object.entries(reviews).entries()) {
        const path = join(directory, file);
        writeFileSync(path, body);
        const mtime = 1767484800 + index * 60;
        utimesSync(path, mtime, mtime);
      }
    }
    console.log(JSON.stringify({ operation: "fixture", case: caseName, scenario, revision, consumer, topics, reviews }));
  }

  function observe(operation: string, command: string, args: string[], input: string, expected: unknown) {
    const start = performance.now();
    const result = spawnSync(command, args, {
      cwd: consumer, env: environment, input, encoding: "utf8",
      timeout: PROCESS_TIMEOUT_MS, killSignal: "SIGKILL",
    });
    const actual = {
      status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "",
      signal: result.signal, error: result.error?.message ?? null,
    };
    console.log(JSON.stringify({ operation, case: caseName, scenario, revision, consumer, command, args, input,
      expected, actual, durationMs: performance.now() - start }));
    expect(actual.error, operation).toBeNull();
    expect(actual.signal, operation).toBeNull();
    expect(actual.status, actual.stderr).toBe(0);
    return actual;
  }

  function recover(hook: string, malformedJSON: boolean, expected: Recovery) {
    const directory = expected === null ? null : join(consumer, "docs", "plans", expected.id);
    const result = observe(hook, "node", [join(ROOT, "hooks", hook)],
      malformedJSON ? "{malformed" : JSON.stringify({ cwd: consumer }), { ...expected, directory });
    expect(result.stdout, hook).toBe("");
    if (expected === null) {
      expect(result.stderr, hook).toBe("");
      return null;
    }
    expect(result.stderr.length, hook).toBeGreaterThan(0);
    const context = JSON.parse(result.stderr).hookSpecificOutput?.additionalContext;
    expect(typeof context, hook).toBe("string");
    const phaseAndId = context.match(/^Phase: (\w+) \| Id: (.+)$/m);
    const actualDirectory = context.match(/^Artifact directory: (.+)$/m)?.[1];
    const actual = { id: phaseAndId?.[2], phase: phaseAndId?.[1], directory: actualDirectory };
    console.log(JSON.stringify({ operation: "recovered context", case: caseName, scenario, hook, revision, consumer,
      expected: { ...expected, directory }, actual }));
    expect(actualDirectory, hook).toBe(directory);
    return { id: actual.id, phase: actual.phase };
  }

  describe.each(HOOKS)("%s", (hook) => {
    describe.each(RECOVERY_CASES)("$scenario", ({ scenario, topics, malformedJSON, expected }) => {
      test("Recovery identifies the current topic and phase", () => {
        seed("Recovery identifies the current topic and phase", scenario, topics);

        const actual = recover(hook, malformedJSON, expected);

        expect(actual).toEqual(expected);
      }, 30_000);
    });

    describe.each(REVIEW_CASES)("$scenario", ({ scenario, reviews, phase }) => {
      test("Latest numeric review controls design recovery", () => {
        seed("Latest numeric review controls design recovery", scenario, [{ id: "GH-369-review", through: "design", mtime: 1767225600 }], reviews);

        const actual = recover(hook, false, { id: "GH-369-review", phase });

        expect(actual).toEqual({ id: "GH-369-review", phase });
      }, 30_000);
    });

    describe.each(BOUNDARY_CASES)("$scenario", ({ scenario, body, phase }) => {
      test("Parser boundaries preserve documented exceptions", () => {
        seed("Parser boundaries preserve documented exceptions", scenario, [{ id: "GH-369-boundary", through: "design", mtime: 1767225600 }], { "design-review-1.md": body });

        const actual = recover(hook, false, { id: "GH-369-boundary", phase });

        expect(actual).toEqual({ id: "GH-369-boundary", phase });
      }, 30_000);
    });
  });

  describe.each(BOUNDARY_CASES)("$scenario", ({ scenario, body, selected }) => {
    test("Parser boundaries preserve documented exceptions", () => {
      seed("Parser boundaries preserve documented exceptions", scenario, [{ id: "GH-369-boundary", through: "design", mtime: 1767225600 }], { "design-review-1.md": body });

      const result = observe("bare gated discovery", "bash", [
        join(ROOT, "skills", "team", "discover-topic.sh"), "", "6-design.md", "--require-passing-review",
      ], "", { status: 0, stdout: selected, stderr: "" });

      expect(result.stdout).toBe(selected);
      expect(result.stderr).toBe("");
    }, 30_000);

    describe("explicit path bypass", () => {
      test("Parser boundaries preserve documented exceptions", () => {
        seed("Parser boundaries preserve documented exceptions", scenario, [{ id: "GH-369-boundary", through: "design", mtime: 1767225600 }], { "design-review-1.md": body });

        const result = observe("explicit discovery bypass", "bash", [
          join(ROOT, "skills", "team", "discover-topic.sh"), "docs/plans/GH-369-boundary",
          "6-design.md", "--require-passing-review",
        ], "", { status: 0, stdout: "docs/plans/GH-369-boundary\n", stderr: "" });

        expect(result.stdout).toBe("docs/plans/GH-369-boundary\n");
        expect(result.stderr).toBe("");
      }, 30_000);
    });
  });
});
