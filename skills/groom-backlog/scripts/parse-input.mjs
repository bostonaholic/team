#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const PROJECT_URL = /^https:\/\/github\.com\/(users|orgs)\/([A-Za-z0-9-]{1,39})\/projects\/([0-9]+)$/;
const DIGITS = /^[0-9]+$/;

function positiveInteger(raw, label) {
  const number = Number(raw);
  return Number.isSafeInteger(number) && number > 0
    ? { ok: true, value: number }
    : { ok: false, error: `${label} must be a positive integer` };
}

/** Parse the complete slash-command argument string without shell evaluation. */
export function parseInput(raw) {
  if (typeof raw !== "string") return { ok: false, error: "input must be text" };
  const tokens = raw.trim() ? raw.trim().split(/\s+/) : [];
  let project = null;
  let promote = null;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--promote") {
      const issue = tokens[index + 1];
      if (promote !== null) return { ok: false, error: "--promote may appear once" };
      if (!issue || !DIGITS.test(issue)) {
        return { ok: false, error: "--promote requires one numeric issue" };
      }
      const parsed = positiveInteger(issue, "--promote issue");
      if (!parsed.ok) return parsed;
      promote = parsed.value;
      index += 1;
      continue;
    }
    if (token.startsWith("--")) return { ok: false, error: `unknown option: ${token}` };
    if (project !== null) return { ok: false, error: "only one project may be selected" };
    if (DIGITS.test(token)) {
      const parsed = positiveInteger(token, "project number");
      if (!parsed.ok) return parsed;
      project = { number: parsed.value, owner: null, kind: null };
      continue;
    }
    const match = token.match(PROJECT_URL);
    if (!match) return { ok: false, error: `malformed project reference: ${token}` };
    const parsed = positiveInteger(match[3], "project number");
    if (!parsed.ok) return parsed;
    project = { number: parsed.value, owner: match[2], kind: match[1] };
  }

  return {
    ok: true,
    mode: promote === null ? "board" : "promotion",
    project,
    promote,
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
