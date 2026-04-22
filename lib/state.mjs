/**
 * State helper for the TEAM pipeline.
 *
 * Reads and writes ~/.team/<topic>/state.json as the single source of truth
 * for pipeline state. Stateless module: no module-level side effects, all
 * exports are pure functions that take inputs explicitly.
 *
 * Schema (10 fields):
 *   topic, today, beadsId, phase, startedAt, lastUpdated,
 *   designRevisionCount, structureRevisionCount, verificationRetryCount,
 *   currentSlice
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export const PHASE = Object.freeze({
  QUESTION: "QUESTION",
  RESEARCH: "RESEARCH",
  DESIGN: "DESIGN",
  STRUCTURE: "STRUCTURE",
  PLAN: "PLAN",
  WORKTREE: "WORKTREE",
  IMPLEMENT: "IMPLEMENT",
  PR: "PR",
  SHIPPED: "SHIPPED",
});

// Belt-and-suspenders runtime invariant matching the soft LLM constraint:
// router-derived topics are kebab-case; test-topics are allowed a leading
// underscore prefix. The pattern rejects any path-traversal attempt
// (slashes, dots, whitespace, backslashes) and keeps the filesystem write
// confined to ~/.team/<topic>/.
const TOPIC_PATTERN = /^[a-z0-9_][a-z0-9_-]*$/;

/** Path to the per-topic state snapshot. Rejects invalid topics. */
export function statePath(topic) {
  if (typeof topic !== "string" || !TOPIC_PATTERN.test(topic)) {
    throw new Error(
      `Invalid topic '${topic}'. Must match /^[a-z0-9_][a-z0-9_-]*$/.`,
    );
  }
  return join(homedir(), ".team", topic, "state.json");
}

/** Read the snapshot or null if missing/malformed. Never throws on ENOENT. */
export async function readState(topic) {
  try {
    const raw = await readFile(statePath(topic), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Shallow-merge `patch` over the current snapshot, refresh `lastUpdated`,
 * and write atomically (tmp file + rename).
 */
export async function writeState(topic, patch) {
  const current = (await readState(topic)) || {};
  const next = {
    ...current,
    ...patch,
    lastUpdated: new Date().toISOString(),
  };
  const target = statePath(topic);
  await mkdir(dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  await writeFile(tmp, JSON.stringify(next, null, 2));
  await rename(tmp, target);
  return next;
}

/**
 * Write a fresh snapshot with the 10-field initial schema. Overwrites any
 * existing file. Ensures ~/.team/<topic>/ exists first.
 */
export async function initState(topic, beadsId, today) {
  const now = new Date().toISOString();
  const initial = {
    topic,
    today,
    beadsId,
    phase: PHASE.QUESTION,
    startedAt: now,
    lastUpdated: now,
    designRevisionCount: 0,
    structureRevisionCount: 0,
    verificationRetryCount: 0,
    currentSlice: null,
  };
  const target = statePath(topic);
  await mkdir(dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  await writeFile(tmp, JSON.stringify(initial, null, 2));
  await rename(tmp, target);
  return initial;
}
