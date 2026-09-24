---
title: Configuration
description: "Team's project-local configuration: the optional .team/config.json file that overrides bundled model selections for body-loaded agents on Codex CLI and Antigravity CLI."
audience: [user, developer]
nav_order: 6
nav_label: configuration
---

# Configuration

> **What this is.** Team reads one optional project-local file, `.team/config.json`.
> It overrides the bundled model selections used to dispatch body-loaded agents
> on Codex CLI and Antigravity CLI. Every other setting lives in the host's own
> plugin configuration.

## Where it lives

`.team/config.json` sits at the **home project root** — the project Team was
pointed at when the run began. The same root is used for later slice worktrees
and companion repositories. Team reads only that root's file: it does not search
ancestor directories and never creates the file for you.

The file is optional. Without it, dispatch uses the
[bundled selections](../skills/team/references/model-defaults.json). The
repository ignores the whole `.team/` directory, so a local override stays
untracked. Pipeline state is separate and lives under
`docs/plans/<id>/`.

## What it configures

Model selection for the hosts that load an agent definition's body instead of a
native agent file. Claude Code's named-agent dispatch reads native `model:` and
`effort:` frontmatter and ignores this file entirely. OpenCode makes no model
claim through it.

Bundled selections map each Claude tier to a host model:

| Agent `model:` | Codex model ID | Antigravity invocation tier |
| --- | --- | --- |
| `opus` | `gpt-6-astra` | `pro` |
| `sonnet` | `gpt-5.6-sol` | `flash` |
| `haiku` | `gpt-5.6-luna` | `flash_lite` |

An override replaces individual bundled selections, not the whole map. Tiers you
do not name keep their bundled value.

## Schema

```json
{
  "codex": {
    "sonnet": { "model": "gpt-5.6-terra", "reasoning_effort": "medium" }
  },
  "antigravity": {
    "sonnet": { "model": "flash" }
  }
}
```

- **Host keys:** only `codex` and `antigravity`.
- **Tier keys:** only `opus`, `sonnet`, and `haiku`.
- **Selection:** requires `model`. Codex also accepts `reasoning_effort`; no
  other fields are allowed.

### Codex

`model` must be a concrete model ID — not a Claude alias (`opus`, `sonnet`,
`haiku`), `fable`, or `inherit`. The optional `reasoning_effort` replaces the
agent's own effort; without it the agent's effort is preserved. Accepted
efforts: `low`, `medium`, `high`, `xhigh`, `max`, `ultra`.

### Antigravity

`model` must be one of `inherit`, `flash_lite`, `flash`, or `pro`. Antigravity
selects effort with the invocation tier, so there is no separate effort field.
`inherit` deliberately chooses the parent session's model.

## How overrides are validated

Before the first dispatch — and again if the host's provider or model
configuration changes — Team reads the running host's current capabilities.
Codex exposes its model catalog and supported reasoning efforts; Antigravity
exposes the `invoke_subagent` model enum.

Team rejects the file when it names an unknown host, tier, or field; omits
`model`; uses a Claude alias as a Codex model; or selects a model, tier, or
effort the host does not currently offer. A missing or invalid override is an
error, never a silent fall back to a default. The resolver validates selections
only — it does not query a provider or spawn an agent.

For the dispatch procedure and the full validation contract, see
[model selection](../skills/team/references/model-selection.md) and
[cross-host portability](cross-host-portability.md#model-selection).

## When validation runs

`.team/config.json` is validated at dispatch time, by the resolver, before a
body-loaded model selection is applied. Nothing validates it ahead of a prompt:
a present file that cannot be read, is not valid JSON, or fails the schema is
reported when the first dispatch needs a selection, not before. An absent file
is valid at every point.
