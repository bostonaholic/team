export type ItemVerdict = "PASS" | "FAIL" | "PARTIAL";
export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export function finalVerdict(
  items: Array<{ verdict: ItemVerdict; confidence: Confidence }>,
): "READY" | "NEEDS ATTENTION" | "NOT READY";
