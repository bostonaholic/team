import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import consumers from "../fixtures/principle-eval-resources.json";
import disposition from "../fixtures/principle-resources.json";
import { loadFixture } from "./fixtures";
import { E2E_TOUCHFILES, GLOBAL_TOUCHFILES, globMatch, selectTests } from "./touchfiles";

const REPO = join(import.meta.dir, "../..");
const RESOURCES = [...new Set(disposition.dispositions.map(({ destination }) => destination))];
let root = "";
let priorAll: string | undefined;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "principle-eval-"));
  priorAll = process.env.EVALS_ALL;
  delete process.env.EVALS_ALL;
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  if (priorAll === undefined) delete process.env.EVALS_ALL;
  else process.env.EVALS_ALL = priorAll;
});

const capture = String.raw`
  import { mock, expect } from "bun:test";
  import { readdirSync, readFileSync } from "node:fs";
  import { join } from "node:path";
  const callbacks = new Map();
  const register = (name, callback) => callbacks.set(name, callback);
  register.skip = () => {};
  mock.module("bun:test", () => ({ expect, test: register, afterAll() {} }));
  const helpers = join(process.cwd(), "tests/helpers");
  mock.module(join(helpers, "touchfiles.ts"), () => ({
    testIfSelected: register, getSelectedE2ETests: () => new Set(["unslop-neutral-research"]),
  }));
  mock.module(join(helpers, "eval-store.ts"), () => ({
    EvalCollector: class {}, assertNoBudgetRegressions() {},
  }));
  const forbidden = () => { throw new Error("Paid boundary must not run"); };
  mock.module(join(helpers, "llm-judge.ts"), () => ({
    judgeQuality: forbidden, judgeReviewerOutput: forbidden, outcomeJudge: forbidden,
    callJudge: forbidden, wrapUntrusted: forbidden, matchesHint: forbidden,
  }));
  const options = [];
  const files = {};
  const captured = new Error("Captured runner arguments");
  function snapshot(directory, prefix = "") {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(prefix, entry.name);
      if (entry.isDirectory()) snapshot(join(directory, entry.name), path);
      else if (entry.isFile()) files[path] = readFileSync(join(directory, entry.name), "utf8");
    }
  }
  mock.module(join(helpers, "session-runner.ts"), () => ({
    runAgentTest: async (input) => {
      options.push(input);
      if (input.testName === process.argv[4]) snapshot(input.workingDirectory);
      await Promise.resolve();
      await Promise.resolve();
      throw captured;
    },
    successfullyReadEveryPath: forbidden,
  }));
  let error = null;
  try {
    await import(join(process.cwd(), "tests", process.argv[2]));
    const callback = callbacks.get(process.argv[3]);
    if (!callback) throw new Error("Missing evaluation callback: " + process.argv[3]);
    await callback();
  } catch (failure) { if (failure !== captured) error = String(failure); }
  process.stdout.write(JSON.stringify({ options, files, error }));
`;

function prepare() {
  for (const directory of ["tests", "evals/fixtures", "skills", "agents"]) {
    cpSync(join(REPO, directory), join(root, directory), { recursive: true });
  }
  writeFileSync(join(root, "capture.ts"), capture);
}

function markResources(version: string) {
  for (const resource of RESOURCES) {
    mkdirSync(dirname(join(root, resource)), { recursive: true });
    writeFileSync(join(root, resource), marker(resource, version));
  }
}

function marker(resource: string, version: string): string {
  return `RESOURCE:${resource}:${version}\n`;
}

type Consumer = (typeof consumers)[number];
type Options = { testName: string; workingDirectory: string; systemPromptAppend?: string; prompt: string; allowedTools?: string[]; disallowedTools?: string[] };

function observe(consumer: Pick<Consumer, "file" | "callback" | "name">) {
  const result = spawnSync(process.execPath, [join(root, "capture.ts"), consumer.file, consumer.callback, consumer.name], {
    cwd: root,
    env: { PATH: "", HOME: root, TMPDIR: root, LANG: "C", TZ: "UTC" },
    encoding: "utf8",
    timeout: 10_000,
  });
  expect({ status: result.status, stderr: result.stderr }).toMatchObject({ status: 0 });
  const observed = JSON.parse(result.stdout) as { options: Options[]; files: Record<string, string>; error: string | null };
  return { ...observed, input: observed.options.find(({ testName }) => testName === consumer.name) };
}

function missingBytes(prompt: string, resources: string[], version: string): string[] {
  return resources.filter((resource) => !prompt.includes(marker(resource, version)));
}

function dependencies(consumer: Consumer) {
  const fixture = loadFixture(consumer.agent, consumer.case);
  return {
    unselected: consumer.resources.filter((resource) =>
      !selectTests([resource], E2E_TOUCHFILES, GLOBAL_TOUCHFILES).selected.has(consumer.selection)),
    undeclared: consumer.resources.filter((resource) =>
      !fixture.frontmatter.deps.some((glob) => globMatch(glob, resource))),
  };
}

function consumerNamed(name: string): Consumer {
  const consumer = consumers.find((item) => item.name === name);
  if (!consumer) throw new Error(`Unknown consumer: ${name}`);
  return consumer;
}

