#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const STATUSES = new Set(["PASS", "FAIL", "UNKNOWN"]);

function checkMap(checks, label) {
  if (!Array.isArray(checks)) throw new TypeError(`${label} must be an array`);
  const result = new Map();
  for (const check of checks) {
    if (!check || typeof check.id !== "string" || !STATUSES.has(check.status)) {
      throw new TypeError(`${label} contains an invalid check`);
    }
    if (result.has(check.id)) throw new TypeError(`${label} repeats check ${check.id}`);
    result.set(check.id, check);
  }
  return result;
}
/** Compare command/test-level quality results without collapsing their identity. */
export function compareChecks(before, after) {
  const oldChecks = checkMap(before, "before");
  const newChecks = checkMap(after, "after");
  const ids = [...new Set([...oldChecks.keys(), ...newChecks.keys()])].sort();
  const rows = ids.map((id) => {
    const oldStatus = oldChecks.get(id)?.status ?? "UNKNOWN";
    const newStatus = newChecks.get(id)?.status ?? "UNKNOWN";
    let outcome = "unchanged";
    if (oldStatus === "PASS" && newStatus === "FAIL") outcome = "regression";
    else if (oldStatus === "FAIL" && newStatus === "PASS") outcome = "fixed";
    else if (oldStatus === "FAIL" && newStatus === "FAIL") outcome = "pre-existing-failure";
    else if (oldStatus === "UNKNOWN" || newStatus === "UNKNOWN") outcome = "unverified";
    return { id, before: oldStatus, after: newStatus, outcome };
  });
  return { blocksPublish: rows.some((row) => row.outcome === "regression"), rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [beforePath, afterPath] = process.argv.slice(2);
  if (!beforePath || !afterPath || process.argv.length !== 4) {
    process.stderr.write("usage: compare-checks.mjs <before.json> <after.json>\n");
    process.exit(2);
  }
  try {
    const result = compareChecks(
      JSON.parse(readFileSync(beforePath, "utf8")),
      JSON.parse(readFileSync(afterPath, "utf8")),
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.blocksPublish ? 1 : 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
