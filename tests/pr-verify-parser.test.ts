import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { extractPlan } from "../skills/pr-verify/scripts/extract-plan.mjs";

const SCRIPT = join(
  import.meta.dir,
  "..",
  "skills",
  "pr-verify",
  "scripts",
  "extract-plan.mjs",
);

describe("pr-verify test-plan extraction", () => {
  test("extracts checked, unchecked, and plain items from both supported sections", () => {
    const markdown = [
      "## Test plan",
      "- [x] Existing behavior passes",
      "- [ ] New behavior passes",
      "",
      "## How to Verify",
      "1. Inspect the generated artifact",
      "2) Confirm the final state",
    ].join("\n");
    expect(extractPlan(markdown)).toEqual({
      sections: ["Test plan", "How to Verify"],
      items: [
        { section: "Test plan", text: "Existing behavior passes", checked: true },
        { section: "Test plan", text: "New behavior passes", checked: false },
        { section: "How to Verify", text: "Inspect the generated artifact", checked: null },
        { section: "How to Verify", text: "Confirm the final state", checked: null },
      ],
    });
  });

  test("joins indented continuation text and ignores fenced examples", () => {
    const markdown = [
      "## Test plan",
      "- [ ] Verify the public contract",
      "  across all hosts",
      "",
      "```",
      "- [ ] fake item",
      "```",
    ].join("\n");
    expect(extractPlan(markdown).items).toEqual([
      {
        section: "Test plan",
        text: "Verify the public contract across all hosts",
        checked: false,
      },
    ]);
  });

  test("matches closing fences by marker and minimum opener length", () => {
    const markdown = [
      "## Test plan",
      "````markdown",
      "```",
      "- [ ] hidden behind a shorter fence",
      "~~~~",
      "- [ ] hidden behind a different marker",
      "````",
      "- [x] visible after the matching fence",
      "~~~text",
      "- [ ] hidden in a tilde fence",
      "~~~~",
      "- visible after a longer closing fence",
    ].join("\n");
    expect(extractPlan(markdown).items).toEqual([
      {
        section: "Test plan",
        text: "visible after the matching fence",
        checked: true,
      },
      {
        section: "Test plan",
        text: "visible after a longer closing fence",
        checked: null,
      },
    ]);
  });

  test("handles CR line endings and rejects Unicode-only closing whitespace", () => {
    const markdown = [
      "## Test plan",
      "```",
      "- [ ] hidden in fence",
      "```\u00a0",
      "- [ ] still hidden after NBSP suffix",
      "```",
      "- [x] visible after ASCII-valid closer",
    ].join("\r");

    expect(extractPlan(markdown).items).toEqual([
      {
        section: "Test plan",
        text: "visible after ASCII-valid closer",
        checked: true,
      },
    ]);
  });

  test("returns no items when neither recognized section exists", () => {
    expect(extractPlan("## Summary\n- Changed implementation\n")).toEqual({
      sections: [],
      items: [],
    });
  });

  test("CLI treats command-looking body text as inert stdin", async () => {
    const result = spawnSync("node", [SCRIPT], {
      input: "## Test plan\n- [ ] $(touch should-not-run)\n",
      encoding: "utf8",
      cwd: import.meta.dir,
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).items[0].text).toBe("$(touch should-not-run)");
    await expect(Bun.file(join(import.meta.dir, "should-not-run")).exists()).resolves.toBe(false);
  });
});
