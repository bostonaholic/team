export function parseTarget(raw: string): {
  target: string;
  number: number;
  repository: string | null;
};
export function verifyHead(input: {
  url: string;
  number?: number;
  state: "OPEN" | "MERGED" | "CLOSED";
  baseRefName: string;
  headRefName: string;
  headRepository: string | { nameWithOwner?: string | null } | null;
  currentBranch?: string;
  pushRemote?: string;
  pushRemoteUrl?: string;
  pushRemoteUrls?: string[];
  remotes?: Array<{ name: string; url: string }>;
}, context?: {
  currentBranch: string;
  pushRemote: string;
  pushRemoteUrl?: string;
  pushRemoteUrls?: string[];
  remotes: Array<{ name: string; url: string }>;
}): {
  url: string;
  number: number;
  baseRepository: string;
  headRepository: string;
  branch: string;
  base: string;
  pushRemote: string;
  pushUrl: string;
  baseRemote: string;
};

export function evaluateSettlement(input: {
  attempt: number;
  mergeStateStatus: string;
  checksComplete: boolean;
  checkCount: number;
  zeroCheckReads: number;
}): {
  settled: boolean;
  exhausted: boolean;
  nextAttempt: number | null;
  zeroCheckReads: number;
  skipCheckWatch: boolean;
};

export function evaluateMergeability(input: {
  state: string;
  behindRebases: number;
  unstableRetries: number;
  unknownRetries: number;
}): { action: "merge" | "rebase" | "retry-ci" | "reread" | "stop" };
