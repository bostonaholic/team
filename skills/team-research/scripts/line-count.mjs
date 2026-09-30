#!/usr/bin/env node

/**
 * Checks a file's physical line count against a limit.
 *
 *     node "<skill-dir>/scripts/line-count.mjs" <limit> <file>
 *
 * Normalizes CRLF and CR to LF, then counts every physical line, blank and
 * whitespace-only lines included. A final LF ends the last line; it does not
 * start a new one. Prints one JSON object. Exit 0: within the limit. 1: over
 * the limit. 2: bad arguments or an unreadable file, reported on stderr.
 */

import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function countLines(text) {
  const normalized = text.replace(/\r\n?/g, "\n");
  if (normalized === "") return 0;
  const breaks = normalized.split("\n").length - 1;
  return normalized.endsWith("\n") ? breaks : breaks + 1;
}

function main(argv) {
  const [limitArg, path, ...rest] = argv;
  const limit = Number(limitArg);
  if (!path || rest.length || !Number.isInteger(limit) || limit < 0) {
    process.stderr.write("line-count.mjs: usage: line-count.mjs <limit> <file>\n");
    return 2;
  }
  try {
    const lines = countLines(readFileSync(path, "utf8"));
    const pass = lines <= limit;
    process.stdout.write(`${JSON.stringify({ file: path, lines, limit, pass })}\n`);
    return pass ? 0 : 1;
  } catch (error) {
    process.stderr.write(`line-count.mjs: ${error.message}\n`);
    return 2;
  }
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
