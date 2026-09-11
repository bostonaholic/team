// tests/helpers/fixtures.test.ts

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  loadAgentInstructionContext,
  loadFixture,
  loadInstructionContext,
} from "./fixtures";

let root = "";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "fixtures-test-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeCase(agent: string, caseName: string, input: string, gt: unknown): void {
  const dir = join(root, agent, caseName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "input.md"), input, "utf8");
  writeFileSync(join(dir, "ground-truth.json"), JSON.stringify(gt), "utf8");
}

describe("loadFixture", () => {
  test("parses frontmatter and body and validates ground-truth", () => {
    writeCase(
      "code-reviewer",
      "case-a",
      "---\nagent: code-reviewer\ntier: periodic\ndeps:\n  - agents/code-reviewer.md\n---\n\nbody here\n",
      { bugs: [{ id: "x", description: "y", detection_hint: "z" }], minimum_detection: 1.0 },
    );
    const fx = loadFixture("code-reviewer", "case-a", root);
    expect(fx.frontmatter.agent).toBe("code-reviewer");
    expect(fx.frontmatter.tier).toBe("periodic");
    expect(fx.frontmatter.deps).toEqual(["agents/code-reviewer.md"]);
    expect(fx.body).toContain("body here");
    expect(fx.groundTruth.bugs.length).toBe(1);
    expect(fx.groundTruth.minimum_detection).toBe(1.0);
  });

  test("rejects fixture with missing tier", () => {
    writeCase(
      "code-reviewer",
      "no-tier",
      "---\nagent: code-reviewer\ndeps:\n  - x\n---\n",
      { bugs: [], minimum_detection: 1 },
    );
    expect(() => loadFixture("code-reviewer", "no-tier", root)).toThrow(/tier/);
  });

  test("rejects fixture with invalid tier value", () => {
    writeCase(
      "code-reviewer",
      "bad-tier",
      "---\nagent: code-reviewer\ntier: never\ndeps:\n  - x\n---\n",
      { bugs: [], minimum_detection: 1 },
    );
    expect(() => loadFixture("code-reviewer", "bad-tier", root)).toThrow(/tier/);
  });

  test("rejects ground-truth missing 'bugs[]'", () => {
    writeCase(
      "code-reviewer",
      "no-bugs",
      "---\nagent: code-reviewer\ntier: periodic\ndeps:\n  - x\n---\n",
      { minimum_detection: 1 },
    );
    expect(() => loadFixture("code-reviewer", "no-bugs", root)).toThrow(/bugs/);
  });

  test("rejects ground-truth missing 'minimum_detection'", () => {
    writeCase(
      "code-reviewer",
      "no-min",
      "---\nagent: code-reviewer\ntier: periodic\ndeps:\n  - x\n---\n",
      { bugs: [] },
    );
    expect(() => loadFixture("code-reviewer", "no-min", root)).toThrow(/minimum_detection/);
  });

  test("rejects fixture missing the deps field entirely", () => {
    writeCase(
      "code-reviewer",
      "no-deps",
      "---\nagent: code-reviewer\ntier: periodic\n---\n",
      { bugs: [{ id: "x", description: "y", detection_hint: "z" }], minimum_detection: 1 },
    );
    expect(() => loadFixture("code-reviewer", "no-deps", root)).toThrow(/deps/);
  });

  test("rejects fixture with an empty deps list", () => {
    // `deps:` present but no list items — diff selection would never match,
    // silently skipping the fixture. Must fail loudly.
    writeCase(
      "code-reviewer",
      "empty-deps",
      "---\nagent: code-reviewer\ntier: periodic\ndeps:\n---\n",
      { bugs: [{ id: "x", description: "y", detection_hint: "z" }], minimum_detection: 1 },
    );
    expect(() => loadFixture("code-reviewer", "empty-deps", root)).toThrow(/deps/);
  });
});

