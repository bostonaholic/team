export type ReviewVerdict = "STILL RELEVANT" | "ALREADY ADDRESSED" | "STALE" | "INACCURATE";
export type Reaction = "THUMBS_UP" | "THUMBS_DOWN" | null;

export function reviewThreadsQuery(): string;
export function reviewThreadCommentsQuery(): string;

export function parseTarget(raw: string): {
  target: string;
  number: number;
  repository: string | null;
};

export type WatchFeedback =
  | {
      kind: "issue-comment";
      id: string;
      author: string | null;
      body: string;
      createdAt: string;
      url: string;
      ownComment: false;
      viewerReactions: string[];
    }
  | {
      kind: "review-body";
      id: string;
      author: string | null;
      body: string;
      url: string;
      submittedAt: string;
      state: string;
      ownComment: false;
      viewerReactions: string[];
    };

export type WatchBatch = {
  schema: 1;
  source: "pr-watch-as-author";
  target: string;
  number: number;
  repository: string;
  mode: "default" | "authorized";
  authorized: boolean;
  batch: {
    threads: Array<{ id: string; latestCommentId: string }>;
    feedback: WatchFeedback[];
  };
};

export function validateWatchBatch(input: unknown): WatchBatch;
export function parseInvocation(raw: string):
  | { source: "direct"; target: string; number: number; repository: string | null; batch: null }
  | WatchBatch;
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
}): { url: string; number: number; repository: string; branch: string; base: string; pushRemote: string; pushUrl: string; baseRemote: string };

export function decideTriage(input: {
  verdict: ReviewVerdict;
  confidence: number;
  authorized: boolean;
  bounded: boolean;
  safetyStop: string | null;
  ownComment: boolean;
  viewerReactions: string[];
}): { action: "auto-apply" | "present" | "stop"; reaction: Reaction };