function retiredDependencies(): string[] {
  const fixtures = consumers.flatMap(({ agent, case: caseName }) => loadFixture(agent, caseName).frontmatter.deps);
  return [...new Set([...Object.values(E2E_TOUCHFILES).flat(), ...fixtures])]
    .filter((path) => path.startsWith("skills/principle-"));
}

describe("Evaluation connection: principle resources", () => {
  test("evaluation dependency declarations contain no retired principle paths", () => {
    expect(Object.keys(E2E_TOUCHFILES)).toContain("unslop-neutral-research");
    expect(retiredDependencies()).toEqual([]);
  });

  test.each(consumers)("$name receives changed resource bytes", (consumer) => {
    prepare();
    markResources("before");
    const before = observe(consumer);
    expect(before.error).toBeNull();
    expect(before.input?.testName).toBe(consumer.name);
    expect(missingBytes(before.input?.systemPromptAppend ?? "", consumer.resources, "before")).toEqual([]);

    markResources("after");
    const after = observe(consumer);

    expect(after.error).toBeNull();
    expect(after.input?.testName).toBe(consumer.name);
    expect(missingBytes(after.input?.systemPromptAppend ?? "", consumer.resources, "after")).toEqual([]);
    expect(after.input?.systemPromptAppend).not.toContain(":before\n");
  });

  test.each(consumers.flatMap((consumer) => consumer.resources.map((resource) => ({ ...consumer, resource }))))(
    "$name stops before dispatch when $resource is missing", (consumer) => {
      prepare();
      markResources("present");
      rmSync(join(root, consumer.resource));
      const missing = observe(consumer);

      expect(missing.input, consumer.resource).toBeUndefined();
      expect(missing.error ?? "").toContain(join(root, consumer.resource));
    },
  );

  test.each(consumers)("$name selects every moved input in both dependency maps", (consumer) => {
    const { unselected, undeclared } = dependencies(consumer);

    expect(unselected, "E2E_TOUCHFILES").toEqual([]);
    expect(undeclared, "fixture deps").toEqual([]);
  });
});

describe("Existing guards: evaluation controls", () => {
  test("the capture detects explicit bytes and a missing path", () => {
    prepare();
    markResources("control");
    mkdirSync(join(root, "empty"));
    writeFileSync(join(root, "tests/principle-control.evals.ts"), `
      import { loadInstructionContext } from "./helpers/fixtures";
      import { runAgentTest } from "./helpers/session-runner";
      import { testIfSelected } from "./helpers/touchfiles";
      testIfSelected("control", () => runAgentTest({ testName: "control", workingDirectory: process.cwd() + "/empty",
        systemPromptAppend: loadInstructionContext(["skills/team/principles/human-control.md"]),
      }));
    `);
    const present = observe({ file: "principle-control.evals.ts", callback: "control", name: "control" });
    expect(present.error).toBeNull();
    expect(present.input?.systemPromptAppend).toContain("RESOURCE:skills/team/principles/human-control.md:control\n");

    rmSync(join(root, "skills/team/principles/human-control.md"));
    const missing = observe({ file: "principle-control.evals.ts", callback: "control", name: "control" });

    expect(missing.input).toBeUndefined();
    expect(missing.error).toContain(join(root, "skills/team/principles/human-control.md"));
  });

  test("the original Research source fixture stays empty and receives only its seeded questions", () => {
    prepare();
    const observed = observe(consumerNamed("team-research-answers-seeded-questions"));

    expect(observed.error).toBeNull();
    expect(Object.keys(observed.files)).toEqual(["docs/plans/2026-06-03-token-bucket/2-questions.md"]);
    expect(existsSync(observed.input!.workingDirectory)).toBe(false);
  });

  test.each([
    "isolated Research producers and grounded assembly:file-finder",
    "isolated Research producers and grounded assembly:researcher",
    "named parent fallback on unreadable prose file",
  ])("%s retains neutral inputs and restricted tools", (name) => {
    prepare();
    const observed = observe(consumerNamed(name));

    expect(observed.error).toBeNull();
    expect(observed.input?.allowedTools).toEqual(["Read", "Grep", "Glob"]);
    expect(observed.input?.disallowedTools).toEqual(["Bash", "Write", "Edit", "Task", "Agent", "SendMessage"]);
    expect(Object.keys(observed.files)).toContain("docs/plans/2026-09-08-neutral-label/2-questions.md");
    expect(observed.files["docs/plans/2026-09-08-neutral-label/1-task.md"]).toContain("TASK_CANARY_LOWERCASE_LABELS_9F4A");
    expect(observed.input?.prompt).not.toContain("TASK_CANARY_LOWERCASE_LABELS_9F4A");
    expect(observed.input?.systemPromptAppend).not.toContain("TASK_CANARY_LOWERCASE_LABELS_9F4A");
  });

  test("the fresh design reviewer retains read-only tools and its seeded design", () => {
    prepare();
    const observed = observe(consumerNamed("fresh DESIGN reviewer prose evaluation"));

    expect(observed.error).toBeNull();
    expect(observed.input?.allowedTools).toEqual(["Read", "Grep", "Glob"]);
    expect(observed.input?.disallowedTools).toEqual(["Bash", "Write", "Edit", "Task", "Agent", "SendMessage"]);
    expect(Object.keys(observed.files).sort()).toEqual(["docs/plans/request-cache/6-design.md", "src/cache.pseudo"]);
    expect(observed.files["src/cache.pseudo"]).toBe("cache(request) returns one stored result\n");
  });
});
