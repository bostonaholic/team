// Type declarations for resolve-transcript.mjs — the .mjs is the source of
// truth; this stub only describes its exports for `tsc --noEmit`. Consumed by
// TypeScript tooling, never at runtime. Same convention as
// skills/team/references/supports-nesting.d.mts.

/** Per-span byte cap applied before any lens sees a span. */
export const PER_SPAN_BYTE_CAP: number;

/** Aggregate record ceiling on the normalized stream, newest kept. */
export const MAX_RECORDS: number;

/** Aggregate byte ceiling on the normalized stream, newest kept. */
export const MAX_TOTAL_BYTES: number;

/** The hosts whose session stores this script reads, keyed by host name. */
export const HOSTS: Record<string, { depth: number; suffixed: boolean }>;

/** A supported host's name, or null when this process is on neither. */
export type HostName = "claude-code" | "codex";

/** One normalized record: an allowlisted span the lenses may read. */
export interface NormalizedRecord {
  /** The record's normalized side of the conversation: "user" or "assistant". */
  type: string;
  /** True only for a real user prompt (no tool result, injection, or meta). */
  isUserTurn: boolean;
  /** The record's span text, cut to PER_SPAN_BYTE_CAP. */
  text: string;
}

/** The normalized stream plus the counts the run summary reports. */
export interface NormalizedTranscript {
  records: NormalizedRecord[];
  /** The one host format the stream was in, or "unknown" / "mixed". */
  format: string;
  /** Dropped non-allowlisted record types, counted per type. */
  droppedByType: Record<string, number>;
  malformedLines: number;
  truncatedSpans: number;
  /** Well-formed JSON lines no supported host writes. */
  unrecognizedRecords: number;
  /** The thread this one was forked from, whose turns are in another file. */
  priorHistory: string | null;
  /** Records dropped to stay inside MAX_RECORDS / MAX_TOTAL_BYTES. */
  droppedForCeiling: number;
}

/** One raw record, classified: kept, dropped under a counter key, or unreadable. */
export interface ClassifiedRecord {
  /** The host format the record belongs to, or null when no host writes it. */
  format: string | null;
  keep?: NormalizedRecord;
  drop?: string;
}

/** One host that might hold this session, and the id it exported for it. */
export interface HostCandidate {
  host: HostName;
  sessionId: string | null;
}

export interface ResolveOptions {
  /** The host whose store to search. Validated here, so any string is accepted. */
  host: string | null;
  /** The host's own id for this session. Present means an exact lookup. */
  sessionId?: string | null;
  /** Search root, injected so tests never read a real session store. */
  storeRoot: string;
  /** The unguessable run-cache path this run printed. Matched fixed-string. */
  marker?: string;
  /** Optional narrow first glob for Claude Code: the start directory's slug. */
  slug?: string;
  /** Retry delay before the second search, injectable so tests never sleep. */
  retryDelayMs?: number;
}

/** One resolved absolute transcript path, or a named failure — never a pick. */
export interface ResolveResult {
  ok: boolean;
  path?: string;
  host?: HostName | null;
  /** "session-id" when the host named the session, "marker" otherwise. */
  via?: string;
  /**
   * "unsupported-host" | "ambiguous-host" | "invalid-session-id" |
   * "no-session-store" | "no-match" | "multiple-matches" when ok is false.
   */
  failure?: string;
  /** The globs or paths tried, for the failure message. */
  tried?: string[];
}

export interface ResolveSessionOptions {
  /** Every host claiming this process, from detectHost. */
  candidates: readonly HostCandidate[];
  /** The store root for a given host. Injected so tests never read a real one. */
  storeRootOf: (host: string) => string;
  marker?: string;
  slug?: string;
  retryDelayMs?: number;
}

export function detectHost(env: Record<string, string | undefined> | undefined): HostCandidate[];

export function resolveSession(options: ResolveSessionOptions): ResolveResult;

export function storeRootFor(host: string | null, env: Record<string, string | undefined> | undefined): string;

export function resolveTranscript(options: ResolveOptions): ResolveResult;

export function normalizeTranscript(jsonlText: string): NormalizedTranscript;

export function classifyRecord(record: unknown): ClassifiedRecord;

export function declaredSessionId(headText: string): string | null;

export function priorHistoryOf(record: unknown): string | null;

export function isUserTurn(record: unknown): boolean;
