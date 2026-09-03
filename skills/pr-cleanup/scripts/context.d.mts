export type CleanupTarget = {
  kind: "current" | "pr" | "branch";
  target: string | null;
  number: number | null;
  repository: string | null;
  branch: string | null;
};

export function parseTarget(raw: string): CleanupTarget;
export function parseRemoteRepository(raw: string): string | null;
export function verifyContext(
  input: {
    mode: "merged" | "abandon";
    selector: CleanupTarget;
    metadata: {
      url: string;
      number?: number;
      state: string;
      mergedAt?: string | null;
      baseRefName: string;
      headRefName: string;
      headRefOid?: string | null;
      headRepository?: { name?: string; nameWithOwner?: string };
      headRepositoryOwner?: { login?: string };
      mergeCommit?: { oid?: string | null } | null;
    };
  },
  context: {
    currentBranch: string;
    pushRemote: string;
    pushRemoteUrls: string[];
    remotes: Array<{ name: string; urls: string[] }>;
  },
): {
  canonicalUrl: string;
  owner: string;
  repo: string;
  number: number;
  state: string;
  branch: string;
  base: string;
  baseRepository: string;
  headRepository: string;
  headOid: string | null;
  mergeOid: string | null;
  pushRemote: string;
  pushUrl: string;
  baseRemote: string;
  shouldClose: boolean;
};

export function parseRemoteHead(output: string, branch: string): string | null;
export function captureRemoteHead(input: {
  pushUrl: string;
  pushRepository: string;
  branch: string;
}): { remoteSha: string | null };
