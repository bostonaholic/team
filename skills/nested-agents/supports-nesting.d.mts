// Type declarations for supports-nesting.mjs — the .mjs is the source of
// truth; this stub only describes its exports for `tsc --noEmit`. Consumed
// by TypeScript tooling, never at runtime.

/** The Claude Code release that introduced nested sub-agents. */
export const MIN_VERSION: string;

/** Numeric [major, minor, patch], or null when no triple is present. */
export function parseVersion(raw: unknown): [number, number, number] | null;

/** True only when `raw` parses to a version >= `min`. Fail-closed. */
export function meetsMinimum(raw: unknown, min?: string): boolean;
