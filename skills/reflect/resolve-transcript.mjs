#!/usr/bin/env node

/**
 * Resolve the invoking session's transcript by a marker that session printed,
 * and normalize it into a bounded record stream.
 *
 *     node "<skill-dir>/resolve-transcript.mjs" <run-cache-dir> [projects-root]
 *
 * The run cache's absolute path IS the marker: the run printed it, so the host
 * recorded it inline in this session's transcript and in no other file on disk.
 *
 * The pure halves (`resolveTranscript`, `normalizeTranscript`, `isUserTurn`)
 * are unit-tested at L1; the CLI below is what the skill body runs through
 * Bash. Importing this file has no side effects.
 *
 * `projectsRoot` is a parameter rather than a constant so the tests drive it
 * against synthetic fixtures; the CLI defaults it to `~/.claude/projects`.
 *
 * WHY TWO GLOBS, WIDE ONE INCLUDED. A session's records live under a slug
 * derived from the directory the session *started* in — and in a worktree that
 * is the parent repository's slug, not the worktree's. Both shapes therefore
 * exist on disk. Nothing a skill can read in-session reports the start
 * directory, so the narrow `<slug>` glob is a guess that usually misses and
 * the wide glob is the normal path. Only file NAMES come back either way, so
 * an unmatched session's content never reaches the caller. Both globs are top
 * level, which is what keeps `<session-uuid>/subagents/*.jsonl` and the
 * `<session-uuid>/tool-results/*.txt` sidecars out of reach by construction
 * rather than by a filter someone can drop.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Per-span byte cap applied before any lens sees a span. */
export const PER_SPAN_BYTE_CAP = 4000;

/** Aggregate record ceiling on the normalized stream, newest kept. */
export const MAX_RECORDS = 2000;

/** Aggregate byte ceiling on the normalized stream, newest kept. */
export const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

/** The two record types a lens may read. Every other type is dropped. */
const ALLOWED_TYPES = new Set(["user", "assistant"]);

/** Host injections that arrive as `type: "user"` but are not prompts. */
const INJECTION_TAGS = [
  "<local-command-caveat>",
  "<local-command-stdout>",
  "<task-notification>",
];

/** Argv chunk size for the fixed-string search — well inside ARG_MAX. */
const SEARCH_CHUNK = 200;

/** Retry delay before the second search, when the first found nothing. */
const DEFAULT_RETRY_DELAY_MS = 1000;

function sleepSync(milliseconds) {
  if (!(milliseconds > 0)) return;
  // A blocking sleep with no timer and no async hop, so the retry stays inside
  // one synchronous call the CLI can be reasoned about linearly.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/** Top-level `*.jsonl` files directly inside `directory`. */
function transcriptFiles(directory) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => !entry.isDirectory() && entry.name.endsWith(".jsonl"))
    .map((entry) => join(directory, entry.name))
    .sort();
}

