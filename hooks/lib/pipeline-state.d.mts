// Type declarations for pipeline-state.mjs — the .mjs is the source of truth;
// this stub only describes its exports for `tsc --noEmit`. Consumed by
// TypeScript tooling, never at runtime.

/** Valid <id> shape: `<TICKET>-<kebab>` or `<YYYY-MM-DD>-<kebab>`. */
export const ID_RE: RegExp;

/** Artifact basenames whose mtimes drive topic recency, in phase order. */
export const PHASE_FILES: string[];

/** Parse the hook's stdin payload as JSON; `{}` on any error. */
export function readStdinJSON(): Promise<Record<string, unknown>>;

/** The project root: input.cwd, else $CLAUDE_PROJECT_DIR, else process.cwd(). */
export function projectDir(input: { cwd?: string } | null | undefined): string;

/** Absolute paths of every git worktree; `[]` when git is absent / not a repo. */
export function worktreePaths(rootDir: string): string[];

/** True when some worktree path's basename equals `id`. */
export function worktreeMatches(paths: string[], id: string): boolean;

/** The most-recently-touched conforming topic across home + worktrees, or null. */
export function findActiveTopic(
  rootDir: string,
): Promise<{ id: string; dir: string } | null>;

/** Parse the leading `---` frontmatter block into key/value strings; `{}` on error. */
export function readFrontmatter(path: string): Promise<Record<string, string>>;

/** Infer the QRSPI phase from artifacts + git signals, or null when none apply. */
export function inferPhase(
  dir: string,
  rootDir: string,
  id: string,
  hasWorktree: boolean,
): Promise<string | null>;
