# Model selection for body-loaded agents

These mappings make no claim about OpenCode model support.

## Resolve before spawning

Read the agent's `model:` and `effort:` before stripping its frontmatter.
`opus`, `sonnet`, and `haiku` remain Claude aliases and identify the corresponding
entries in [bundled model selections](model-defaults.json) on other hosts.

Use the home project root established at run entry, including for later slice
worktrees and companion repositories. Its `.team/config.json` is optional; do not
create the file automatically.

Antigravity has no independent effort argument on `invoke_subagent`: its host
selects effort with the native model tier. Record that limitation, rather than
claiming the agent's Claude effort was applied.

Capture current capabilities from the host before the first dispatch, and again
if its provider or model configuration changes. For Codex, use its exposed model
catalog (CLI app-server `model/list` where available), including supported
reasoning efforts. For Antigravity, read the `invoke_subagent` tool's `Model`
enum. Its top-level `agy models` list is not that enum. Do not invent a catalog
from this document or from a model's account of its own identity. If the host
cannot expose the required capabilities, stop this dispatch and report why.

Prepare request JSON in the run's scratch directory. Read-only callers instead
supply the JSON on stdin with `-`, using a quoted heredoc and no file write.
The request carries `projectRoot` (absolute), `host`, `tier`, `effort`, and `available`.
`available` maps each
currently available model ID to its supported efforts, or each Antigravity tier
to `[]`.

Run `node "<installed-team-root>/skills/team/references/resolve-model.mjs" "<request.json>"`.
Nonzero exit means no spawn: report its error. Missing or invalid
mappings and unsupported values never trigger a default substitution.

Apply the returned `spawn` fields to the actual host tool call:

- **Codex:** pass `model`, `reasoning_effort`, and `fork_turns: "none"` to
  `spawn_agent`. Full-history forks inherit the parent model and cannot apply
  these overrides. Supply the definition body and resource paths in `message`.
- **Antigravity:** pass `Model` on the corresponding `invoke_subagent.Subagents`
  entry, alongside its `TypeName`, `Role`, and `Prompt`. `define_subagent` alone
  does not select the model. Never put a top-level CLI model ID in `Model`.

If the active tool cannot express these selections, stop and name that host
limitation. Keep the existing tool-grant, reviewer isolation, and resource-read
requirements. These model mappings do not establish permission or full-pipeline
parity. A later resume uses the same child and model; changed selection requires
a fresh dispatch.

## Report selection and resolution separately

For each spawn, add a row to the run report (or the standalone command's final
report): agent, host, requested tier, config source, sent model/effort arguments,
child ID, observed model/effort, evidence location, and status.

Use host runtime metadata to fill observed values, never a child's self-report.
Codex turn-context metadata records model and effort; Antigravity generation
metadata records its concrete model ID. Antigravity tier names are not concrete
model IDs. When the host exposes no runtime evidence, write `unverified` and
leave observed values unknown. Do not label a configured or sent value resolved.

A tool error or failed child is `failed`, even if the CLI exits zero. A Codex
model/effort mismatch is `mismatch`: stop before consuming that result and report
both requested and observed values. For Antigravity, record the resolved ID
without assuming a fixed ID behind a floating tier. The selections neither prove
equal quality to Claude's tiers nor preserve a literal Claude model pin on
another provider.
