export type AuthorWatchEvent = "continue" | "retry" | "final-triage" | "stop";

export function pollQuery(): string;
export function threadCommentsQuery(): string;

export function parseTarget(raw: string): {
  target: string;
  number: number;
  repository: string | null;
};

type IdentityState = {
  threadIds: string[];
  threadCommentIds: string[];
  issueCommentIds: string[];
  reviewIds: string[];
};

type ReactionGroup = { content: string; viewerHasReacted: boolean };

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

export function buildWatchBatch(input: {
  target: string;
  mode: "default" | "authorized";
  fetchOk: boolean;
  paginationComplete: boolean;
  viewerLogin: string;
  observed: IdentityState;
  triaged: IdentityState;
  threads: Array<{
    id: string;
    isResolved: boolean;
    comments: {
      nodes: Array<{ id: string; author: { login: string | null } | null }>;
    };
  }>;
  issueComments: Array<{
    id: string;
    author: { login: string | null } | null;
    body: string;
    createdAt: string;
    url: string;
    reactionGroups: ReactionGroup[];
  }>;
  reviews: Array<{
    id: string;
    author: { login: string | null } | null;
    body: string;
    url: string;
    submittedAt: string | null;
    state: string;
    reactionGroups: ReactionGroup[];
  }>;
}): {
  schema: 1;
  source: "pr-watch-as-author";
  target: string;
  mode: "default" | "authorized";
  observed: IdentityState;
  triaged: IdentityState;
  changes: IdentityState;
  batch: {
    threads: Array<{ id: string; latestCommentId: string }>;
    feedback: WatchFeedback[];
  };
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
}): { url: string; number: number; repository: string; branch: string; base: string; pushRemote: string; pushUrl: string; baseRemote: string };

export function evaluatePoll(input: {
  cycle: number;
  consecutiveFailures: number;
  fetchOk: boolean;
  paginationComplete: boolean;
  state?: "OPEN" | "MERGED" | "CLOSED";
  reviewDecision?: "" | "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
}): {
  event: AuthorWatchEvent;
  reason: string | null;
  failures: number;
  nextCycle: number | null;
  reviewDecision?: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
};
