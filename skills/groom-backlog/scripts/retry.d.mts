export function evaluateRetry(input: { attempt: number; retryable: boolean }): {
  action: "retry" | "stop";
  reason: "transient" | "non-retryable" | "retry-limit";
  nextAttempt: number | null;
  delaySeconds: number | null;
};
