#!/usr/bin/env node

/**
 * Teamflow demo — writes fake pipeline events to ~/.team/events.jsonl
 * over ~60 seconds while the dashboard server streams them live.
 *
 * Usage: node teamflow/bin/demo.mjs
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const teamDir = join(homedir(), ".team");
const eventsPath = join(teamDir, "events.jsonl");
const serverPath = join(__dirname, "..", "src", "server.ts");

// --- Event timeline (delay in ms from previous event) ---

const timeline = [
  { delay: 0,    event: "feature.requested",       producer: "orchestrator",     data: { topic: "Add SSE reconnection with exponential backoff" } },
  { delay: 3000, event: "files.found",              producer: "file-finder",      data: { files: ["src/sse.ts", "src/client/App.svelte"], count: 2 } },
  { delay: 5000, event: "research.completed",       producer: "researcher",       data: { openQuestions: 1 }, artifact: "docs/plans/2026-03-29-sse-reconnect-research.md" },
  { delay: 4000, event: "ambiguity.resolved",       producer: "product-owner",    data: { decisions: ["Use jittered exponential backoff with 30s ceiling"] } },
  { delay: 6000, event: "plan.drafted",             producer: "planner",          data: { steps: 5, testCases: 3 }, artifact: "docs/plans/2026-03-29-sse-reconnect-plan.md" },
  { delay: 4000, event: "plan.critiqued",           producer: "plan-critic",      data: { verdict: "approve", findings: ["Consider adding connection timeout"] } },
  { delay: 3000, event: "plan.approved",            producer: "orchestrator",     data: {} },
  { delay: 5000, event: "tests.written",            producer: "test-architect",   data: { testFiles: ["src/__tests__/sse-reconnect.test.ts"], testCount: 3 } },
  { delay: 3000, event: "tests.confirmed-failing",  producer: "orchestrator",     data: { testFiles: ["src/__tests__/sse-reconnect.test.ts"], failCount: 3 } },
  { delay: 4000, event: "step.completed",           producer: "implementer",      data: { step: "Add backoff utility function", totalTests: 3 } },
  { delay: 4000, event: "step.completed",           producer: "implementer",      data: { step: "Integrate backoff into SSE client", totalTests: 3 } },
  { delay: 4000, event: "step.completed",           producer: "implementer",      data: { step: "Add connection timeout handling", totalTests: 3 } },
  { delay: 2000, event: "hard-gate.failed",           producer: "verifier",         data: { findings: ["Lint check failed on src/sse.ts"], retryCount: 1, maxRetries: 3 } },
  { delay: 3000, event: "implementation.completed",  producer: "implementer",      data: { filesChanged: 3, testsPass: true } },
  { delay: 4000, event: "review.completed",          producer: "code-reviewer",    data: { verdict: "approve", findings: ["Clean implementation, good test coverage"] } },
  { delay: 1000, event: "docs-review.completed",     producer: "technical-writer", data: { verdict: "approve", findings: ["No doc updates needed"] } },
  { delay: 2000, event: "security-review.completed", producer: "security-reviewer", data: { verdict: "approve", findings: ["No security concerns"] } },
  { delay: 2000, event: "ux-review.completed",       producer: "ux-reviewer",      data: { verdict: "approve", findings: ["SSE reconnect is transparent to user"] } },
  { delay: 2000, event: "verification.completed",    producer: "verifier",         data: { verdict: "pass", checks: ["format", "lint", "typecheck", "build", "test"] } },
  { delay: 2000, event: "verification.passed",       producer: "orchestrator",     data: {} },
  { delay: 3000, event: "feature.shipped",           producer: "orchestrator",     data: { pr: "#42", branch: "feat/sse-reconnect" } },
];

// --- Helpers ---

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if a server is already listening by hitting /api/health.
 * Returns true if server responds 200, false on any error.
 */
async function checkHealth(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(1000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function emit(seq, entry) {
  const now = new Date().toISOString();
  const record = {
    seq,
    event: entry.event,
    producer: entry.producer,
    ts: now,
    data: entry.data || {},
  };
  if (entry.artifact) record.artifact = entry.artifact;

  const line = JSON.stringify(record) + "\n";
  appendFileSync(eventsPath, line);
  console.log(`  [seq ${String(seq).padStart(2)}] ${entry.event} (${entry.producer})`);
}

// --- Main ---

async function main() {
  const port = process.env.TEAMFLOW_PORT || "7425";

  // Clean slate
  mkdirSync(teamDir, { recursive: true });
  writeFileSync(eventsPath, "");

  console.log("Starting Teamflow dashboard...\n");

  // Check if a server is already running
  let server = null;
  const alreadyRunning = await checkHealth(port);

  if (alreadyRunning) {
    console.log("Server already running, skipping spawn.");
  } else {
    // Start server (use node --import tsx, matching package.json "start" script)
    server = spawn("node", ["--import", "tsx", serverPath], {
      stdio: "inherit",
      env: {
        ...process.env,
        TEAMFLOW_PORT: port,
        TEAMFLOW_NO_OPEN: "1",
      },
    });

    // Poll for server readiness (up to 5 seconds)
    let ready = false;
    for (let i = 0; i < 25; i++) {
      await sleep(200);
      if (await checkHealth(port)) {
        ready = true;
        break;
      }
    }

    if (!ready) {
      console.error("Error: server failed to become healthy within 5 seconds.");
      if (server) server.kill();
      process.exit(1);
    }
  }

  // Open browser
  const noOpen = process.env.TEAMFLOW_NO_OPEN === "1";
  if (!noOpen) {
    try {
      const { default: open } = await import("open");
      await open(`http://127.0.0.1:${port}`);
    } catch {
      // open is optional
    }
  }

  console.log("Playing pipeline events...\n");

  let seq = 0;
  for (const entry of timeline) {
    if (entry.delay > 0) await sleep(entry.delay);
    seq++;
    emit(seq, entry);
  }

  console.log("\nPipeline complete! Dashboard remains running. Press Ctrl+C to stop.\n");

  // Keep running until killed
  process.on("SIGINT", () => {
    if (server) server.kill();
    // Only clean up .team directory if we own the server
    if (server) {
      try {
        rmSync(teamDir, { recursive: true, force: true });
      } catch { /* ignore */ }
    }
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    if (server) server.kill();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
