// tests/helpers/session-runner.test.ts
//
// Unit tests for the pure helpers extracted from session-runner. These run
// under `bun test` with no env vars and no subprocess; they cost $0.

import { test, expect, describe } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  parseNDJSON,
  extractToolCallsAndUsage,
  computeTimings,
  runAgentTest,
  successfullyReadEveryPath,
} from "./session-runner";

const AGENT_WORKING_DIRECTORY = resolve("agent-work");

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

  test("attaches tool_result outputs to the tool call with the matching ID", () => {
    const events = [
      {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", id: "abc", name: "Bash", input: { cmd: "ls" } }],
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
    expect(toolCalls[0]?.isError).toBe(false);
  });

  test("failed Read results do not satisfy successful path coverage", () => {
    const events = [
      {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", id: "read-1", name: "Read", input: { file_path: "x.ts" } }],
        },
      },
      {
        type: "user",
        message: {
          content: [{
            type: "tool_result",
            tool_use_id: "read-1",
            is_error: true,
            content: "File does not exist.",
          }],
        },
      },
    ];
    const { toolCalls } = extractToolCallsAndUsage(events);

    expect(toolCalls[0]?.isError).toBe(true);
    expect(successfullyReadEveryPath(toolCalls, ["x.ts"], AGENT_WORKING_DIRECTORY)).toBe(false);
  });

  test("parallel tool results stay paired by ID when the required Read fails", () => {
    const events = [
      {
        type: "assistant",
        message: {
          content: [
            { type: "tool_use", id: "required", name: "Read", input: { file_path: "required.ts" } },
            { type: "tool_use", id: "other", name: "Read", input: { file_path: "other.ts" } },
          ],
        },
      },
      {
        type: "user",
        message: {
          content: [
            { type: "tool_result", tool_use_id: "required", is_error: true, content: "Read failed." },
            { type: "tool_result", tool_use_id: "other", content: "export const other = true;" },
          ],
        },
      },
    ];
    const { toolCalls } = extractToolCallsAndUsage(events);

    expect(toolCalls[0]?.isError).toBe(true);
    expect(toolCalls[1]?.isError).toBe(false);
    expect(successfullyReadEveryPath(toolCalls, ["required.ts"], AGENT_WORKING_DIRECTORY)).toBe(false);
  });

  test("Glob path text does not satisfy successful Read coverage", () => {
    const toolCalls = [{
      tool: "Glob",
      input: { pattern: "src/required.ts" },
      output: "src/required.ts",
      isError: false,
    }];

    expect(successfullyReadEveryPath(toolCalls, ["src/required.ts"], AGENT_WORKING_DIRECTORY)).toBe(false);
  });

  test("an exact successful Read satisfies path coverage", () => {
    const toolCalls = [{
      tool: "Read",
      input: { file_path: "src/required.ts" },
      output: "export const required = true;",
      isError: false,
    }];

    expect(successfullyReadEveryPath(toolCalls, ["src/required.ts"], AGENT_WORKING_DIRECTORY)).toBe(true);
  });

  test("Read paths containing the required path do not satisfy coverage", () => {
    const backupRead = [{
      tool: "Read",
      input: { file_path: "src/required.ts.backup" },
      output: "backup",
      isError: false,
    }];
    const prefixedRead = [{
      tool: "Read",
      input: { file_path: "archive/src/required.ts" },
      output: "archived",
      isError: false,
    }];

    expect(successfullyReadEveryPath(backupRead, ["src/required.ts"], AGENT_WORKING_DIRECTORY)).toBe(false);
    expect(successfullyReadEveryPath(prefixedRead, ["src/required.ts"], AGENT_WORKING_DIRECTORY)).toBe(false);
  });

  test("relative Reads resolve from the agent working directory without sibling matches", () => {
    const exactRead = [{
      tool: "Read",
      input: { file_path: "src/required.ts" },
      output: "export const required = true;",
      isError: false,
    }];
    const siblingRead = [{
      tool: "Read",
      input: { file_path: "../sibling/src/required.ts" },
      output: "sibling",
      isError: false,
    }];
    const backupRead = [{
      tool: "Read",
      input: { file_path: "src/required.ts.backup" },
      output: "backup",
      isError: false,
    }];
    const requiredPath = join(AGENT_WORKING_DIRECTORY, "src", "required.ts");

    expect(successfullyReadEveryPath(exactRead, [requiredPath], AGENT_WORKING_DIRECTORY)).toBe(true);
    expect(successfullyReadEveryPath(siblingRead, [requiredPath], AGENT_WORKING_DIRECTORY)).toBe(false);
    expect(successfullyReadEveryPath(backupRead, [requiredPath], AGENT_WORKING_DIRECTORY)).toBe(false);
  });

  test("range-limited Reads do not satisfy full-file coverage", () => {
    const oneLineRead = [{
      tool: "Read",
      input: { file_path: "src/required.ts", limit: 1 },
      output: "first line",
      isError: false,
    }];
    const offsetRead = [{
      tool: "Read",
      input: { file_path: "src/required.ts", offset: 2 },
      output: "later lines",
      isError: false,
    }];
    const completeRead = [{
      tool: "Read",
      input: { file_path: "src/required.ts" },
      output: "complete file",
      isError: false,
    }];

    expect(successfullyReadEveryPath(oneLineRead, ["src/required.ts"], AGENT_WORKING_DIRECTORY)).toBe(false);
    expect(successfullyReadEveryPath(offsetRead, ["src/required.ts"], AGENT_WORKING_DIRECTORY)).toBe(false);
    expect(successfullyReadEveryPath(completeRead, ["src/required.ts"], AGENT_WORKING_DIRECTORY)).toBe(true);
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

// The live path must fail fast when EVALS_ANTHROPIC_API_KEY is empty, unset,
// or whitespace-only: throw a named error BEFORE spawning `claude`, instead
// of spawning and failing at auth (or silently burning a logged-in session's
// tokens). The guard sits after the EVALS_MOCK_AGENT seam, so mock replay
// never needs a key.
describe("runAgentTest live-path API-key guard", () => {
  test("throws on empty API key at live path", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "session-runner-test-"));
    // Hermetic fake `claude` on PATH: if the guard is missing or misplaced,
    // runAgentTest spawns this stub — never the real CLI, no auth, no
    // tokens. The stub drains stdin (so the prompt write cannot EPIPE) and
    // drops a sentinel file proving a spawn happened.
    const fakeBin = join(tmp, "bin");
    mkdirSync(fakeBin);
    const sentinel = join(tmp, "spawned.sentinel");
    writeFileSync(
      join(fakeBin, "claude"),
      `#!/bin/sh\ncat > /dev/null\ntouch "${sentinel}"\nexit 0\n`,
      { mode: 0o755 },
    );

    const savedPath = process.env.PATH;
    const savedMock = process.env.EVALS_MOCK_AGENT;
    const savedKey = process.env.EVALS_ANTHROPIC_API_KEY;
    process.env.PATH = `${fakeBin}:${savedPath ?? ""}`;
    delete process.env.EVALS_MOCK_AGENT;
    delete process.env.EVALS_ANTHROPIC_API_KEY;
    try {
      await expect(
        runAgentTest({
          prompt: "Review x.ts.",
          workingDirectory: tmp,
          testName: "live-empty-key",
          // Watchdog bound only: the guard must reject before any spawn, so
          // this timer should never fire. It keeps a misbehaving stub from
          // hitting bun's own per-test timeout (which would error, not fail).
          timeout: 2_000,
        }),
      ).rejects.toThrow(/EVALS_ANTHROPIC_API_KEY is empty/);
      // "Never spawns": the guard fired before spawn, so the stub never ran.
      expect(existsSync(sentinel)).toBe(false);
    } finally {
      if (savedPath === undefined) delete process.env.PATH;
      else process.env.PATH = savedPath;
      if (savedMock !== undefined) process.env.EVALS_MOCK_AGENT = savedMock;
      if (savedKey !== undefined) process.env.EVALS_ANTHROPIC_API_KEY = savedKey;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("throws on whitespace-only API key at live path", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "session-runner-test-"));
    // Same hermetic fake `claude` sentinel pattern: a whitespace-only key is
    // as useless as an empty one, so the guard must reject it before any spawn.
    const fakeBin = join(tmp, "bin");
    mkdirSync(fakeBin);
    const sentinel = join(tmp, "spawned.sentinel");
    writeFileSync(
      join(fakeBin, "claude"),
      `#!/bin/sh\ncat > /dev/null\ntouch "${sentinel}"\nexit 0\n`,
      { mode: 0o755 },
    );

    const savedPath = process.env.PATH;
    const savedMock = process.env.EVALS_MOCK_AGENT;
    const savedKey = process.env.EVALS_ANTHROPIC_API_KEY;
    process.env.PATH = `${fakeBin}:${savedPath ?? ""}`;
    delete process.env.EVALS_MOCK_AGENT;
    process.env.EVALS_ANTHROPIC_API_KEY = "   ";
    try {
      await expect(
        runAgentTest({
          prompt: "Review x.ts.",
          workingDirectory: tmp,
          testName: "live-whitespace-key",
          // Watchdog bound only: the guard must reject before any spawn.
          timeout: 2_000,
        }),
      ).rejects.toThrow(/EVALS_ANTHROPIC_API_KEY is empty/);
      expect(existsSync(sentinel)).toBe(false);
    } finally {
      if (savedPath === undefined) delete process.env.PATH;
      else process.env.PATH = savedPath;
      if (savedMock !== undefined) process.env.EVALS_MOCK_AGENT = savedMock;
      if (savedKey === undefined) delete process.env.EVALS_ANTHROPIC_API_KEY;
      else process.env.EVALS_ANTHROPIC_API_KEY = savedKey;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("mock path unaffected by empty key", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "session-runner-test-"));
    const mockPath = join(tmp, "mock.ndjson");
    const events = [
      {
        type: "assistant",
        message: { content: [{ type: "text", text: "Mock replay ran." }] },
      },
      { type: "result", usage: { input_tokens: 5, output_tokens: 2 } },
    ];
    writeFileSync(
      mockPath,
      events.map((e) => JSON.stringify(e)).join("\n") + "\n",
      "utf8",
    );

    const savedMock = process.env.EVALS_MOCK_AGENT;
    const savedKey = process.env.EVALS_ANTHROPIC_API_KEY;
    process.env.EVALS_MOCK_AGENT = mockPath;
    delete process.env.EVALS_ANTHROPIC_API_KEY;
    try {
      const result = await runAgentTest({
        prompt: "Review x.ts.",
        workingDirectory: tmp,
        testName: "mock-empty-key",
      });
      // The guard sits AFTER the mock seam: local mock dev needs no key.
      expect(result.exitReason).toBe("success");
    } finally {
      if (savedMock === undefined) delete process.env.EVALS_MOCK_AGENT;
      else process.env.EVALS_MOCK_AGENT = savedMock;
      if (savedKey !== undefined) process.env.EVALS_ANTHROPIC_API_KEY = savedKey;
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// Environment skills (the CLI's built-in /review, …) can hijack the agent
// under test away from the fixture, so live spawns must disallow the Skill
// tool.
describe("runAgentTest live-spawn tool restrictions", () => {
  test("disallows the Skill tool so environment skills cannot hijack the run", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "session-runner-test-"));
    // Hermetic fake `claude` on PATH that records its argv; drains stdin so
    // the prompt write cannot EPIPE.
    const fakeBin = join(tmp, "bin");
    mkdirSync(fakeBin);
    const argvFile = join(tmp, "argv.txt");
    writeFileSync(
      join(fakeBin, "claude"),
      `#!/bin/sh\nprintf '%s\\n' "$@" > "${argvFile}"\ncat > /dev/null\nexit 0\n`,
      { mode: 0o755 },
    );

    const savedPath = process.env.PATH;
    const savedMock = process.env.EVALS_MOCK_AGENT;
    const savedKey = process.env.EVALS_ANTHROPIC_API_KEY;
    process.env.PATH = `${fakeBin}:${savedPath ?? ""}`;
    delete process.env.EVALS_MOCK_AGENT;
    process.env.EVALS_ANTHROPIC_API_KEY = "test-key";
    try {
      await runAgentTest({
        prompt: "Review x.ts.",
        workingDirectory: tmp,
        testName: "live-disallow-skill",
        timeout: 5_000,
      });
      const argv = readFileSync(argvFile, "utf8").split("\n");
      const flagIndex = argv.indexOf("--disallowed-tools");
      expect(flagIndex).toBeGreaterThan(-1);
      expect(argv[flagIndex + 1]).toBe("Skill");
    } finally {
      if (savedPath === undefined) delete process.env.PATH;
      else process.env.PATH = savedPath;
      if (savedMock !== undefined) process.env.EVALS_MOCK_AGENT = savedMock;
      if (savedKey === undefined) delete process.env.EVALS_ANTHROPIC_API_KEY;
      else process.env.EVALS_ANTHROPIC_API_KEY = savedKey;
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
