// test/helpers/session-runner.test.ts
//
// Unit tests for the pure helpers extracted from session-runner. These run
// under `bun test` with no env vars and no subprocess; they cost $0.

import { test, expect, describe } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  parseNDJSON,
  extractToolCallsAndUsage,
  computeTimings,
  runAgentTest,
} from "./session-runner";

describe("parseNDJSON", () => {
  test("parses one event per line", () => {
    const lines = [
      '{"type":"assistant","message":{"content":[]}}',
      '{"type":"result","usage":{"input_tokens":10}}',
    ];
    const { events, malformed } = parseNDJSON(lines);
    expect(events.length).toBe(2);
    expect(malformed).toBe(0);
  });

  test("skips empty lines without counting them as malformed", () => {
    const { events, malformed } = parseNDJSON(["", "  ", '{"type":"x"}']);
    expect(events.length).toBe(1);
    expect(malformed).toBe(0);
  });

  test("counts malformed lines but keeps going", () => {
    const lines = ['{"type":"ok"}', "this is not json", '{"type":"also-ok"}'];
    const { events, malformed } = parseNDJSON(lines);
    expect(events.length).toBe(2);
    expect(malformed).toBe(1);
  });
});

describe("extractToolCallsAndUsage", () => {
  test("collects tool_use items from assistant content", () => {
    const events = [
      {
        type: "assistant",
        message: {
          content: [
            { type: "tool_use", name: "Read", input: { file: "x.ts" } },
            { type: "text", text: "I will read x.ts." },
          ],
        },
      },
    ];
    const { toolCalls, finalOutput } = extractToolCallsAndUsage(events);
    expect(toolCalls.length).toBe(1);
    expect(toolCalls[0]?.tool).toBe("Read");
    expect(finalOutput).toContain("read x.ts");
  });

  test("attaches tool_result outputs to the most recent unresolved tool call", () => {
    const events = [
      {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "Bash", input: { cmd: "ls" } }],
        },
      },
      {
        type: "user",
        message: {
          content: [
            { type: "tool_result", tool_use_id: "abc", content: "a\nb\nc" },
          ],
        },
      },
    ];
    const { toolCalls } = extractToolCallsAndUsage(events);
    expect(toolCalls[0]?.output).toBe("a\nb\nc");
  });

  test("sums usage tokens across result events", () => {
    const events = [
      { type: "result", usage: { input_tokens: 100, output_tokens: 50 } },
      { type: "result", usage: { input_tokens: 200, output_tokens: 25 } },
    ];
    const { inputTokens, outputTokens } = extractToolCallsAndUsage(events);
    expect(inputTokens).toBe(300);
    expect(outputTokens).toBe(75);
  });

  test("handles malformed/missing fields without crashing", () => {
    const events = [
      null,
      "not an object",
      { type: "assistant" }, // missing message
      { type: "result" }, // missing usage
    ];
    const { toolCalls, inputTokens, outputTokens } =
      extractToolCallsAndUsage(events);
    expect(toolCalls.length).toBe(0);
    expect(inputTokens).toBe(0);
    expect(outputTokens).toBe(0);
  });
});

describe("computeTimings", () => {
  test("returns zeros for empty input", () => {
    const { firstResponseMs, maxInterTurnMs } = computeTimings([]);
    expect(firstResponseMs).toBe(0);
    expect(maxInterTurnMs).toBe(0);
  });

  test("firstResponseMs is the first timestamp", () => {
    const { firstResponseMs } = computeTimings([1500, 1800, 2400]);
    expect(firstResponseMs).toBe(1500);
  });

  test("maxInterTurnMs is the longest gap between consecutive timestamps", () => {
    const { maxInterTurnMs } = computeTimings([100, 300, 1500, 1600]);
    expect(maxInterTurnMs).toBe(1200);
  });
});

describe("runAgentTest with EVALS_MOCK_AGENT", () => {
  test("replays a mock NDJSON file without spawning claude", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "session-runner-test-"));
    const mockPath = join(tmp, "mock.ndjson");
    const events = [
      {
        type: "assistant",
        message: {
          content: [
            { type: "tool_use", name: "Read", input: { file: "x.ts" } },
            { type: "text", text: "Found a bug on line 42." },
          ],
        },
      },
      { type: "result", usage: { input_tokens: 50, output_tokens: 20 } },
    ];
    writeFileSync(
      mockPath,
      events.map((e) => JSON.stringify(e)).join("\n") + "\n",
      "utf8",
    );

    process.env.EVALS_MOCK_AGENT = mockPath;
    try {
      const result = await runAgentTest({
        prompt: "Review x.ts.",
        workingDirectory: tmp,
        testName: "mock-replay",
      });
      expect(result.exitReason).toBe("success");
      expect(result.toolCalls.length).toBe(1);
      expect(result.toolCalls[0]?.tool).toBe("Read");
      expect(result.output).toContain("bug on line 42");
      expect(result.costEstimate.inputTokens).toBe(50);
      expect(result.costEstimate.outputTokens).toBe(20);
      expect(result.costEstimate.estimatedCost).toBeGreaterThan(0);
    } finally {
      delete process.env.EVALS_MOCK_AGENT;
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
