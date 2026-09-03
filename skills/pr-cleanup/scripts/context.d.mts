export type CleanupMode = "merged" | "abandon";

export function verifyContext(input: {
  request: { mode: CleanupMode; number: number; repository: string | null };
  pr: {
    number: number;
    url: string;
    state: "OPEN" | "MERGED" | "CLOSED";
    baseRefName: string;
    headRefName: string;
    headRepository: string | { nameWithOwner?: string | null } | null;
    headRefOid?: string | null;
    mergeCommit?: { oid?: string | null } | null;
  };
}, context?: {
  primaryRoot: string;
  currentBranch?: string | null;
  pushRemote: string;
  pushRemoteUrl?: string;
  pushRemoteUrls?: string[];
  remotes: Array<{ name: string; url: string }>;
}): {
  mode: CleanupMode;
  url: string;
  number: number;
  state: "OPEN" | "MERGED" | "CLOSED";
  closeNeeded: boolean;
  baseRepository: string;
  headRepository: string;
  branch: string;
  base: string;
  headOid: string | null;
  mergeOid: string | null;
  primaryRoot: string;
  currentBranch: string | null;
  pushRemote: string;
  pushUrl: string;
  baseRemote: string;
};
