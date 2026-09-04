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
      "```markdown 2-questions.md",
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

    const seed = extractSeed(body, "2-questions.md");
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
      "```markdown 6-design.md",
      "# Design",
      "```",
    ].join("\n");

    expect(extractSeed(body, "2-questions.md")).toBeNull();
  });

  test("returns null when there are no fenced blocks at all", () => {
    expect(extractSeed("just prose, no fences", "2-questions.md")).toBeNull();
  });

  test("selects the correctly-labeled block when several blocks are present", () => {
    const body = [
      "```markdown 1-task.md",
      "task body",
      "```",
      "",
      "```markdown 5-research.md",
      "research body",
      "```",
    ].join("\n");

    expect(extractSeed(body, "1-task.md")).toBe("task body");
    expect(extractSeed(body, "5-research.md")).toBe("research body");
  });

  test("stops at the first closing fence (does not run past the block)", () => {
    const body = [
      "```markdown 7-structure.md",
      "slice one",
      "```",
      "prose between blocks",
      "```",
      "not part of the block",
      "```",
    ].join("\n");

    expect(extractSeed(body, "7-structure.md")).toBe("slice one");
  });

  test("handles a block with empty content", () => {
    const body = ["```markdown empty.md", "```"].join("\n");
    expect(extractSeed(body, "empty.md")).toBe("");
  });

  test("requires an exact label match (no prefix/suffix collision)", () => {
    const body = ["```markdown 2-questions.md.bak", "decoy", "```"].join("\n");
    expect(extractSeed(body, "2-questions.md")).toBeNull();
  });
});
