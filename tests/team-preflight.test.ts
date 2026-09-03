import { describe, expect, test } from "bun:test";

import { runPreflight } from "../skills/team/scripts/preflight.mjs";

describe("team environment preflight", () => {
  test("reports all readiness signals and bounds the signing probe", () => {
    const calls: Array<{
      program: string;
      args: string[];
      options: { cwd?: string; timeout?: number };
    }> = [];
    const result = runPreflight((program, args, options) => {
      calls.push({ program, args, options });
      const stdout =
        program === "git" && args.join(" ") === "config --global --get commit.gpgsign"
          ? "true"
          : "";
      return { status: 0, timedOut: false, stdout };
    });
    expect(result).toEqual({
      sshAgent: "ready",
      githubAuth: "ready",
      commitSigning: "enabled",
      signingProbe: { ready: true, skipped: false, timedOut: false },
    });
    expect(calls.map(({ program, args }) => [program, ...args])).toContainEqual([
      "ssh-add",
      "-l",
    ]);
    expect(calls.map(({ program, args }) => [program, ...args])).toContainEqual([
      "gh",
      "auth",
      "status",
    ]);
    const commit = calls.find(({ args }) => args.includes("--allow-empty"));
    expect(commit?.options.timeout).toBe(20_000);
  });

  test("does not create an unsigned probe when signing is disabled", () => {
    const commands: string[] = [];
    const result = runPreflight((program, args) => {
      commands.push([program, ...args].join(" "));
      return { status: args[0] === "config" ? 1 : 0, timedOut: false, stdout: "" };
    });
    expect(result.commitSigning).toBe("not-enabled");
    expect(result.signingProbe.skipped).toBe(true);
    expect(commands.some((entry) => entry.includes("commit --allow-empty"))).toBe(false);
  });
});