describe("loadInstructionContext", () => {
  test("loads labeled files in the requested order without changing bytes", () => {
    mkdirSync(join(root, "instructions"), { recursive: true });
    writeFileSync(join(root, "instructions", "a.md"), "first\n", "utf8");
    writeFileSync(join(root, "instructions", "b.md"), "second\n", "utf8");

    expect(loadInstructionContext(["instructions/a.md", "instructions/b.md"], root)).toBe(
      "# Instruction file: instructions/a.md\n\nfirst\n\n\n---\n\n# Instruction file: instructions/b.md\n\nsecond\n",
    );
  });

  test("fails with the missing path", () => {
    expect(() => loadInstructionContext([], root)).toThrow(/no paths named/);
    expect(() => loadInstructionContext(["missing.md"], root)).toThrow(/missing\.md/);
  });
});

describe("loadAgentInstructionContext", () => {
  test("returns the exact body and production model", () => {
    mkdirSync(join(root, "agents"), { recursive: true });
    writeFileSync(join(root, "agents", "reader.md"), "---\nname: reader\nmodel: sonnet\n---\n\nBody.\n", "utf8");

    expect(loadAgentInstructionContext("reader", root)).toEqual({
      body: "Body.\n",
      model: "sonnet",
    });
  });

  test("rejects missing files, frontmatter, and invalid models", () => {
    mkdirSync(join(root, "agents"), { recursive: true });
    writeFileSync(join(root, "agents", "bad.md"), "---\nname: bad\nmodel: unknown\n---\nBody\n", "utf8");
    writeFileSync(join(root, "agents", "open.md"), "---\nname: open\nmodel: sonnet\n", "utf8");

    expect(() => loadAgentInstructionContext("missing", root)).toThrow(/agents\/missing\.md/);
    expect(() => loadAgentInstructionContext("bad", root)).toThrow(/invalid model/);
    expect(() => loadAgentInstructionContext("open", root)).toThrow(/invalid frontmatter/);
  });
});

