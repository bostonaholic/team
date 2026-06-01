---
topic: evals-ci-install-claude-cli
date: 2026-06-01
phase: task
ticketId: null
---

# Bug: behavioral-evals CI fails — `claude` CLI not installed/authenticated

The weekly `Behavioral evals` workflow
([run 26742546297](https://github.com/bostonaholic/team/actions/runs/26742546297))
fails at the "Run code-reviewer agent live" step with:

```
error: Executable not found in $PATH: "claude"
  syscall: "spawn claude"
     code: "ENOENT"
  at runAgentTest (tests/helpers/session-runner.ts:275)
```

## Root cause

`.github/workflows/behavioral-evals.yml` installs Bun and project deps, then
runs `bun test ./tests/code-reviewer.evals.ts`. That suite calls
`runAgentTest`, which `spawn("claude", ...)`. The workflow never installs the
Claude Code CLI, so the executable is absent from `$PATH`.

A second latent failure sits right behind it: the spawned agent has no
credentials. `EVALS_ANTHROPIC_API_KEY` is *deliberately namespaced* for the
LLM judge only (`evals/README.md:70`) so the agent-under-test won't auto-pick
it up. In local dev the agent rides the developer's logged-in Claude Code
session; CI has none. Installing the CLI alone would just move the failure to
an auth error on the next cron.

## Fix

In `behavioral-evals.yml`:
1. Add a step installing the Claude Code CLI (`npm install -g
   @anthropic-ai/claude-code`) before the live-agent step.
2. Expose `ANTHROPIC_API_KEY` (sourced from the `EVALS_ANTHROPIC_API_KEY`
   secret) to the live-agent step so the spawned agent authenticates.

Guard the regression with a static-gate test asserting the workflow installs
the CLI and provides agent auth.
