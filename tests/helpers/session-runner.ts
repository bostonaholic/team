// tests/helpers/session-runner.ts
//
// Spawn `claude -p` as a subprocess, stream its NDJSON output, and return a
// structured SkillTestResult. Single point of CLI drift; everywhere else in
// the harness uses this module.
//
// Environment seams:
//   EVALS_MODEL           override the default model
//   EVALS_MOCK_AGENT      when set, read mock output from this path instead
//                         of spawning `claude` (offline testing / CI gate)
//   EVALS_CASE_NAME       set per-case; consumed by mock scripts that
//                         conditionally produce output

import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type ExitReason = "success" | "timeout" | `exit_code_${number}`;

export interface ToolCall {
  tool: string;
  input: unknown;
  output: string;
}

export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

export interface SkillTestResult {
  toolCalls: ToolCall[];
  exitReason: ExitReason;
  duration: number;
  output: string;
  costEstimate: CostEstimate;
  transcript: unknown[];
  model: string;
  firstResponseMs: number;
  maxInterTurnMs: number;
}

export interface RunAgentTestOptions {
  prompt: string;
  workingDirectory: string;
  maxTurns?: number;
  allowedTools?: string[];
  timeout?: number;
  testName?: string;
  model?: string;
}

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_TIMEOUT_MS = 120_000;

// Rough public-pricing per million tokens (USD). Override at the call site
// if you need stricter accounting; these are good-enough for relative deltas.
const PRICING_PER_MILLION: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-4-7": { input: 3, output: 15 },
  "claude-opus-4-7": { input: 15, output: 75 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
};

function pricingFor(model: string): { input: number; output: number } {
  return PRICING_PER_MILLION[model] ?? { input: 3, output: 15 };
}

// ---------------------------------------------------------------------------
// parseNDJSON — pure helper, extracted so it can be unit-tested without
// needing a subprocess.
// ---------------------------------------------------------------------------

export interface ParsedNDJSON {
  events: unknown[];
  malformed: number;
}

export function parseNDJSON(lines: string[]): ParsedNDJSON {
  const events: unknown[] = [];
  let malformed = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      malformed += 1;
    }
  }
  return { events, malformed };
}

// ---------------------------------------------------------------------------
// extractToolCallsAndUsage — walks an event stream and produces the
// derived data the runner needs. Pure; unit-testable.
// ---------------------------------------------------------------------------

interface DerivedFromEvents {
  toolCalls: ToolCall[];
  inputTokens: number;
  outputTokens: number;
  finalOutput: string;
}

export function extractToolCallsAndUsage(events: unknown[]): DerivedFromEvents {
  const toolCalls: ToolCall[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let finalOutput = "";

  for (const event of events) {
    if (typeof event !== "object" || event === null) continue;
    const ev = event as Record<string, unknown>;

    if (ev.type === "assistant" && typeof ev.message === "object" && ev.message !== null) {
      const message = ev.message as Record<string, unknown>;
      const content = message.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (typeof item !== "object" || item === null) continue;
          const it = item as Record<string, unknown>;
          if (it.type === "tool_use" && typeof it.name === "string") {
            toolCalls.push({
              tool: it.name,
              input: it.input ?? {},
              output: "",
            });
          } else if (it.type === "text" && typeof it.text === "string") {
            finalOutput += it.text;
          }
        }
      }
    }

    if (ev.type === "result" && typeof ev.usage === "object" && ev.usage !== null) {
      const usage = ev.usage as Record<string, unknown>;
      if (typeof usage.input_tokens === "number") inputTokens += usage.input_tokens;
      if (typeof usage.output_tokens === "number") outputTokens += usage.output_tokens;
    }

    // tool_result events carry the tool's output; pair with the most recent
    // tool_use that hasn't been resolved.
    if (ev.type === "user" && typeof ev.message === "object" && ev.message !== null) {
      const message = ev.message as Record<string, unknown>;
      const content = message.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (typeof item !== "object" || item === null) continue;
          const it = item as Record<string, unknown>;
          if (it.type === "tool_result" && typeof it.tool_use_id === "string") {
            const output = typeof it.content === "string"
              ? it.content
              : JSON.stringify(it.content ?? "");
            // Attach to the last tool call that hasn't been resolved.
            for (let i = toolCalls.length - 1; i >= 0; i--) {
              const tc = toolCalls[i];
              if (tc && tc.output === "") {
                tc.output = output;
                break;
              }
            }
          }
        }
      }
    }
  }

  return { toolCalls, inputTokens, outputTokens, finalOutput };
}

// ---------------------------------------------------------------------------
// computeTimings — given a sequence of event timestamps (ms from spawn),
// derive firstResponseMs and maxInterTurnMs. Pure helper.
// ---------------------------------------------------------------------------

export interface Timings {
  firstResponseMs: number;
  maxInterTurnMs: number;
}

export function computeTimings(turnTimestampsMs: number[]): Timings {
  if (turnTimestampsMs.length === 0) {
    return { firstResponseMs: 0, maxInterTurnMs: 0 };
  }
  const firstResponseMs = turnTimestampsMs[0] ?? 0;
  let maxInterTurnMs = 0;
  for (let i = 1; i < turnTimestampsMs.length; i++) {
    const prev = turnTimestampsMs[i - 1];
    const cur = turnTimestampsMs[i];
    if (prev === undefined || cur === undefined) continue;
    const gap = cur - prev;
    if (gap > maxInterTurnMs) maxInterTurnMs = gap;
  }
  return { firstResponseMs, maxInterTurnMs };
}

