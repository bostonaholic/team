#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function command(program, args, options = {}) {
  const result = spawnSync(program, args, {
    encoding: "utf8",
    timeout: options.timeout,
    cwd: options.cwd,
  });
  return {
    status: result.status,
    timedOut: result.error?.code === "ETIMEDOUT",
    stdout: result.stdout?.trim() ?? "",
  };
}

export function runPreflight(run = command) {
  const ssh = run("ssh-add", ["-l"], { timeout: 5_000 });
  const github = run("gh", ["auth", "status"], { timeout: 5_000 });
  const signing = run("git", ["config", "--global", "--get", "commit.gpgsign"], {
    timeout: 5_000,
  });
  const configured = signing.status === 0 && signing.stdout === "true";
  let probe = { ready: false, skipped: true, timedOut: false };

  if (configured) {
    const directory = mkdtempSync(resolve(tmpdir(), "team-signing-preflight-"));
    try {
      const initialized = run("git", ["init", "-q"], { cwd: directory, timeout: 5_000 });
      const committed =
        initialized.status === 0
          ? run(
              "git",
              [
                "-c",
                "user.name=probe",
                "-c",
                "user.email=probe@example.com",
                "commit",
                "--allow-empty",
                "-q",
                "-m",
                "probe",
              ],
              { cwd: directory, timeout: 20_000 },
            )
          : initialized;
      probe = {
        ready: initialized.status === 0 && committed.status === 0,
        skipped: false,
        timedOut: committed.timedOut,
      };
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }

  return {
    sshAgent: ssh.status === 0 ? "ready" : "unavailable",
    githubAuth: github.status === 0 ? "ready" : "unavailable",
    commitSigning: configured ? "enabled" : "not-enabled",
    signingProbe: probe,
  };
}

function main() {
  process.stdout.write(JSON.stringify(runPreflight()) + "\n");
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) main();
