#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const PASSING = new Set(["addressed", "answered"]);
const VERDICTS = new Set([...PASSING, "pending", "rejected", null]);
const DIGITS = /^[0-9]+$/;
const PR_URL = /^https:\/\/github\.com\/([A-Za-z0-9._-]{1,39})\/([A-Za-z0-9._-]{1,100})\/pull\/([0-9]+)$/;
const SHA = /^[0-9a-f]{40}$/i;

function positiveInteger(raw) {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("PR number must be a positive integer");
  return value;
}

export function parseTarget(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value || /\s/.test(value)) {
    throw new Error("target must be one PR number or canonical URL");
  }
  if (DIGITS.test(value)) return { target: value, number: positiveInteger(value), repository: null };
  const match = value.match(PR_URL);
  if (!match) throw new Error("target must be one PR number or canonical URL");
  return { target: value, number: positiveInteger(match[3]), repository: `${match[1]}/${match[2]}` };
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

/** Bound one polling transition without interpreting review prose. */
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

  const failed = !input.fetchOk || !input.paginationComplete;
  const failures = failed ? input.consecutiveFailures + 1 : 0;
  if (failures === 3) return { action: "stop", reason: "poll-failures", failures, nextCycle: null };
  if (failed && input.cycle === 48) return { action: "stop", reason: "timeout", failures, nextCycle: null };
  if (failed) return { action: "retry", reason: "poll-failure", failures, nextCycle: input.cycle + 1 };
  if (input.state === "MERGED" || input.state === "CLOSED") {
    return { action: "stop", reason: input.state.toLowerCase(), failures, nextCycle: null };
  }
  if (input.state !== "OPEN") throw new TypeError("PR state must be OPEN, MERGED, or CLOSED");
  if (input.cycle === 48) return { action: "stop", reason: "timeout", failures, nextCycle: null };
  return { action: "continue", reason: null, failures, nextCycle: input.cycle + 1 };
}

/** Bound confirm/re-poll churn after one through three completed confirmations. */
export function evaluateConfirmation(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("confirmation input must be an object");
  }
  if (!Number.isInteger(input.round) || input.round < 1 || input.round > 3) {
    throw new TypeError("round must be an integer from 1 through 3");
  }
  if (typeof input.changed !== "boolean") throw new TypeError("changed must be boolean");
  if (!input.changed) return { action: "proceed", reason: null, nextRound: null };
  if (input.round === 3) return { action: "stop", reason: "confirmation-churn", nextRound: null };
  return { action: "confirm", reason: "new-value", nextRound: input.round + 1 };
}

/** Fail closed immediately before approval using the final live snapshot. */
export function requireApproval(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("approval input must be an object");
  }
  if (input.state !== "OPEN") throw new Error("approval requires an OPEN PR");
  if (!SHA.test(input.currentHeadOid ?? "") || !SHA.test(input.confirmedHeadOid ?? "")) {
    throw new Error("approval requires valid current and confirmed head OIDs");
  }
  if (input.currentHeadOid !== input.confirmedHeadOid) {
    throw new Error("current head does not match the confirmed head");
  }
  const gate = evaluateGate({ threads: input.threads, comments: input.comments });
  if (!gate.ready) throw new Error(gate.empty ? "approval requires a non-empty gate" : "approval gate is not ready");
  return { approved: true, headOid: input.currentHeadOid, total: gate.total };
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [mode, ...args] = process.argv.slice(2);
    if (mode === "target" && args.length === 0) output(parseTarget(readFileSync(0, "utf8")));
    else if (mode === "poll" && args.length === 0) output(evaluatePoll(JSON.parse(readFileSync(0, "utf8"))));
    else if (mode === "confirmation" && args.length === 0) output(evaluateConfirmation(JSON.parse(readFileSync(0, "utf8"))));
    else if (mode === "approval" && args.length === 0) output(requireApproval(JSON.parse(readFileSync(0, "utf8"))));
    else if (mode && args.length === 0) output(evaluateGate(JSON.parse(readFileSync(mode, "utf8"))));
    else throw new Error("usage: evaluate-gate.mjs target|poll|confirmation|approval < input.json | <snapshot.json>");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
