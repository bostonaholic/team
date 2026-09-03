export type CheckStatus = "PASS" | "FAIL" | "UNKNOWN";
export interface CheckResult { id: string; status: CheckStatus }
export interface ComparisonRow {
  id: string;
  before: CheckStatus;
  after: CheckStatus;
  outcome: "regression" | "fixed" | "pre-existing-failure" | "unverified" | "unchanged";
}
export function compareChecks(
  before: CheckResult[],
  after: CheckResult[],
): { blocksPublish: boolean; rows: ComparisonRow[] };
