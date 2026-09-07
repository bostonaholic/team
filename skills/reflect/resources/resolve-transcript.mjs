#!/usr/bin/env node

/**
 * Resolve the invoking session's transcript on whichever host is running, and
 * normalize it into one bounded record stream.
 *
 *     node "<skill-dir>/resolve-transcript.mjs" <run-cache-dir> [store-root]
 *
 * TWO HOSTS, ONE CONTRACT. Claude Code and Codex CLI each keep their own
 * session store in their own record format. Everything downstream — the lenses,
 * the plan, the report — reads the single normalized shape this file emits, so
 * a host is added here and nowhere else.
 *
 * CONDUCTOR IS NOT A HOST HERE. Conductor runs Claude Code, Codex, Cursor
 * Agent, or OpenCode inside a git worktree; the backend agent writes the
 * transcript in its own store, unchanged. So a Conductor session resolves as
 * whichever backend it runs, and the two backends this file cannot read fail by
 * name rather than resolving to something plausible.
 *
 * HOW THE SESSION IS IDENTIFIED, IN ORDER.
 *
 *  1. The id the host itself exported into this process (`CLAUDE_CODE_SESSION_ID`,
 *     `CODEX_THREAD_ID`). It names the transcript file directly, so resolution is
 *     a lookup rather than a search, and the file's own header is re-read to
 *     confirm the match.
 *  2. Failing that, the run cache's absolute path as a marker: the run printed
 *     it, so the host recorded it inline in this session's records and in no
 *     other file on disk. Only file NAMES come back from that search, so an
 *     unmatched session's content never reaches the caller.
 *
 * Neither path ever picks among candidates, guesses from the working directory,
 * or takes the newest file. Two matches is a named failure.
 *
 * The pure halves (`detectHost`, `resolveTranscript`, `normalizeTranscript`,
 * `isUserTurn`) are unit-tested at L1; the CLI below is what the skill body runs
 * through Bash. Importing this file has no side effects.
 *
 * `storeRoot` is a parameter rather than a constant so the tests drive it
 * against synthetic fixtures; the CLI derives it from the detected host.
 */

import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

/** Per-span byte cap applied before any lens sees a span. */
export const PER_SPAN_BYTE_CAP = 4000;

/** Aggregate record ceiling on the normalized stream, newest kept. */
export const MAX_RECORDS = 2000;

/** Aggregate byte ceiling on the normalized stream, newest kept. */
export const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

/**
 * The hosts whose stores this file can read, and the shape of each store.
 *
 * `depth` is the number of directory levels between the store root and a
 * transcript, and it is exact. Claude Code keeps `<project-slug>/<id>.jsonl`;
 * Codex keeps `<YYYY>/<MM>/<DD>/rollout-<timestamp>-<thread-id>.jsonl`. Walking
 * to exactly that depth is what keeps a session's `subagents/*.jsonl` and its
 * `tool-results/*.txt` sidecars out of reach by construction rather than by a
 * filter someone can drop.
 */
export const HOSTS = {
  "claude-code": { depth: 1, suffixed: false },
  codex: { depth: 3, suffixed: true },
};

/** Host injections that arrive as a Claude `type: "user"` record but are not prompts. */
const CLAUDE_INJECTION_TAGS = [
  "<local-command-caveat>",
  "<local-command-stdout>",
  "<task-notification>",
];

/**
 * Codex injections, which arrive as `role: "user"` messages. Each is a whole
 * injected block that opens its span, so these are matched as prefixes: a user
 * who merely mentions one mid-prompt still counts as a user turn.
 */
const CODEX_INJECTION_PREFIXES = [
  "<recommended_plugins>",
  "<system_instruction>",
  "<environment_context>",
  "# AGENTS.md instructions for ",
];

/** Codex message roles that carry host and project instructions, never a turn. */
const CODEX_DROPPED_ROLES = new Set(["developer", "system"]);

/** The two Claude record types a lens may read. Every other type is dropped. */
const CLAUDE_ALLOWED_TYPES = new Set(["user", "assistant"]);

/** Argv chunk size for the fixed-string search — well inside ARG_MAX. */
const SEARCH_CHUNK = 200;

