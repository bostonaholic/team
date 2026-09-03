#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DIGITS = /^[0-9]+$/;
const PR_URL = /^https:\/\/github\.com\/([A-Za-z0-9._-]{1,39})\/([A-Za-z0-9._-]{1,100})\/pull\/([0-9]+)$/;
const PASSING = new Set(["addressed", "answered"]);
const VERDICTS = new Set([...PASSING, "pending", "rejected", null]);
const STATES = new Set(["OPEN", "MERGED", "CLOSED"]);
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

function positiveInteger(raw) {
  const number = Number(raw);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new Error("PR number must be a positive integer");
  }
  return number;
}

export function parseTarget(raw) {
  if (raw === "") return { target: null, number: null, repository: null };
  if (typeof raw !== "string" || raw.trim() !== raw || /\s/.test(raw)) {
    throw new Error("target must be empty, one PR number, or one canonical URL");
  }
  if (DIGITS.test(raw)) return { target: raw, number: positiveInteger(raw), repository: null };
  const match = raw.match(PR_URL);
  if (!match) throw new Error("target must be empty, one PR number, or one canonical URL");
  return { target: raw, number: positiveInteger(match[3]), repository: `${match[1]}/${match[2]}` };
}

function validate(items, shape) {
  if (!Array.isArray(items)) throw new TypeError(`${shape} must be an array`);
  const ids = new Set();
  for (const item of items) {
    if (!item || typeof item.id !== "string" || ids.has(item.id)) {
      throw new TypeError(`${shape} contains an invalid or repeated id`);
    }
    if (!VERDICTS.has(item.verdict ?? null)) throw new TypeError(`${shape} has an invalid verdict`);
    ids.add(item.id);
  }
}
/** Evaluate the reviewer gate from already-partitioned structural state. */
export function evaluateGate({ threads = [], comments = [] }) {
  validate(threads, "threads");
  validate(comments, "comments");
  const triggerPending = [
    ...threads.filter((item) => item.isResolved !== true).map((item) => item.id),
    ...comments.filter((item) => item.engaged !== true).map((item) => item.id),
  ];
  const verdictPending = [...threads, ...comments]
    .filter((item) => !PASSING.has(item.verdict))
    .map((item) => item.id);
  const total = threads.length + comments.length;
  return {
    total,
    threads: threads.length,
    comments: comments.length,
    empty: total === 0,
    triggerPending,
    verdictPending,
    ready: total > 0 && triggerPending.length === 0 && verdictPending.length === 0,
  };
}

export function evaluatePoll(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("poll input must be an object");
  }
  if (!Number.isInteger(input.cycle) || input.cycle < 0 || input.cycle > 48) {
    throw new TypeError("cycle must be an integer from 0 through 48");
  }
  if (!Number.isInteger(input.consecutiveFailures) || input.consecutiveFailures < 0 || input.consecutiveFailures > 2) {
    throw new TypeError("consecutiveFailures must be an integer from 0 through 2");
  }
  if (typeof input.fetchOk !== "boolean" || typeof input.paginationComplete !== "boolean") {
    throw new TypeError("fetchOk and paginationComplete must be boolean");
  }
  if (typeof input.gateReady !== "boolean") throw new TypeError("gateReady must be boolean");
  const failed = !input.fetchOk || !input.paginationComplete;
  const failures = failed ? input.consecutiveFailures + 1 : 0;
  if (failures === 3) return { action: "stop", reason: "poll-failures", failures, nextCycle: null, headRefOid: null };
  if (failed && input.cycle === 48) return { action: "stop", reason: "timeout", failures, nextCycle: null, headRefOid: null };
  if (failed) return { action: "retry", reason: "poll-failure", failures, nextCycle: input.cycle + 1, headRefOid: null };
  if (!STATES.has(input.state)) throw new TypeError("invalid PR state");
  if (typeof input.headRefOid !== "string" || !OID.test(input.headRefOid)) {
    throw new TypeError("invalid PR head OID");
  }
  if (input.state !== "OPEN") {
    return {
      action: "stop",
      reason: input.state.toLowerCase(),
      failures,
      nextCycle: null,
      headRefOid: input.headRefOid,
    };
  }
  if (input.gateReady) {
    return { action: "evaluate", reason: "gate-ready", failures, nextCycle: null, headRefOid: input.headRefOid };
  }
  if (input.cycle === 48) {
    return { action: "stop", reason: "timeout", failures, nextCycle: null, headRefOid: input.headRefOid };
  }
  return { action: "continue", reason: null, failures, nextCycle: input.cycle + 1, headRefOid: input.headRefOid };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [mode, ...args] = process.argv.slice(2);
    if (args.length > 0 || (mode !== "target" && mode !== "gate" && mode !== "poll")) {
      throw new Error("usage: evaluate-gate.mjs target|gate|poll < stdin");
    }
    const input = readFileSync(0, "utf8");
    const result = mode === "target"
      ? parseTarget(input)
      : mode === "gate" ? evaluateGate(JSON.parse(input)) : evaluatePoll(JSON.parse(input));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
