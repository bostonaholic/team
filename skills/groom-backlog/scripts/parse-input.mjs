#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const PROJECT_URL = /^https:\/\/github\.com\/(users|orgs)\/([A-Za-z0-9-]{1,39})\/projects\/([0-9]+)$/;
const DIGITS = /^[0-9]+$/;

function projectFrom(token) {
  if (DIGITS.test(token)) {
    return { ok: true, value: { number: Number(token), owner: null, kind: null } };
  }
  const match = token.match(PROJECT_URL);
  if (!match) return { ok: false, error: `malformed project reference: ${token}` };
  return {
    ok: true,
    value: { number: Number(match[3]), owner: match[2], kind: match[1] },
  };
}

/** Parse the complete slash-command argument string without shell evaluation. */
export function parseInput(raw) {
  if (typeof raw !== "string") return { ok: false, error: "input must be text" };
  const tokens = raw.trim() ? raw.trim().split(/\s+/) : [];
  const mode = tokens.shift();
  if (mode !== "scan" && mode !== "promote") {
    return { ok: false, error: "first argument must be scan or promote" };
  }

  let promote = null;
  if (mode === "promote") {
    const issue = tokens.shift();
    if (!issue || !DIGITS.test(issue)) {
      return { ok: false, error: "promote requires one numeric issue" };
    }
    promote = Number(issue);
  }

  if (tokens.length > 1) return { ok: false, error: "too many arguments" };
  let project = null;
  if (tokens.length === 1) {
    const parsed = projectFrom(tokens[0]);
    if (!parsed.ok) return parsed;
    project = parsed.value;
  }

  return { ok: true, mode, project, promote };
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
