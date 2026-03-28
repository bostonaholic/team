#!/usr/bin/env node

/**
 * Claude Code PreToolUse hook — blocks dangerous bash commands.
 *
 * Reads JSON from stdin with { tool_name, tool_input: { command } }.
 * Exits 0 to allow, exits 2 with JSON on stderr to block.
 * Fails open (exit 0) on any read/parse error so non-Bash calls pass through.
 */

const DANGEROUS_PATTERNS = [
  {
    pattern: /rm\s+(-\w*f\w*\s+)?-\w*r\w*\s+[/~]|rm\s+(-\w*r\w*\s+)?-\w*f\w*\s+[/~]/,
    reason: "Blocked: recursive forced deletion of root or home directory",
  },
  {
    pattern: /DROP\s+(TABLE|DATABASE)/i,
    reason: "Blocked: SQL DROP TABLE/DATABASE is destructive",
  },
  {
    pattern: /git\s+push\s+.*--force\s|git\s+push\s+.*-f\s|git\s+push\s+--force|git\s+push\s+-f/,
    reason: "Blocked: git push --force can rewrite shared history",
  },
  {
    pattern: /git\s+reset\s+--hard/,
    reason: "Blocked: git reset --hard discards uncommitted work",
  },
  {
    pattern: /chmod\s+777/,
    reason: "Blocked: chmod 777 sets overly permissive file permissions",
  },
  {
    pattern: /dd\s+.*of=\/dev\/(sd|nvme|disk)/,
    reason: "Blocked: dd writing to block device can destroy disk contents",
  },
  {
    pattern: /mkfs/,
    reason: "Blocked: mkfs formats a device and erases all data",
  },
  {
    pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    reason: "Blocked: fork bomb will exhaust system resources",
  },
];

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function block(reason) {
  const payload = JSON.stringify({ decision: "block", reason });
  process.stderr.write(payload);
  process.exit(2);
}

async function main() {
  let input;
  try {
    const raw = await readStdin();
    input = JSON.parse(raw);
  } catch {
    // Fail open — cannot parse stdin, let it through.
    process.exit(0);
  }

  const command = input?.tool_input?.command;
  if (typeof command !== "string") {
    // Not a Bash call or missing command — allow.
    process.exit(0);
  }

  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      block(reason);
    }
  }

  // No pattern matched — allow.
  process.exit(0);
}

main();
