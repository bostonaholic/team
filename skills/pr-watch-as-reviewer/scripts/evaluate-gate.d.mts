export type Verdict = "addressed" | "answered" | "pending" | "rejected" | null;
export function parseTarget(raw: string): { target: string; number: number; repository: string | null };
export interface ReviewThread { id: string; isResolved: boolean; verdict: Verdict }
export interface ReviewComment { id: string; engaged: boolean; verdict: Verdict }
export interface GateResult {
  total: number;
  threads: number;
  comments: number;
  empty: boolean;
  triggerPending: string[];
  verdictPending: string[];
  ready: boolean;
}
export function evaluateGate(input: {
  threads?: ReviewThread[];
  comments?: ReviewComment[];
}): GateResult;
export function evaluatePoll(input: {
  cycle: number;
  consecutiveFailures: number;
  fetchOk: boolean;
  paginationComplete: boolean;
  state?: "OPEN" | "MERGED" | "CLOSED";
}): {
  action: "continue" | "retry" | "stop";
  reason: string | null;
  failures: number;
  nextCycle: number | null;
};
export function evaluateConfirmation(input: {
  round: number;
  changed: boolean;
}): {
  action: "proceed" | "confirm" | "stop";
  reason: string | null;
  nextRound: number | null;
};
export function requireApproval(input: {
  state: "OPEN" | "MERGED" | "CLOSED";
  currentHeadOid: string;
  confirmedHeadOid: string;
  threads?: ReviewThread[];
  comments?: ReviewComment[];
}): { approved: true; headOid: string; total: number };
