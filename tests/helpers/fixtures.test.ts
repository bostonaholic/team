// tests/helpers/fixtures.test.ts

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadFixture } from "./fixtures";

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
