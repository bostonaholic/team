#!/usr/bin/env node

/**
 * Teamflow demo — writes fake QRSPI pipeline events to ~/.team/<topic>/events.jsonl
 * over ~90 seconds while the dashboard server streams them live.
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
const demoDir = join(teamDir, "demo");
const demo2Dir = join(teamDir, "demo-bugfix");
const eventsPath = join(demoDir, "events.jsonl");
const events2Path = join(demo2Dir, "events.jsonl");
const serverPath = join(__dirname, "..", "src", "server.ts");

// --- Event timeline (delay in ms from previous event) ---

const timeline = [
  { delay: 0,    event: "feature.requested",       producer: "router",            data: { topic: "add-sse-reconnection-exponential-backoff", description: "Add SSE reconnection with exponential backoff" } },
  { delay: 3000, event: "task.captured",            producer: "questioner",        data: { taskPath: "docs/plans/2026-04-20-sse-reconnect-task.md", questionsPath: "docs/plans/2026-04-20-sse-reconnect-questions.md", briefPath: "docs/plans/2026-04-20-sse-reconnect-brief.md", topic: "add-sse-reconnection-exponential-backoff" } },
  { delay: 3000, event: "files.found",              producer: "file-finder",       data: { files: ["src/sse.ts", "src/client/App.svelte"], count: 2 } },
  { delay: 4000, event: "research.completed",       producer: "researcher",        data: { openQuestions: 1 }, artifact: "docs/plans/2026-04-20-sse-reconnect-research.md" },
  { delay: 5000, event: "design.drafted",           producer: "design-author",     data: { designPath: "docs/plans/2026-04-20-sse-reconnect-design.md", openQuestionsResolved: 2 }, artifact: "docs/plans/2026-04-20-sse-reconnect-design.md" },
  { delay: 2000, event: "design.approved",          producer: "router",            data: {} },
  { delay: 4000, event: "structure.drafted",        producer: "structure-planner", data: { structurePath: "docs/plans/2026-04-20-sse-reconnect-structure.md", sliceCount: 3 }, artifact: "docs/plans/2026-04-20-sse-reconnect-structure.md" },
  { delay: 2000, event: "structure.approved",       producer: "router",            data: {} },
  { delay: 4000, event: "plan.drafted",             producer: "planner",           data: { slices: 3, testCases: 6 }, artifact: "docs/plans/2026-04-20-sse-reconnect-plan.md" },
  { delay: 1500, event: "worktree.prepared",        producer: "router",            data: { worktreePath: ".claude/worktrees/sse-reconnect", branch: "feat/sse-reconnect", isolation: "worktree" } },
  { delay: 4000, event: "tests.written",            producer: "test-architect",    data: { testFiles: ["src/__tests__/sse-reconnect.test.ts"], testCount: 6 } },
  { delay: 2000, event: "tests.confirmed-failing",  producer: "router",            data: { testFiles: ["src/__tests__/sse-reconnect.test.ts"], failCount: 6 } },
  { delay: 3000, event: "slice.completed",          producer: "implementer",       data: { slice: "Backoff utility with mock endpoint", commit: "abc1234" } },
  { delay: 3000, event: "slice.completed",          producer: "implementer",       data: { slice: "Wire backoff into SSE client", commit: "def5678" } },
  { delay: 3000, event: "slice.completed",          producer: "implementer",       data: { slice: "Connection-timeout handling end-to-end", commit: "1234abc" } },
  { delay: 2000, event: "implementation.completed", producer: "implementer",       data: { filesChanged: 3, testsPass: true } },
  { delay: 4000, event: "review.completed",         producer: "code-reviewer",     data: { verdict: "approve", findings: ["Clean implementation, good test coverage"] } },
  { delay: 1000, event: "docs-review.completed",    producer: "technical-writer",  data: { verdict: "approve", findings: ["No doc updates needed"] } },
  { delay: 2000, event: "security-review.completed", producer: "security-reviewer", data: { verdict: "approve", findings: ["No security concerns"] } },
  { delay: 2000, event: "ux-review.completed",       producer: "ux-reviewer",       data: { verdict: "approve", findings: ["SSE reconnect is transparent to user"] } },
  { delay: 2000, event: "verification.completed",    producer: "verifier",          data: { verdict: "fail", checks: ["format", "lint", "typecheck", "build", "test"] } },
  { delay: 2000, event: "hard-gate.lint-failed",     producer: "router",            data: { command: "npm run lint", exitCode: 1, errors: "Lint check failed on src/sse.ts", retryRound: 1, maxRetries: 5 } },
  { delay: 3000, event: "verification.completed",    producer: "verifier",          data: { verdict: "pass", checks: ["format", "lint", "typecheck", "build", "test"] } },
  { delay: 2000, event: "verification.passed",       producer: "router",            data: {} },
  { delay: 3000, event: "feature.shipped",           producer: "router",            data: { pr: "#42", branch: "feat/sse-reconnect" } },
];

// Second session: a shorter bug-fix pipeline that appears ~15s into the first
const SECOND_SESSION_DELAY = 15000;

const timeline2 = [
  { delay: 0,    event: "bug.reported",            producer: "router",         data: { topic: "fix-off-by-one-billing-calculation", description: "Fix off-by-one in billing calculation" } },
  { delay: 3000, event: "tests.confirmed-failing", producer: "router",         data: { testName: "billing_includes_last_day", failureReason: "expected 30 got 29" } },
  { delay: 5000, event: "implementation.completed", producer: "implementer",   data: { fixSummary: "Fix boundary condition in invoice total", filesChanged: 2 } },
  { delay: 2000, event: "verification.passed",      producer: "router",        data: {} },
  { delay: 2000, event: "feature.shipped",          producer: "router",        data: { pr: "#43", branch: "fix/billing-off-by-one" } },
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

function emit(path, label, seq, entry) {
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
  appendFileSync(path, line);
  console.log(`  [${label} seq ${String(seq).padStart(2)}] ${entry.event} (${entry.producer})`);
}

async function playTimeline(path, label, entries) {
  let seq = 0;
  for (const entry of entries) {
    if (entry.delay > 0) await sleep(entry.delay);
    seq++;
    emit(path, label, seq, entry);
  }
}

// --- Main ---

async function main() {
  const port = process.env.TEAMFLOW_PORT || "7425";

  // Clean slate
  mkdirSync(demoDir, { recursive: true });
  writeFileSync(eventsPath, "");
  // Second session dir created later when it "appears"

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
  console.log("  Session 1: SSE reconnection feature (full QRSPI)");
  console.log("  Session 2: billing bug fix (compressed, appears in ~15s)\n");

  // Play first session, and after SECOND_SESSION_DELAY start the second
  const session1 = playTimeline(eventsPath, "session-1", timeline);

  const session2 = sleep(SECOND_SESSION_DELAY).then(() => {
    console.log("\n  >>> Second session starting! <<<\n");
    mkdirSync(demo2Dir, { recursive: true });
    writeFileSync(events2Path, "");
    return playTimeline(events2Path, "session-2", timeline2);
  });

  await Promise.all([session1, session2]);

  console.log("\nBoth pipelines complete! Dashboard remains running. Press Ctrl+C to stop.\n");

  // Keep running until killed
  process.on("SIGINT", () => {
    if (server) server.kill();
    // Only clean up demo directories if we own the server
    if (server) {
      try {
        rmSync(demoDir, { recursive: true, force: true });
        rmSync(demo2Dir, { recursive: true, force: true });
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
