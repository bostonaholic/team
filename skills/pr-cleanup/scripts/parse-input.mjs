#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DIGITS = /^[0-9]+$/;
const PR_URL = /^https:\/\/github\.com\/([A-Za-z0-9._-]{1,39})\/([A-Za-z0-9._-]{1,100})\/pull\/([0-9]+)$/;

/** Parse an explicit cleanup mode and PR target without shell evaluation. */
export function parseInput(raw) {
  if (typeof raw !== "string") return { ok: false, error: "input must be text" };
  const tokens = raw.trim() ? raw.trim().split(/\s+/) : [];
  if (tokens.length !== 2) {
    return { ok: false, error: "usage: merged|abandon <pr-number-or-url>" };
  }
  const [mode, target] = tokens;
  if (mode !== "merged" && mode !== "abandon") {
    return { ok: false, error: "first argument must be merged or abandon" };
  }
  if (DIGITS.test(target)) {
    return { ok: true, mode, target, number: Number(target), repository: null };
  }
  const match = target.match(PR_URL);
  if (!match) return { ok: false, error: "target must be a PR number or canonical URL" };
  return {
    ok: true,
    mode,
    target,
    number: Number(match[3]),
    repository: `${match[1]}/${match[2]}`,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) {
    process.stderr.write("usage: parse-input.mjs < arguments.txt\n");
    process.exit(2);
  }
  const result = parseInput(readFileSync(0, "utf8"));
  if (!result.ok) {
    process.stderr.write(`${result.error}\n`);
    process.exit(2);
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
