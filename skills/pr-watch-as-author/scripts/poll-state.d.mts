export type AuthorWatchEvent = "continue" | "retry" | "final-triage" | "stop";

export function pollQuery(): string;
export function threadCommentsQuery(): string;

export function parseTarget(raw: string): {
  target: string | null;
  number: number | null;
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
    comments: { nodes: Array<{ id: string; author: { login: string | null } | null }> };
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

export function parsePushRepository(raw: string): string;

export function validateBinding(
  metadata: {
    url: string;
    number?: number;
    state: string;
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
};