/** Every transcript one directory level under `projectsRoot`, and no deeper. */
function allProjectTranscripts(projectsRoot) {
  let entries;
  try {
    entries = readdirSync(projectsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => transcriptFiles(join(projectsRoot, entry.name)));
}

/**
 * Files containing `marker` as a literal string. Fixed-string search, because
 * the marker is a filesystem path carrying `/`, `.`, `+`, and `[` — read as a
 * regex it would match strings that are not this run's marker and turn one
 * true match into an ambiguity failure.
 */
function filesContaining(files, marker) {
  const found = [];
  for (let index = 0; index < files.length; index += SEARCH_CHUNK) {
    const chunk = files.slice(index, index + SEARCH_CHUNK);
    const result = spawnSync("grep", ["-l", "-F", "-e", marker, "--", ...chunk], {
      encoding: "utf8",
      env: { ...process.env, LC_ALL: "C" },
    });
    // stdout is read whatever the status: grep exits non-zero both for "no
    // match" and for an unreadable file, and the wide glob crosses project
    // directories this user may not own. A readable match still counts.
    for (const line of (result.stdout ?? "").split("\n")) {
      if (line) found.push(line);
    }
  }
  return found;
}

/** Narrow glob first, then the wide one. Returns on the first non-empty hit. */
function searchOnce({ marker, projectsRoot, slug }) {
  const globs = [];
  if (slug) {
    globs.push(join(projectsRoot, slug, "*.jsonl"));
    const narrow = filesContaining(transcriptFiles(join(projectsRoot, slug)), marker);
    if (narrow.length > 0) return { matches: narrow, globs };
  }
  globs.push(join(projectsRoot, "*", "*.jsonl"));
  return { matches: filesContaining(allProjectTranscripts(projectsRoot), marker), globs };
}

/**
 * One resolved absolute transcript path, or a named failure — never a pick.
 * Two matches is an invariant violation: the marker is unique to this run, so
 * picking one would hand a stranger's session to the caller.
 */
export function resolveTranscript(options) {
  const { marker, projectsRoot, slug, retryDelayMs } = options ?? {};

  if (!projectsRoot || !existsSync(projectsRoot)) {
    return { ok: false, failure: "no-projects-root", tried: [String(projectsRoot)] };
  }

  let { matches, globs } = searchOnce({ marker, projectsRoot, slug });
  if (matches.length === 0) {
    // The marker reaches the transcript only once the host has flushed the
    // record that carries it, so one retry covers a write still in flight.
    sleepSync(retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);
    ({ matches, globs } = searchOnce({ marker, projectsRoot, slug }));
  }

  if (matches.length === 0) return { ok: false, failure: "no-match", tried: globs };
  if (matches.length > 1) return { ok: false, failure: "multiple-matches", tried: matches };
  return { ok: true, path: matches[0] };
}

/**
 * A tool call rendered as the evidence it is. A `tool_use` block carries `name`
 * and `input` and neither `text` nor `content`, so the shape-based reads below
 * would normalize it to the empty string — erasing the repeated invocation that
 * is the whole evidence the tooling lens looks for, while still spending a
 * record of the stream budget on a blank line.
 */
function toolUseText(block) {
  const name = typeof block.name === "string" ? block.name : "unknown";
  const input = typeof block.input === "string" ? block.input : jsonOrEmpty(block.input);
  return input ? `[tool_use ${name}] ${input}` : `[tool_use ${name}]`;
}

/** `input` as JSON, or "" for a value JSON cannot carry. */
function jsonOrEmpty(value) {
  if (value === undefined) return "";
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

/** The text of one content block, whatever shape the block takes. */
function blockText(block) {
  if (typeof block === "string") return block;
  if (block === null || typeof block !== "object") return "";
  if (typeof block.text === "string") return block.text;
  if (block.type === "tool_use") return toolUseText(block);
  if (typeof block.content === "string") return block.content;
  if (Array.isArray(block.content)) return block.content.map(blockText).join("\n");
  return "";
}

/** A record's span text: what a lens reads, before the per-span cap. */
function spanText(record) {
  const content = record?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(blockText).join("\n");
  return blockText(content);
}

/**
 * True only for a real user prompt. Most `type: "user"` records in a live
 * transcript are tool results, so "the last user message" is not a prompt
 * classifier: a prompt carries no `toolUseResult`, no host-injection tag, and
 * no `isMeta: true`.
 */
export function isUserTurn(record) {
  if (record === null || typeof record !== "object") return false;
  if (record.type !== "user") return false;
  if ("toolUseResult" in record) return false;
  if (record.isMeta === true) return false;
  const text = spanText(record);
  return !INJECTION_TAGS.some((tag) => text.includes(tag));
}

/**
 * Classify and bound a raw JSONL transcript. Everything a lens is allowed to
 * read comes back in `records`; every exclusion comes back as a count, because
 * a silent drop is indistinguishable from a parser that never saw the record.
 */
export function normalizeTranscript(jsonlText) {
  const droppedByType = {};
  let malformedLines = 0;
  let truncatedSpans = 0;
  const records = [];

  for (const line of String(jsonlText ?? "").split("\n")) {
    if (line.trim() === "") continue;

    let record;
    try {
      record = JSON.parse(line);
    } catch {
      malformedLines++;
      continue;
    }

    const type = typeof record?.type === "string" ? record.type : "unknown";
    if (!ALLOWED_TYPES.has(type)) {
      droppedByType[type] = (droppedByType[type] ?? 0) + 1;
      continue;
    }

    let text = spanText(record);
    if (text.length > PER_SPAN_BYTE_CAP) {
      text = text.slice(0, PER_SPAN_BYTE_CAP);
      truncatedSpans++;
    }

    records.push({ type, isUserTurn: isUserTurn(record), text });
  }

  return { ...boundStream(records), droppedByType, malformedLines, truncatedSpans };
}

/**
 * Keep the newest records that fit both ceilings. Newest, because the end of a
 * session is where its learnings are, and a bounded stream is the only reason
 * a tens-of-megabytes transcript can be read at all.
 */
function boundStream(records) {
  const kept = [];
  let total = 0;
  for (let index = records.length - 1; index >= 0; index--) {
    const record = records[index];
    if (kept.length >= MAX_RECORDS) break;
    if (total + record.text.length > MAX_TOTAL_BYTES) break;
    total += record.text.length;
    kept.push(record);
  }
  kept.reverse();
  return { records: kept, droppedForCeiling: records.length - kept.length };
}

// CLI entry point — runs only when executed directly, never on import, so a
// test import has no side effects (the supports-nesting.mjs shape).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runDir = process.argv[2] ?? "";
  const projectsRoot = process.argv[3] ?? join(homedir(), ".claude", "projects");
  const marker = runDir;

  if (!runDir) {
    process.stderr.write("usage: resolve-transcript.mjs <run-cache-dir> [projects-root]\n");
    process.exit(1);
  }

  // The slug of the directory this command runs in. It matches only when the
  // session also started here, so it is an optimization, never the mechanism.
  const slug = process.cwd().replace(/[/.]/g, "-");

  const resolved = resolveTranscript({ marker, projectsRoot, slug });
  if (!resolved.ok) {
    process.stderr.write(`${resolved.failure}\n`);
    for (const tried of resolved.tried ?? []) process.stderr.write(`  tried: ${tried}\n`);
    process.exit(1);
  }

  const raw = readFileSync(resolved.path, "utf8");
  const normalized = normalizeTranscript(raw);

  mkdirSync(runDir, { recursive: true });
  const outPath = join(runDir, "transcript.jsonl");
  writeFileSync(outPath, normalized.records.map((r) => JSON.stringify(r)).join("\n"), "utf8");

  process.stdout.write(`transcript: ${resolved.path}\n`);
  process.stdout.write(`bytes: ${raw.length}\n`);
  process.stdout.write(`normalized: ${outPath}\n`);
  process.stdout.write(`records: ${normalized.records.length}\n`);
  process.stdout.write(`user turns: ${normalized.records.filter((r) => r.isUserTurn).length}\n`);
  process.stdout.write(`dropped by type: ${JSON.stringify(normalized.droppedByType)}\n`);
  process.stdout.write(`dropped for ceiling: ${normalized.droppedForCeiling}\n`);
  process.stdout.write(`truncated spans: ${normalized.truncatedSpans}\n`);
  process.stdout.write(`malformed lines: ${normalized.malformedLines}\n`);
}
