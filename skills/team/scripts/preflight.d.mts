export interface CommandResult {
  status: number | null;
  timedOut: boolean;
  stdout: string;
}

export interface PreflightResult {
  sshAgent: "ready" | "unavailable";
  githubAuth: "ready" | "unavailable";
  commitSigning: "enabled" | "not-enabled";
  signingProbe: { ready: boolean; skipped: boolean; timedOut: boolean };
}

export function runPreflight(
  run?: (
    program: string,
    args: string[],
    options: { cwd?: string; timeout?: number },
  ) => CommandResult,
): PreflightResult;
