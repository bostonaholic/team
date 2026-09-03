// Type declarations for write-target.mjs — the .mjs is the source of truth;
// this stub only describes its exports for `tsc --noEmit`. Consumed by
// TypeScript tooling, never at runtime. Same convention as
// skills/nested-agents/supports-nesting.d.mts.

/** True only for a name matching `^[a-z][a-z0-9-]*$`. */
export function isValidSkillName(name: unknown): boolean;
export function parseFocus(raw: string): { focus: string | null };

export interface ContainmentQuery {
  /** The write target, whose final component need not exist yet. */
  candidatePath: string;
  /** `git rev-parse --show-toplevel`. */
  repoRoot: string;
}

/** True only when the resolved real path stays inside `repoRoot`. */
export function isInsideRepo(query: ContainmentQuery): boolean;

/** True when the repo carries `.claude-plugin/plugin.json` or `plugin.json`. */
export function hasPluginMarker(repoRoot: string): boolean;

export interface EditRootQuery {
  repoRoot: string;
  /** The plugin-marker probe result, injected so the tie-break stays pure. */
  hasPluginMarker: boolean;
}

/** The root the running host loads: <repo>/skills or <repo>/.claude/skills. */
export function preferredEditRoot(query: EditRootQuery): string;
