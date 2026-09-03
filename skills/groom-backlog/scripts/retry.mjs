#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function evaluateRetry(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("retry input must be an object");
  if (!Number.isInteger(input.attempt) || input.attempt < 1 || input.attempt > 3) {
    throw new Error("attempt must be an integer from 1 through 3");
  }
  if (typeof input.retryable !== "boolean") throw new Error("retryable must be boolean");
  if (!input.retryable) return { action: "stop", reason: "non-retryable", nextAttempt: null, delaySeconds: null };
  if (input.attempt === 3) return { action: "stop", reason: "retry-limit", nextAttempt: null, delaySeconds: null };
  return {
    action: "retry",
    reason: "transient",
    nextAttempt: input.attempt + 1,
    delaySeconds: input.attempt === 1 ? 2 : 4,
  };
}

function main() {
  try {
    if (process.argv.length !== 2) throw new Error("usage: retry.mjs < input.json");
    const result = evaluateRetry(JSON.parse(readFileSync(0, "utf8")));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`groom-retry: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
