export type WorktreeEntry = {
  path: string;
  branch: string | null;
};

export const ID_RE: RegExp;
export function isTopicId(value: string): boolean;
export function worktrees(rootDir: string): WorktreeEntry[];
export function artifactRoots(rootDir: string): string[];
export function resolveArtifactDirectory(rootDir: string, id: string): string | null;
export function discoverArtifactDirectory(
  rootDir: string,
  rawArgument: string,
  predecessor: string,
):
  | { status: "resolved"; source: "explicit" | "newest"; id: string; dir: string }
  | { status: "needs-input"; reason: string; id?: string; dir?: string };
export function readFrontmatter(path: string): Record<string, string>;
