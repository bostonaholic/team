export function parseTarget(raw: string): {
  target: string | null;
  number: number | null;
};

export function parsePushRepository(raw: string): string;

export function validateBinding(
  metadata: {
    url: string;
    number?: number;
    state: string;
    baseRefName: string;
    headRefName: string;
    headRefOid: string;
    headRepository?: { name?: string; nameWithOwner?: string };
    headRepositoryOwner?: { login?: string };
    [key: string]: unknown;
  },
  context: {
    currentBranch: string;
    pushRemote: string;
    pushRemoteUrls: string[];
    remoteUrls?: Record<string, string[]>;
  },
): {
  canonicalUrl: string;
  owner: string;
  repo: string;
  number: number;
  headRepository: string;
  headOid: string;
  branch: string;
  base: string;
  currentBranch: string;
  pushRemote: string;
  pushUrl: string;
  pushRemoteUrls: string[];
  baseRemote: string | null;
  [key: string]: unknown;
};

export function parseRemoteHead(output: string, branch: string): string | null;
export function captureRemoteHead(input: {
  pushUrl: string;
  pushRepository: string;
  branch: string;
}): { remoteSha: string | null };

export function validateRebasePreflight(input: {
  binding: {
    canonicalUrl: string;
    branch: string;
    base: string;
    headRepository: string;
    pushUrl: string;
  };
  metadata: {
    url: string;
    state: string;
    mergeStateStatus: string;
    baseRefName: string;
    headRefName: string;
    headRefOid: string;
    headRepository?: { name?: string; nameWithOwner?: string };
    headRepositoryOwner?: { login?: string };
  };
  localHead: string;
  remoteSha: string | null;
}): { remoteShaBefore: string; headOid: string };

export function evaluateSettlement(input: {
  attempt: number;
  mergeStateStatus: string;
  checkCount: number;
}): {
  settled: boolean;
  exhausted: boolean;
  action: "wait" | "watch" | "skip-checks" | "stop";
  nextAttempt: number | null;
};

export function evaluateMergeability(input: {
  state: string;
  unstableRetries: number;
  unknownRetries: number;
  behindRebases: number;
}): { action: "merge" | "rebase" | "retry-ci" | "reread" | "stop" };
