// tests/helpers/seed.test.ts
//
// L1 pure-unit tests for the shared extractSeed helper. Free, deterministic,
// no I/O, no model. Auto-discovered by `bun test` (the `.test.ts` suffix).

import { describe, expect, test } from "bun:test";

import { extractSeed } from "./seed";

describe("extractSeed", () => {
  test("extracts the inner text of a present labeled fenced block", () => {
    const body = [
      "Preamble prose.",
      "",
      "```markdown questions.md",
      "---",
      "topic: token-bucket",
      "---",
      "",
      "# Research questions",
      "1. How are requests dispatched?",
      "```",
      "",
      "Trailing prose.",
    ].join("\n");

    const seed = extractSeed(body, "questions.md");
    expect(seed).toBe(
      [
        "---",
        "topic: token-bucket",
        "---",
        "",
        "# Research questions",
        "1. How are requests dispatched?",
      ].join("\n"),
    );
  });

  test("returns null when no block with the requested label is present", () => {
    const body = [
      "```markdown design.md",
      "# Design",
      "```",
    ].join("\n");

    expect(extractSeed(body, "questions.md")).toBeNull();
  });

  test("returns null when there are no fenced blocks at all", () => {
    expect(extractSeed("just prose, no fences", "questions.md")).toBeNull();
  });

  test("selects the correctly-labeled block when several blocks are present", () => {
    const body = [
      "```markdown task.md",
      "task body",
      "```",
      "",
      "```markdown research.md",
      "research body",
      "```",
    ].join("\n");

    expect(extractSeed(body, "task.md")).toBe("task body");
    expect(extractSeed(body, "research.md")).toBe("research body");
  });

  test("stops at the first closing fence (does not run past the block)", () => {
    const body = [
      "```markdown structure.md",
      "slice one",
      "```",
      "prose between blocks",
      "```",
      "not part of the block",
      "```",
    ].join("\n");

    expect(extractSeed(body, "structure.md")).toBe("slice one");
  });

  test("handles a block with empty content", () => {
    const body = ["```markdown empty.md", "```"].join("\n");
    expect(extractSeed(body, "empty.md")).toBe("");
  });

  test("requires an exact label match (no prefix/suffix collision)", () => {
    const body = ["```markdown questions.md.bak", "decoy", "```"].join("\n");
    expect(extractSeed(body, "questions.md")).toBeNull();
  });
});
