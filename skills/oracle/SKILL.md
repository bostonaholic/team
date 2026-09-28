---
name: oracle
description: 'Use for read-only engineering second opinions. Dispatches a fresh advisor for code, architecture, debugging, or plans.'
effort: high
argument-hint: "<engineering question or review target>"
---

# Oracle

Get one independent engineering recommendation. The advisor reads relevant evidence, makes no changes, and returns one complete answer.

## Input

Use the user's question or review target. For "current changes," inspect the working diff; for "last commit," inspect the last commit. Pass the user's actual request, repository path, any attached files, and necessary conversation facts. Do not pass your proposed answer or unverified conclusions.

If the target is unclear and repository evidence cannot resolve it, ask one question before dispatch.

## Dispatch

Read [the advisor brief](references/advisor.md) completely. Spawn a fresh subagent with that brief as its role instructions and the input above as its task. Exclude the caller's conversation history (`fork_turns: "none"` on Codex). Use the host's read-only tool restrictions when available. If the host cannot dispatch a fresh subagent, state that the independent opinion is unavailable and stop. Do not answer in the caller's context.

The advisor returns once. Do not request follow-up work from it. Relay its answer without adding unverified findings. If its evidence is missing or a cited path is wrong, check that point before relaying and label the limitation.
