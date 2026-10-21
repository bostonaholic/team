# Model selection for body-loaded agents

For Codex and Antigravity body-loaded dispatch. Claude's named-agent path keeps
its native `model:` and `effort:` frontmatter. Other hosts keep their reported
default-model substitution; nothing here covers OpenCode.

## Resolve before spawning

Read the agent's `model:` and `effort:` before stripping its frontmatter.
`opus`, `sonnet`, and `haiku` are Claude aliases that name the corresponding
entries in [bundled model selections](model-defaults.json) on other hosts.

`projectRoot` is the home project root established at run entry, even for
slice worktrees and companion repositories. The resolver reads only that
root's optional `.team/config.json`, whose entries replace individual bundled
selections; never create it. Shape:

```json
{
  "codex": { "sonnet": { "model": "terra", "reasoning_effort": "medium" } },
  "antigravity": { "sonnet": { "model": "flash" } }
}
```

A Codex `model` is a lowercase class name (resolved to the newest catalog
member supporting the effort) or a concrete catalog ID (pinned). Codex's
optional `reasoning_effort` replaces the agent effort. Antigravity's
`invoke_subagent` has no effort argument; the native model tier selects
effort. Record that limitation; never claim the agent's Claude effort was
applied.

Capture host capabilities before the first dispatch and after any provider or
model configuration change. Codex: its exposed model catalog (CLI app-server
`model/list` where available) with supported reasoning efforts. Antigravity:
the `invoke_subagent` tool's `Model` enum, not `agy models`. Never invent a
catalog from this document or a model's account of itself. If the host cannot
expose them, stop this dispatch and report why.

Prepare request JSON in the run's scratch directory; read-only callers instead
pass it on stdin with `-` from a quoted heredoc, writing no file. `available`
maps each currently available model ID, unchanged from the host catalog, to its
supported efforts, or each Antigravity tier to `[]`:

```json
{
  "projectRoot": "/absolute/home/project",
  "host": "codex",
  "tier": "opus",
  "effort": "high",
  "available": { "<family>-<version>-astra": ["low", "medium", "high", "xhigh"] }
}
```

Run `node "<installed-team-root>/skills/team/references/resolve-model.mjs" "<request.json>"`.
The [resolver](resolve-model.mjs) validates config, availability, and effort.
Nonzero exit means no spawn: report its stderr. Never substitute a default model
for a rejected mapping.

Apply the returned `spawn` fields to the actual host tool call:

- **Codex:** pass `model`, `reasoning_effort`, and `fork_turns: "none"` to
  `spawn_agent` (full-history forks ignore these overrides). Supply the definition body and resource paths in `message`.
- **Antigravity:** pass `Model` on the corresponding `invoke_subagent.Subagents`
  entry, alongside its `TypeName`, `Role`, and `Prompt`. `define_subagent` alone
  does not select the model. Never put a top-level CLI model ID in `Model`.

If the active tool cannot express these selections, stop and name that host
limitation. Model mappings grant no permission or full-pipeline parity;
tool-grant, reviewer isolation, and resource-read rules still apply. A resume
uses the same child and model; a changed selection needs a fresh dispatch.

## Report selection and resolution separately

For each spawn, add a run-report row (or a standalone command's final report):
agent, host, requested tier, config source, configured model (Codex: class or
pin), sent model/effort arguments (Codex: the resolver's catalog ID), child ID,
observed model/effort, evidence location, and status.

Fill observed values from host runtime metadata, never a child's self-report:
Codex turn-context metadata (model and effort); Antigravity generation metadata
(concrete model ID, never a tier name). With no runtime evidence, write
`unverified` and leave observed values unknown; never label a configured or
sent value resolved.

A tool error or failed child is `failed`, even if the CLI exits zero. A Codex
model/effort mismatch is `mismatch`: stop before consuming that result and report
both requested and observed values. For Antigravity, record the resolved ID
without assuming a fixed ID behind a floating tier.
