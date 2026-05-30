/**
 * skill-harness.test.ts — exercise runSkillHarness in mock mode.
 *
 * Drives the harness against a real SKILL.md with EVALS_MOCK_AGENT pointed at
 * a tiny inline NDJSON transcript, then asserts the returned output equals the
 * concatenated assistant text. No tokens spent, no real spawn.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSkillHarness } from "./skill-harness.ts";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const SKILL_PATH = join(REPO_ROOT, "skills", "git-commit", "SKILL.md");

const tmpRoot = mkdtempSync(join(tmpdir(), "skill-harness-"));

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe("runSkillHarness (mock mode)", () => {
  test("returns the concatenated assistant text from the mock transcript", async () => {
    const events = [
      {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "First I read the diff. " },
            {
              type: "tool_use",
              name: "Bash",
              input: { command: "git diff --staged" },
            },
          ],
        },
      },
      {
        type: "assistant",
        message: {
          content: [{ type: "text", text: "Then I write the commit." }],
        },
      },
      { type: "result", usage: { input_tokens: 12, output_tokens: 7 } },
    ];
    const mockPath = join(tmpRoot, "transcript.ndjson");
    writeFileSync(mockPath, events.map((e) => JSON.stringify(e)).join("\n"));

    const prev = process.env.EVALS_MOCK_AGENT;
    process.env.EVALS_MOCK_AGENT = mockPath;
    try {
      const result = await runSkillHarness({
        skillPath: SKILL_PATH,
        task: "Commit the staged changes.",
        testName: "git-commit mock",
      });

      expect(result.exitReason).toBe("success");
      expect(result.output).toBe("First I read the diff. Then I write the commit.");
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]?.tool).toBe("Bash");
      expect(result.costEstimate.inputTokens).toBe(12);
      expect(result.costEstimate.outputTokens).toBe(7);
    } finally {
      if (prev === undefined) {
        delete process.env.EVALS_MOCK_AGENT;
      } else {
        process.env.EVALS_MOCK_AGENT = prev;
      }
    }
  });
});
