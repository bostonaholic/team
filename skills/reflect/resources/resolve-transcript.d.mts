// Type declarations for resolve-transcript.mjs — the .mjs is the source of
// truth; this stub only describes its exports for `tsc --noEmit`. Consumed by
// TypeScript tooling, never at runtime. Same convention as
// skills/nested-agents/supports-nesting.d.mts.

/** Per-span byte cap applied before any lens sees a span. */
export const PER_SPAN_BYTE_CAP: number;

/** Aggregate record ceiling on the normalized stream, newest kept. */
export const MAX_RECORDS: number;

/** Aggregate byte ceiling on the normalized stream, newest kept. */
export const MAX_TOTAL_BYTES: number;

/** One normalized record: an allowlisted span the lenses may read. */
export interface NormalizedRecord {
  /** The record's transcript type — only "user" or "assistant" survive. */
  type: string;
  /** True only for a real user prompt (no tool result, injection, or meta). */
  isUserTurn: boolean;
  /** The record's span text, cut to PER_SPAN_BYTE_CAP. */
  text: string;
}

/** The normalized stream plus the counts the run summary reports. */
export interface NormalizedTranscript {
  records: NormalizedRecord[];
  /** Dropped non-allowlisted record types, counted per type. */
  droppedByType: Record<string, number>;
  malformedLines: number;
  truncatedSpans: number;
  /** Records dropped to stay inside MAX_RECORDS / MAX_TOTAL_BYTES. */
  droppedForCeiling: number;
}

export interface ResolveOptions {
  /** The unguessable run-cache path this run printed. Matched fixed-string. */
  marker: string;
  /** Search root, injected so tests never read a real ~/.claude/projects. */
  projectsRoot: string;
  /** Optional narrow first glob: the start directory's slug. */
  slug?: string;
  /** Retry delay before the second grep, injectable so tests never sleep. */
  retryDelayMs?: number;
}

/** One resolved absolute transcript path, or a named failure — never a pick. */
export interface ResolveResult {
  ok: boolean;
  path?: string;
  /** "no-projects-root" | "no-match" | "multiple-matches" when ok is false. */
  failure?: string;
  /** The globs or paths tried, for the failure message. */
  tried?: string[];
}

export function resolveTranscript(options: ResolveOptions): ResolveResult;

export function normalizeTranscript(jsonlText: string): NormalizedTranscript;

export function isUserTurn(record: unknown): boolean;
