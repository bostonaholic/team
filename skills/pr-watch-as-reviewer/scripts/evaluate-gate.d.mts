export type Verdict = "addressed" | "answered" | "pending" | "rejected" | null;
export interface ThreadState { id: string; isResolved: boolean; verdict: Verdict }
export interface CommentState { id: string; engaged: boolean; verdict: Verdict }
export interface GateResult {
  total: number;
  threads: number;
  comments: number;
  empty: boolean;
  triggerPending: string[];
  verdictPending: string[];
  ready: boolean;
}
export function parseTarget(raw: string): {
  target: string | null;
  number: number | null;
  repository: string | null;
};
export function evaluateGate(input: {
  threads?: ThreadState[];
  comments?: CommentState[];
}): GateResult;
export function evaluatePoll(input: {
  cycle: number;
  consecutiveFailures: number;
  fetchOk: boolean;
  paginationComplete: boolean;
  state?: "OPEN" | "MERGED" | "CLOSED";
  headRefOid?: string;
  gateReady: boolean;
}): {
  action: "retry" | "continue" | "evaluate" | "stop";
  reason: "poll-failure" | "poll-failures" | "gate-ready" | "timeout" | "merged" | "closed" | null;
  failures: number;
  nextCycle: number | null;
  headRefOid: string | null;
};
