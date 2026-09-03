export interface WorktreeTarget {
  name: string;
  repo: string;
}

export interface CreatedWorktree {
  name: string;
  repo: string;
  path: string;
  branch: string;
  source?: string;
  status: "created" | "reused";
  copied: string[];
}

export interface WorktreeFallback {
  name: string;
  repo: string;
  path: string;
  branch: string;
  requestedBranch: string;
  status: "fallback";
  preserved?: true;
  message: string;
  error: string | null;
}

export interface WorktreeProvisioningFailure {
  name: string;
  repo: string;
  path: string;
  branch: string;
  source?: string;
  status: "provisioning-failed";
  worktreeStatus: "created" | "reused";
  message: string;
  error: string;
}

export function provisionIgnoredFiles(repo: string, worktree: string): string[];
export function parseWorktreeSection(
  markdown: string,
  expectedNames: string[],
): Map<string, string>;
export function parseRepoInventory(markdown: string): {
  home: { name: string; path: string; role: string };
  additional: Array<{ name: string; path: string; role: string }>;
};
export function createWorktrees(
  targets: WorktreeTarget[],
  branch: string,
  homeRepo: string,
  artifactDir?: string | null,
  reposFile?: string | null,
): Array<CreatedWorktree | WorktreeFallback | WorktreeProvisioningFailure>;