// ---------------------------------------------------------------------------
// runAgentTest — the actual subprocess driver.
// ---------------------------------------------------------------------------

function readMockOutput(path: string): string {
  return readFileSync(path, "utf8");
}

async function consumeStream(
  child: ChildProcess,
  startTimeMs: number,
  onLine: (line: string, atMs: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    if (!child.stdout) {
      resolve();
      return;
    }
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      const nowMs = Date.now() - startTimeMs;
      for (const line of lines) {
        if (line.length > 0) onLine(line, nowMs);
      }
    });
    child.stdout.on("end", () => {
      buffer += decoder.decode();
      if (buffer.length > 0) {
        const nowMs = Date.now() - startTimeMs;
        onLine(buffer, nowMs);
      }
      resolve();
    });
    child.stdout.on("error", reject);
  });
}

export async function runAgentTest(
  options: RunAgentTestOptions,
): Promise<SkillTestResult> {
  const model = options.model ?? process.env.EVALS_MODEL ?? DEFAULT_MODEL;
  const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;

  const tmpDir = mkdtempSync(join(tmpdir(), "evals-prompt-"));
  const promptPath = join(tmpDir, "prompt.txt");
  writeFileSync(promptPath, options.prompt, "utf8");

  try {
    const startMs = Date.now();

    // Mock seam: return a fabricated result without spawning the CLI.
    const mockPath = process.env.EVALS_MOCK_AGENT;
    if (mockPath !== undefined && mockPath !== "") {
      return runMocked(mockPath, model, startMs);
    }

    // Live-path guard: fail fast and loud rather than spawning `claude` with
    // no credential and failing at auth (or silently burning a logged-in
    // session). Sits AFTER the mock seam, so mock replay never needs a key.
    const apiKey = process.env.EVALS_ANTHROPIC_API_KEY;
    if (apiKey === undefined || apiKey === "") {
      throw new Error(
        "EVALS_ANTHROPIC_API_KEY is empty; refusing live spawn " +
          "(set it to a valid Anthropic API key, or set EVALS_MOCK_AGENT to replay a fixture)",
      );
    }

    const args: string[] = [
      "-p",
      "--model",
      model,
      "--output-format",
      "stream-json",
      "--verbose",
    ];
    if (options.maxTurns !== undefined) {
      args.push("--max-turns", String(options.maxTurns));
    }
    if (options.allowedTools && options.allowedTools.length > 0) {
      args.push("--allowed-tools", ...options.allowedTools);
    }

    const child = spawn("claude", args, {
      cwd: options.workingDirectory,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Pipe the prompt via stdin.
    if (child.stdin) {
      child.stdin.write(readFileSync(promptPath));
      child.stdin.end();
    }

    const lines: string[] = [];
    const turnTimestamps: number[] = [];

    let timedOut = false;
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    const streamPromise = consumeStream(child, startMs, (line, atMs) => {
      lines.push(line);
      // Track timing on lines that look like assistant turns.
      try {
        const ev = JSON.parse(line);
        if (typeof ev === "object" && ev !== null && (ev as { type?: unknown }).type === "assistant") {
          turnTimestamps.push(atMs);
        }
      } catch {
        // ignore parse errors here; parseNDJSON handles them below
      }
    });

    const exitCode: number | null = await new Promise((resolve) => {
      child.on("close", (code) => resolve(code));
    });
    await streamPromise;
    clearTimeout(timeoutTimer);

    const duration = Date.now() - startMs;
    const { events } = parseNDJSON(lines);
    const { toolCalls, inputTokens, outputTokens, finalOutput } =
      extractToolCallsAndUsage(events);
    const { firstResponseMs, maxInterTurnMs } = computeTimings(turnTimestamps);

    const pricing = pricingFor(model);
    const estimatedCost =
      (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;

    let exitReason: ExitReason;
    if (timedOut) exitReason = "timeout";
    else if (exitCode === 0) exitReason = "success";
    else exitReason = `exit_code_${exitCode ?? -1}`;

    return {
      toolCalls,
      exitReason,
      duration,
      output: finalOutput,
      costEstimate: { inputTokens, outputTokens, estimatedCost },
      transcript: events,
      model,
      firstResponseMs,
      maxInterTurnMs,
    };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function runMocked(
  mockPath: string,
  model: string,
  startMs: number,
): SkillTestResult {
  // A mock file is NDJSON: each line is one event. Replay it.
  const text = readMockOutput(mockPath);
  const lines = text.split("\n").filter((l) => l.length > 0);
  const { events } = parseNDJSON(lines);
  const { toolCalls, inputTokens, outputTokens, finalOutput } =
    extractToolCallsAndUsage(events);
  // No real timing under mocks; report zeros for the timing fields.
  const duration = Date.now() - startMs;
  const pricing = pricingFor(model);
  const estimatedCost =
    (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
  return {
    toolCalls,
    exitReason: "success",
    duration,
    output: finalOutput,
    costEstimate: { inputTokens, outputTokens, estimatedCost },
    transcript: events,
    model,
    firstResponseMs: 0,
    maxInterTurnMs: 0,
  };
}
