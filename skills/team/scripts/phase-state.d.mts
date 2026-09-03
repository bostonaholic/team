export type TeamPhase =
  | "WORKTREE"
  | "QUESTION"
  | "RESEARCH"
  | "DESIGN"
  | "STRUCTURE"
  | "PLAN"
  | "IMPLEMENT"
  | "PR";

export type WorktreeEntry = {
  path: string;
  branch: string | null;
};

export type TopicState = {
  id: string;
  dir: string;
  mtime: number;
};

export type PhaseAction = {
  action: "run" | "noop" | "blocked";
  current: TeamPhase | "COMPLETE";
  requested: TeamPhase;
};

export const ID_RE: RegExp;
export const PHASES: TeamPhase[];

export function isTopicId(value: string): boolean;
export function worktrees(rootDir: string): WorktreeEntry[];
export function resolveArtifactDirectory(rootDir: string, id: string): string | null;
export function readFrontmatter(path: string): Record<string, string>;
export function designReviewPassed(dir: string, topic?: string | null): boolean;
export function worktreeMap(dir: string): Map<string, string>;
export function verifiedHeads(dir: string): Map<string, string>;
export function implementationPassed(
  dir: string,
  headFor?: (path: string) => string | null,
): boolean;
export function prOpened(
  dir: string,
  headFor?: (path: string) => string | null,
): boolean;
export function inferPhase(
  dir: string,
  headFor?: (path: string) => string | null,
): TeamPhase | null;
export function phaseAction(currentPhase: TeamPhase | null, requestedPhase: string): PhaseAction;
export function findLatestTopic(
  rootDir: string,
  headFor?: (path: string) => string | null,
): TopicState | null;
