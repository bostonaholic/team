export function parseTarget(raw: string): {
  target: string | null;
  number: number | null;
  repository: string | null;
};

export function parseRemoteRepository(raw: string): string | null;

export function verifyContext(
  metadata: {
    url: string;
    number?: number;
    state: string;
    baseRefName: string;
    headRefName: string;
    headRefOid: string;
    headRepository?: { name?: string; nameWithOwner?: string };
    headRepositoryOwner?: { login?: string };
    isDraft?: boolean;
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
  baseRepository: string;
  headRepository: string;
  headOid: string;
  branch: string;
  base: string;
  pushRemote: string;
  pushUrl: string;
  baseRemote: string;
  isDraft: boolean | undefined;
};

export function verifyLocalContext(
  input: { base: string },
  context: {
    currentBranch: string;
    pushRemote: string;
    pushRemoteUrls: string[];
    remotes: Array<{ name: string; urls: string[] }>;
  },
): {
  canonicalUrl: null;
  branch: string;
  base: string;
  baseRemote: "origin";
  pushRemote: string;
  pushUrl: string | null;
  pushRepository: string | null;
  publishable: boolean;
};

export function parseRemoteHead(output: string, branch: string): string | null;
export function captureRemoteHead(input: {
  pushUrl: string;
  pushRepository: string;
  branch: string;
  expectedOid?: string;
}): { remoteSha: string | null };