/** Retry delay before the second search, when the first found nothing. */
const DEFAULT_RETRY_DELAY_MS = 1000;

/** Bytes of a transcript read to confirm its header names the expected session. */
const HEADER_PROBE_BYTES = 64 * 1024;

/** A session id is used in path comparisons only, never in a command. */
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;

function sleepSync(milliseconds) {
  if (!(milliseconds > 0)) return;
  // A blocking sleep with no timer and no async hop, so the retry stays inside
  // one synchronous call the CLI can be reasoned about linearly.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

// ---------------------------------------------------------------------------
// Host detection
// ---------------------------------------------------------------------------

/**
 * Every host that might hold this session, and the id it exported for each.
 *
 * Detection reads the agents' own variables, never Conductor's: a Conductor
 * workspace sets `CONDUCTOR_*` whichever backend it launched, so those say
 * nothing about where the transcript is.
 *
 * Two candidates is a real state, not a bug: one agent launched from the
 * other's shell inherits its variables, so a Codex process started by Claude
 * Code carries `CLAUDE_CODE_SESSION_ID` as well as its own. Precedence would
 * be a guess there, so `resolveSession` breaks the tie on evidence instead.
 */
export function detectHost(env) {
  const environment = env ?? {};
  const codexId = environment.CODEX_THREAD_ID || environment.CODEX_SESSION_ID || "";
  const claudeId = environment.CLAUDE_CODE_SESSION_ID || "";
  const codex = Boolean(codexId);
  const claude = Boolean(claudeId) || environment.CLAUDECODE === "1";

  const candidates = [];
  // CODEX_THREAD_ID names this thread's own rollout. CODEX_SESSION_ID names the
  // root thread, which is the same file for the top-level session a user invokes
  // reflect from; the header check below rejects it when it is not.
  if (codex) candidates.push({ host: "codex", sessionId: codexId });
  if (claude) candidates.push({ host: "claude-code", sessionId: claudeId || null });
  return candidates;
}

/** The session store `host` keeps, honoring the host's own root override. */
export function storeRootFor(host, env) {
  const environment = env ?? {};
  const home = environment.HOME || homedir();
  if (host === "codex") return join(environment.CODEX_HOME || join(home, ".codex"), "sessions");
  if (host === "claude-code") return join(environment.CLAUDE_CONFIG_DIR || join(home, ".claude"), "projects");
  return "";
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** Directory entries of `directory`, or [] when it cannot be read. */
function entriesOf(directory) {
  try {
    return readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Every `*.jsonl` exactly `depth` directory levels under `root`, and no deeper. */
function transcriptsUnder(root, depth) {
  if (depth === 0) {
    return entriesOf(root)
      .filter((entry) => !entry.isDirectory() && entry.name.endsWith(".jsonl"))
      .map((entry) => join(root, entry.name))
      .sort();
  }
  return entriesOf(root)
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => transcriptsUnder(join(root, entry.name), depth - 1));
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
    // match" and for an unreadable file, and the search crosses directories
    // this user may not own. A readable match still counts.
    for (const line of (result.stdout ?? "").split("\n")) {
      if (line) found.push(line);
    }
  }
  return found;
}

/** The transcript `host` would name `sessionId`, as a filename test. */
function namesSession(host, file, sessionId) {
  const name = basename(file);
  return HOSTS[host]?.suffixed ? name.endsWith(`-${sessionId}.jsonl`) : name === `${sessionId}.jsonl`;
}

/** The first `HEADER_PROBE_BYTES` of a file, without reading a huge transcript whole. */
function readHead(path) {
  let fd;
  try {
    fd = openSync(path, "r");
    const buffer = Buffer.allocUnsafe(HEADER_PROBE_BYTES);
    const read = readSync(fd, buffer, 0, HEADER_PROBE_BYTES, 0);
    return buffer.subarray(0, read).toString("utf8");
  } catch {
    return "";
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * The session id a transcript's own header declares, or null when it declares
 * none. Claude Code stamps every record with `sessionId`; Codex opens a rollout
 * with a `session_meta` whose `payload.id` is the thread the file belongs to.
 */
export function declaredSessionId(headText) {
  for (const line of String(headText ?? "").split("\n")) {
    if (line.trim() === "") continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      // A truncated final line is expected — the probe cuts at a byte offset.
      continue;
    }
    if (record?.type === "session_meta" && typeof record?.payload?.id === "string") return record.payload.id;
    if (typeof record?.sessionId === "string") return record.sessionId;
  }
  return null;
}

/**
 * Candidates whose own header agrees they are `sessionId`, dropping any that
 * disagree. Only files the host's own naming already points at are opened, and
 * only the declared id leaves this function — no span of any transcript, matched
 * or not, reaches the caller.
 */
function confirmed(candidates, sessionId) {
  return candidates.filter((path) => {
    const declared = declaredSessionId(readHead(path));
    // A store that stamps no id in its header cannot contradict the filename,
    // which the host derived from the id in the first place.
    return declared === null || declared === sessionId;
  });
}

/** Narrow glob first for Claude Code, then the whole store. Returns the first non-empty hit. */
function searchByMarker({ host, storeRoot, marker, slug }) {
  const { depth } = HOSTS[host];
  const tried = [];
  if (host === "claude-code" && slug) {
    tried.push(join(storeRoot, slug, "*.jsonl"));
    const narrow = filesContaining(transcriptsUnder(join(storeRoot, slug), 0), marker);
    if (narrow.length > 0) return { matches: narrow, tried };
  }
  tried.push(join(storeRoot, ...Array.from({ length: depth }, () => "*"), "*.jsonl"));
  return { matches: filesContaining(transcriptsUnder(storeRoot, depth), marker), tried };
}

/** Candidates the session id names, and the pattern tried when it names none. */
function searchBySessionId({ host, storeRoot, sessionId }) {
  const { depth, suffixed } = HOSTS[host];
  const levels = Array.from({ length: depth }, () => "*");
  const leaf = suffixed ? `*-${sessionId}.jsonl` : `${sessionId}.jsonl`;
  const candidates = transcriptsUnder(storeRoot, depth).filter((file) => namesSession(host, file, sessionId));
  return { matches: confirmed(candidates, sessionId), tried: [join(storeRoot, ...levels, leaf)] };
}

/**
 * One resolved absolute transcript path, or a named failure — never a pick.
 * Two matches is an invariant violation: both the session id and the marker are
 * unique to this run, so picking one would hand a stranger's session to the caller.
 */
export function resolveTranscript(options) {
  const { host, sessionId, storeRoot, marker, slug, retryDelayMs } = options ?? {};

  if (!host || !Object.hasOwn(HOSTS, host)) {
    return { ok: false, failure: "unsupported-host", tried: [String(host ?? "none")] };
  }
  // Empty is absent, not invalid: one truthiness rule decides both this guard
  // and the id-versus-marker branch below, so they cannot disagree.
  if (sessionId && !SESSION_ID_PATTERN.test(String(sessionId))) {
    return { ok: false, failure: "invalid-session-id", tried: [String(sessionId)] };
  }
  if (!storeRoot || !existsSync(storeRoot)) {
    return { ok: false, failure: "no-session-store", tried: [String(storeRoot)] };
  }

  // No id and no marker leaves nothing to identify this session with. An empty
  // marker would reach `grep -F -e ""`, which matches every file in the store.
  if (!sessionId && !marker) {
    return { ok: false, failure: "no-match", tried: ["no session id and no marker"], host };
  }

  // The id the host exported wins outright. A host that named this session and
  // then has no file for it is a real failure, not a cue to go guessing by
  // marker: falling back there would search on behalf of an id already known to
  // be authoritative, and could resolve some other session that mentions the path.
  const via = sessionId ? "session-id" : "marker";
  const search = () =>
    sessionId
      ? searchBySessionId({ host, storeRoot, sessionId })
      : searchByMarker({ host, storeRoot, marker, slug });

  let { matches, tried } = search();
  if (matches.length === 0) {
    // The record carrying either signal reaches disk only once the host has
    // flushed it, so one retry covers a write still in flight.
    sleepSync(retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);
    ({ matches, tried } = search());
  }

  if (matches.length === 0) return { ok: false, failure: "no-match", tried, host, via };
  if (matches.length > 1) return { ok: false, failure: "multiple-matches", tried: matches, host, via };
  return { ok: true, path: matches[0], host, via };
}

/**
 * The invoking session's transcript, across every host that claims this process.
 *
 * One candidate is the normal case and resolves directly. Two means one agent
 * is running inside the other's shell, and the tie is broken on **evidence**,
 * never on precedence: this run printed the marker, so it is in the transcript
 * of the session that is asking and in no other file on disk. A tie the marker
 * does not settle — neither transcript carries it, or somehow both do — is
 * `ambiguous-host`, because picking either would read a stranger's session.
 */
export function resolveSession(options) {
  const { candidates, storeRootOf, marker, slug, retryDelayMs } = options ?? {};
  const list = candidates ?? [];

  if (list.length === 0) {
    return { ok: false, failure: "unsupported-host", tried: Object.keys(HOSTS) };
  }

  const resolved = list.map((candidate) => ({
    candidate,
    result: resolveTranscript({
      ...candidate,
      storeRoot: storeRootOf(candidate.host),
      marker,
      slug,
      retryDelayMs,
    }),
  }));

  if (list.length === 1) return resolved[0].result;

  const found = resolved.filter(({ result }) => result.ok);
  if (found.length === 0) {
    return {
      ok: false,
      failure: "no-match",
      tried: resolved.flatMap(({ result }) => result.tried ?? []),
    };
  }

  const paths = found.map(({ result }) => result.path);
  let carrying = filesContaining(paths, marker);
  if (carrying.length === 0) {
    // The marker reaches a transcript only once the host has flushed the record
    // that carries it, so one retry covers a write still in flight.
    sleepSync(retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);
    carrying = filesContaining(paths, marker);
  }

  if (carrying.length === 1) {
    const pick = found.find(({ result }) => result.path === carrying[0]);
    return { ...pick.result, via: "session-id+marker" };
  }
  return {
    ok: false,
    failure: "ambiguous-host",
    tried: found.map(({ candidate, result }) => `${candidate.host}: ${result.path}`),
  };
}

// ---------------------------------------------------------------------------
// Normalization — every supported format down to one record shape
// ---------------------------------------------------------------------------

/** `value` as JSON, or "" for a value JSON cannot carry. */
function jsonOrEmpty(value) {
  if (value === undefined) return "";
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

/**
 * A tool call rendered as the evidence it is. A tool-call record carries a name
 * and an invocation and no prose, so the text-shaped reads below would normalize
 * it to the empty string — erasing the repeated invocation that is the whole
 * evidence the tooling lens looks for, while still spending a record of the
 * stream budget on a blank line.
 */
function toolUseText(name, invocation) {
  const toolName = typeof name === "string" && name ? name : "unknown";
  const input = typeof invocation === "string" ? invocation : jsonOrEmpty(invocation);
  return input ? `[tool_use ${toolName}] ${input}` : `[tool_use ${toolName}]`;
}

/** The text of one Claude content block, whatever shape the block takes. */
function blockText(block) {
  if (typeof block === "string") return block;
  if (block === null || typeof block !== "object") return "";
  if (typeof block.text === "string") return block.text;
  if (block.type === "tool_use") return toolUseText(block.name, block.input);
  if (typeof block.content === "string") return block.content;
  if (Array.isArray(block.content)) return block.content.map(blockText).join("\n");
  return "";
}

/** A Claude record's span text: what a lens reads, before the per-span cap. */
function spanText(record) {
  const content = record?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(blockText).join("\n");
  return blockText(content);
}

/** The text of a Codex content array — `input_text` and `output_text` blocks. */
function codexText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => (typeof block?.text === "string" ? block.text : ""))
    .filter((text) => text !== "")
    .join("\n");
}

/** True when a record carries the Codex rollout envelope rather than a Claude record. */
function isCodexRecord(record) {
  return (
    record !== null &&
    typeof record === "object" &&
    typeof record.type === "string" &&
    record.payload !== null &&
    typeof record.payload === "object"
  );
}

/**
 * True only for a real user prompt. Most user-side records in a live transcript
 * are tool results and host injections, so "the last user message" is not a
 * prompt classifier.
 */
export function isUserTurn(record) {
  if (record === null || typeof record !== "object") return false;
  if (isCodexRecord(record)) {
    const { payload } = record;
    if (record.type !== "response_item" || payload.type !== "message" || payload.role !== "user") return false;
    const text = codexText(payload.content).trimStart();
    return !CODEX_INJECTION_PREFIXES.some((prefix) => text.startsWith(prefix));
  }
  if (record.type !== "user") return false;
  if ("toolUseResult" in record) return false;
  if (record.isMeta === true) return false;
  const text = spanText(record);
  return !CLAUDE_INJECTION_TAGS.some((tag) => text.includes(tag));
}

/**
 * One raw record, classified. `keep` is a normalized record; `drop` is the
 * counter key an excluded record lands under; a null `format` is a record no
 * supported host writes.
 */
export function classifyRecord(record) {
  if (record === null || typeof record !== "object") return { format: null };

  if (isCodexRecord(record)) return { format: "codex", ...classifyCodex(record) };

  const type = typeof record.type === "string" ? record.type : null;
  if (type === null) return { format: null };
  if (!CLAUDE_ALLOWED_TYPES.has(type)) return { format: "claude-code", drop: type };
  return {
    format: "claude-code",
    keep: { type, isUserTurn: isUserTurn(record), text: spanText(record) },
  };
}

/** A Codex rollout record, classified against the shapes Codex writes. */
function classifyCodex(record) {
  const { payload } = record;
  // Everything outside `response_item` is rollout bookkeeping: session headers,
  // UI events (which restate the assistant messages already kept below), token
  // accounting, and compaction boundaries. Each is dropped under its own name,
  // so the report still shows it happened.
  if (record.type !== "response_item") return { drop: record.type };

  const payloadType = typeof payload.type === "string" ? payload.type : "unknown";

  if (payloadType === "message") {
    const role = typeof payload.role === "string" ? payload.role : "unknown";
    if (CODEX_DROPPED_ROLES.has(role)) return { drop: role };
    if (role === "user") {
      return { keep: { type: "user", isUserTurn: isUserTurn(record), text: codexText(payload.content) } };
    }
    if (role === "assistant") {
      return { keep: { type: "assistant", isUserTurn: false, text: codexText(payload.content) } };
    }
    return { drop: `message:${role}` };
  }

  // A tool call: a payload naming a tool plus the invocation it was given.
  // Matched by shape rather than by an enumerated list of call types, so a
  // rollout that renames one still yields the name and arguments the tooling
  // lens counts.
  if (typeof payload.name === "string" && (payload.input !== undefined || payload.arguments !== undefined)) {
    return {
      keep: {
        type: "assistant",
        isUserTurn: false,
        text: toolUseText(payload.name, payload.input ?? payload.arguments),
      },
    };
  }

  // A tool result, which is where a command's own stdout lands — including the
  // marker a fallback resolution searches for.
  if (payloadType.endsWith("_output")) {
    return { keep: { type: "user", isUserTurn: false, text: codexText(payload.output) } };
  }

  return { drop: `${record.type}:${payloadType}` };
}

/**
 * The prior history a resolved transcript does not contain, or null. A Codex
 * thread that was forked or spawned from another one starts its own rollout,
 * and the turns before the fork live in the parent's file — which this run does
 * not read, because it is a different session.
 */
export function priorHistoryOf(record) {
  if (!isCodexRecord(record) || record.type !== "session_meta") return null;
  const { payload } = record;
  const parent = payload.forked_from_id ?? payload.parent_thread_id ?? null;
  return typeof parent === "string" && parent ? parent : null;
}

/**
 * Classify and bound a raw JSONL transcript. Everything a lens is allowed to
 * read comes back in `records`; every exclusion comes back as a count, because
 * a silent drop is indistinguishable from a parser that never saw the record.
 */
export function normalizeTranscript(jsonlText) {
  const droppedByType = {};
  const formats = new Set();
  let malformedLines = 0;
  let truncatedSpans = 0;
  let unrecognizedRecords = 0;
  let priorHistory = null;
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

    priorHistory = priorHistory ?? priorHistoryOf(record);

    const classified = classifyRecord(record);
    if (classified.format === null) {
      unrecognizedRecords++;
      continue;
    }
    formats.add(classified.format);

    if (classified.drop !== undefined) {
      droppedByType[classified.drop] = (droppedByType[classified.drop] ?? 0) + 1;
      continue;
    }

    let { text } = classified.keep;
    if (text.length > PER_SPAN_BYTE_CAP) {
      text = text.slice(0, PER_SPAN_BYTE_CAP);
      truncatedSpans++;
    }

    records.push({ ...classified.keep, text });
  }

  return {
    ...boundStream(records),
    format: formatOf(formats),
    droppedByType,
    malformedLines,
    truncatedSpans,
    unrecognizedRecords,
    priorHistory,
  };
}

/** The one format a stream is in — or the honest answer when it is not one. */
function formatOf(formats) {
  if (formats.size === 1) return [...formats][0];
  return formats.size === 0 ? "unknown" : "mixed";
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
  const storeOverride = process.argv[3] ?? "";

  if (!runDir) {
    process.stderr.write("usage: resolve-transcript.mjs <run-cache-dir> [store-root]\n");
    process.exit(1);
  }

  const FAILURE_NOTES = {
    "unsupported-host":
      "reflect reads Claude Code and Codex session stores; Conductor is supported through whichever of those it runs, and its Cursor Agent and OpenCode backends are not",
    "ambiguous-host":
      "two agents' session variables are set in one process and the marker settled neither transcript",
    "unsupported-format": "the resolved file holds no records a supported host writes",
  };

  const fail = (failure, tried, note) => {
    process.stderr.write(`${failure}\n`);
    for (const line of tried ?? []) process.stderr.write(`  tried: ${line}\n`);
    if (note) process.stderr.write(`  note: ${note}\n`);
    process.exit(1);
  };

  // The slug of the directory this command runs in. It matches only when the
  // session also started here, so it is an optimization, never the mechanism.
  const slug = process.cwd().replace(/[/.]/g, "-");

  const resolved = resolveSession({
    candidates: detectHost(process.env),
    storeRootOf: (host) => storeOverride || storeRootFor(host, process.env),
    marker: runDir,
    slug,
  });
  if (!resolved.ok) fail(resolved.failure, resolved.tried, FAILURE_NOTES[resolved.failure]);

  const raw = readFileSync(resolved.path, "utf8");
  const normalized = normalizeTranscript(raw);
  if (normalized.format === "unknown" || normalized.format === "mixed") {
    fail("unsupported-format", [resolved.path], `${FAILURE_NOTES["unsupported-format"]} (format: ${normalized.format}, unrecognized records: ${normalized.unrecognizedRecords})`);
  }

  mkdirSync(runDir, { recursive: true });
  const outPath = join(runDir, "transcript.jsonl");
  writeFileSync(outPath, normalized.records.map((r) => JSON.stringify(r)).join("\n"), "utf8");

  process.stdout.write(`host: ${resolved.host}\n`);
  process.stdout.write(`resolved by: ${resolved.via}\n`);
  process.stdout.write(`format: ${normalized.format}\n`);
  process.stdout.write(`transcript: ${resolved.path}\n`);
  process.stdout.write(`bytes: ${raw.length}\n`);
  process.stdout.write(`normalized: ${outPath}\n`);
  process.stdout.write(`records: ${normalized.records.length}\n`);
  process.stdout.write(`user turns: ${normalized.records.filter((r) => r.isUserTurn).length}\n`);
  process.stdout.write(`dropped by type: ${JSON.stringify(normalized.droppedByType)}\n`);
  process.stdout.write(`dropped for ceiling: ${normalized.droppedForCeiling}\n`);
  process.stdout.write(`truncated spans: ${normalized.truncatedSpans}\n`);
  process.stdout.write(`malformed lines: ${normalized.malformedLines}\n`);
  process.stdout.write(`unrecognized records: ${normalized.unrecognizedRecords}\n`);
  process.stdout.write(`prior history unavailable: ${normalized.priorHistory ?? "none"}\n`);
}
