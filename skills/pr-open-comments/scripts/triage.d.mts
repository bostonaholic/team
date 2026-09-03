export type ReviewVerdict = "STILL RELEVANT" | "ALREADY ADDRESSED" | "STALE" | "INACCURATE";
export type Reaction = "THUMBS_UP" | "THUMBS_DOWN" | null;

export function reviewThreadsQuery(): string;
export function reviewThreadCommentsQuery(): string;

export function parseTarget(raw: string): {
  target: string | null;
  number: number | null;
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
  | { source: "direct"; target: string | null; number: number | null; repository: string | null; batch: null }
  | WatchBatch;

export function parsePushRepository(raw: string): string;

export function validateBinding(
  metadata: {
    url: string;
    number?: number;
    state: string;
    baseRefName: string;
    headRefName: string;
    headRepository?: { name?: string; nameWithOwner?: string };
    headRepositoryOwner?: { login?: string };
    [key: string]: unknown;
  },
  context: {
    currentBranch: string;
    pushRemote: string;
    pushRemoteUrls: string[];
  },
): {
  canonicalUrl: string;
  owner: string;
  repo: string;
  number: number;
  headRepository: string;
  currentBranch: string;
  pushRemote: string;
  pushRemoteUrls: string[];
  [key: string]: unknown;
};

export function decideTriage(input: {
  verdict: ReviewVerdict;
  confidence: number;
  authorized: boolean;
  bounded: boolean;
  safetyStop: string | null;
  ownComment: boolean;
  viewerReactions: string[];
}): { action: "auto-apply" | "present" | "stop"; reaction: Reaction };
