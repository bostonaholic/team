export const ID_RE: RegExp;
export const PHASE_FILES: string[];

export type TopicResolution =
  | {
      status: "resolved";
      source: "explicit" | "discovered";
      id: string;
      path: string;
      absolutePath: string;
      mtime?: number;
    }
  | { status: "needs-input" };

export function readFrontmatter(path: string): Promise<Record<string, string>>;
export function designReviewPassed(directory: string): Promise<boolean>;
export function resolveTopic(options?: {
  rootDir?: string;
  argument?: string;
  predecessors?: string[];
  requireDesignReview?: boolean;
}): Promise<TopicResolution>;
export function worktreePaths(rootDir: string): string[];
export function worktreeMatches(paths: string[], id: string): boolean;
export function findActiveTopic(
  rootDir: string,
): Promise<{ id: string; dir: string; mtime: number } | null>;
export function inferPhase(
  directory: string,
  rootDir: string,
  id: string,
  hasWorktree: boolean,
): Promise<string | null>;