describe("Evaluation connection: consuming prompts", () => {
  const capture = String.raw`
    import { mock, expect } from "bun:test";
    import { join } from "node:path";
    const callbacks = new Map();
    const register = (name, callback) => callbacks.set(name, callback);
    register.skip = () => {};
    mock.module("bun:test", () => ({ expect, test: register, afterAll() {} }));
    const helpers = join(process.cwd(), "tests/helpers");
    mock.module(join(helpers, "touchfiles.ts"), () => ({
      testIfSelected: register,
      getSelectedE2ETests: () => new Set(["unslop-neutral-research"]),
    }));
    mock.module(join(helpers, "eval-store.ts"), () => ({
      EvalCollector: class {}, assertNoBudgetRegressions() {},
    }));
    const forbidden = () => { throw new Error("Paid boundary must not run"); };
    mock.module(join(helpers, "llm-judge.ts"), () => ({
      judgeQuality: forbidden, outcomeJudge: forbidden, callJudge: forbidden,
      wrapUntrusted: forbidden,
    }));
    let options;
    const captured = new Error("Captured runner arguments");
    mock.module(join(helpers, "session-runner.ts"), () => ({
      runAgentTest: async (input) => { options = input; throw captured; },
      successfullyReadEveryPath: forbidden,
    }));
    await import(join(process.cwd(), "tests", process.argv[2]));
    const callback = callbacks.get(process.argv[3]);
    if (!callback) throw new Error("Missing evaluation callback: " + process.argv[3]);
    let error = null;
    try { await callback(); }
    catch (failure) { if (failure !== captured) error = String(failure); }
    process.stdout.write(JSON.stringify({ options: options ?? null, error }));
  `;

  function preparePromptCopy() {
    const repo = join(import.meta.dir, "../..");
    cpSync(join(repo, "tests"), join(root, "tests"), { recursive: true });
    cpSync(join(repo, "evals/fixtures"), join(root, "evals/fixtures"), { recursive: true });
    cpSync(join(repo, "skills"), join(root, "skills"), { recursive: true });
    cpSync(join(repo, "agents"), join(root, "agents"), { recursive: true });
    writeFileSync(join(root, "capture.ts"), capture);
    writeFileSync(join(root, "skills/team/references/artifacts.md"), "ARTIFACT_RESOURCE_INITIAL\n");
    writeFileSync(join(root, "skills/team/references/external-data.md"), "EXTERNAL_RESOURCE_INITIAL\n");
  }

  function consumingPrompt(file: string, name: string) {
    const result = spawnSync(process.execPath, [join(root, "capture.ts"), file, name], {
      cwd: root,
      env: { PATH: "", HOME: root, TMPDIR: root, LANG: "C", TZ: "UTC" },
      encoding: "utf8",
      timeout: 10_000,
    });
    expect({ status: result.status, stderr: result.stderr }).toMatchObject({ status: 0 });
    return JSON.parse(result.stdout) as {
      options: { testName?: string; systemPromptAppend?: string } | null;
      error: string | null;
    };
  }

  test("the capture observes explicit resource bytes and missing-file errors without crossing a paid boundary", () => {
    preparePromptCopy();
    writeFileSync(join(root, "tests/capture-control.evals.ts"), `
      import { loadInstructionContext } from "./helpers/fixtures";
      import { runAgentTest } from "./helpers/session-runner";
      import { testIfSelected } from "./helpers/touchfiles";
      testIfSelected("capture-control", () => runAgentTest({
        testName: "capture-control",
        systemPromptAppend: loadInstructionContext(["skills/team/references/artifacts.md"]),
      }));
    `);
    const present = consumingPrompt("capture-control.evals.ts", "capture-control");
    expect(present.error).toBeNull();
    expect(present.options?.systemPromptAppend ?? "").toContain("ARTIFACT_RESOURCE_INITIAL\n");

    rmSync(join(root, "skills/team/references/artifacts.md"));
    const missing = consumingPrompt("capture-control.evals.ts", "capture-control");

    expect(missing.error ?? "").toContain(join(root, "skills/team/references/artifacts.md"));
    expect(missing.options).toBeNull();
  });

  describe.each([
    { file: "team-question.evals.ts", name: "team-question-neutral-questions", resource: "artifacts.md" },
    { file: "team-research.evals.ts", name: "team-research-answers-seeded-questions", resource: "artifacts.md" },
    { file: "team-design.evals.ts", name: "team-design-seeded-research-and-task", resource: "artifacts.md" },
    { file: "team-structure.evals.ts", name: "team-structure-seeded-design", resource: "artifacts.md" },
    { file: "team-plan.evals.ts", name: "team-plan-seeded-structure", resource: "artifacts.md" },
    { file: "team-question.evals.ts", name: "team-question-neutral-questions", resource: "external-data.md" },
  ])("$name / $resource", ({ file, name, resource }) => {
    test("changed resource bytes reach the actual consuming prompt", () => {
      preparePromptCopy();
      const path = join(root, "skills/team/references", resource);
      writeFileSync(path, "RESOURCE_BYTES_BEFORE\n");
      const before = consumingPrompt(file, name);
      expect(before.error).toBeNull();
      expect(before.options?.testName).toBe(name);
      expect(before.options?.systemPromptAppend ?? "").toContain("RESOURCE_BYTES_BEFORE\n");

      writeFileSync(path, "RESOURCE_BYTES_AFTER\n");
      const after = consumingPrompt(file, name);

      expect(after.error).toBeNull();
      expect(after.options?.testName).toBe(name);
      expect(after.options?.systemPromptAppend ?? "").toContain("RESOURCE_BYTES_AFTER\n");
      expect(after.options?.systemPromptAppend ?? "").not.toContain("RESOURCE_BYTES_BEFORE\n");
    });

    test("a missing resource stops prompt assembly with the missing path", () => {
      preparePromptCopy();
      const path = join(root, "skills/team/references", resource);
      const before = consumingPrompt(file, name);
      expect(before.error).toBeNull();
      expect(before.options?.testName).toBe(name);

      rmSync(path);
      const missing = consumingPrompt(file, name);

      expect(missing.error ?? "").toContain(path);
      expect(missing.options).toBeNull();
    });
  });
});
