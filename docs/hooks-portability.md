---
title: Hook portability
description: "The hook × host matrix for Team's runtime hooks: every copy, its registration, its blocking semantics, and exactly which cells are verified against a running host."
audience: [developer]
nav_order: 8
nav_label: hooks
---

# Hook portability

Team's runtime hooks are ported across Claude Code, Codex CLI, Antigravity CLI,
and OpenCode — every host has a binding, but a binding is not the same as a
verified run. Claude keeps the canonical `hooks/*.mjs` files. Codex and
Antigravity get host-specific duplicates under `hooks/<host>/`. OpenCode drives
the canonical files through adapters in `opencode/team.js`. This page is the
single source of truth for where every copy lives, how it registers, what it
can block, and exactly what was verified.

The **hook × host matrix** is the durable record. The live probe transcript
(host version, exact command, input, exit code, observed output) lives in the
gitignored run artifact
`docs/plans/2026-09-15-port-runtime-hooks/verification-report.md`.

## Status vocabulary

- **verified (program)** — the program was spawned with the host's real stdin
  shape and produced the expected exit code and output channel; a live probe is
  in the report. This proves the *program contract* only.
- **unverified** — no probe was run.
- **gap** — the host exposes no equivalent event or output channel. Named, never
  claimed as supported.

**Program contract verified by direct invocation; host-firing unverified.**
Every `verified (program)` cell means the program was driven directly, not that
a running host invokes it — installing the modified plugin into each host's
global cache was out of scope, so host-firing is unverified for every host,
Claude included. No cell is claimed "supported" on wiring alone. Direct
invocation of a hook program proves the program, not the host registration path.

## Matrix

Blocking semantics describe the strongest failure channel the host honors for
that event. "none" means the hook always exits 0 and only adds context.

| Hook | Host | File path | Event name | Registration file | Blocking semantics | Status | Verified host version + date |
|---|---|---|---|---|---|---|---|
| `session-start-recover` | Claude Code | `hooks/session-start-recover.mjs` | `SessionStart` | `.claude-plugin/plugin.json` | none — exit 0, stderr `hookSpecificOutput.additionalContext` | verified (program); host-firing unverified | 2.1.270, 2026-09-15 |
| `pre-compact-anchor` | Claude Code | `hooks/pre-compact-anchor.mjs` | `PreCompact` | `.claude-plugin/plugin.json` | none — exit 0, stderr `hookSpecificOutput.additionalContext` | verified (program); host-firing unverified | 2.1.270, 2026-09-15 |
| `post-write-validate` | Claude Code | `hooks/post-write-validate.mjs` | `PostToolUse` (`Write\|Edit`) | `.claude-plugin/plugin.json` | exit 1 does not block; stderr `hookSpecificOutput.additionalContext` | verified (program); host-firing unverified | 2.1.270, 2026-09-15 |
| `validate-team-config` | Claude Code | `hooks/validate-team-config.mjs` | `UserPromptSubmit` | `.claude-plugin/plugin.json` | exit 2 blocks; stderr reason | verified (program); host-firing unverified | 2.1.270, 2026-09-15 |
| `session-start-recover` | Codex CLI | `hooks/codex/session-start-recover.mjs` | `SessionStart` | `.codex-plugin/plugin.json` → `hooks/hooks.json` | none — exit 0, stdout `hookSpecificOutput` | verified (program); host-firing unverified | 0.154.0, 2026-09-15 |
| `pre-compact-anchor` | Codex CLI | `hooks/codex/pre-compact-anchor.mjs` | `PreCompact` | `.codex-plugin/plugin.json` → `hooks/hooks.json` | none — exit 0, stdout `hookSpecificOutput` | verified (program); host-firing unverified | 0.154.0, 2026-09-15 |
| `post-write-validate` | Codex CLI | `hooks/codex/post-write-validate.mjs` | `PostToolUse` (`apply_patch`) | `.codex-plugin/plugin.json` → `hooks/hooks.json` | exit 2 blocks; stderr reason | verified (program); host-firing unverified | 0.154.0, 2026-09-15 |
| `validate-team-config` | Codex CLI | `hooks/validate-team-config.mjs` (reused canonical) | `UserPromptSubmit` | `.codex-plugin/plugin.json` → `hooks/hooks.json` | exit 2 blocks; stderr reason | verified (program); host-firing unverified | 0.154.0, 2026-09-15 |
| `session-start-recover` | Antigravity CLI | — | no `SessionStart` event | — | n/a | gap | 1.2.3, 2026-09-15 |
| `pre-compact-anchor` | Antigravity CLI | — | no `PreCompact` event | — | n/a | gap | 1.2.3, 2026-09-15 |
| `post-write-validate` | Antigravity CLI | — | `PostToolUse` (output `{}`) | — | cannot block or inject | gap | 1.2.3, 2026-09-15 |
| `validate-team-config` | Antigravity CLI | `hooks/antigravity/validate-team-config.mjs` | `PreInvocation` | `hooks.json` (keyed by plugin name `team`) | cannot block; stdout `injectSteps` only | verified (program); host-firing unverified | 1.2.3, 2026-09-15 |
| `session-start-recover` | OpenCode | `opencode/team.js` (`experimental.chat.system.transform`) | `experimental.chat.system.transform` | `opencode/team.js` | none — mutates `output.system`, cached per session | verified (program); host-firing unverified | 1.18.30, 2026-09-15 |
| `pre-compact-anchor` | OpenCode | `opencode/team.js` (`experimental.session.compacting`) | `experimental.session.compacting` | `opencode/team.js` | none — mutates `output.context` | verified (program); host-firing unverified | 1.18.30, 2026-09-15 |
| `post-write-validate` | OpenCode | `opencode/team.js` (`tool.execute.after`) | `tool.execute.after` | `opencode/team.js` | throws; the tool call reports the failure | verified (program); host-firing unverified | 1.18.30, 2026-09-15 |
| `validate-team-config` | OpenCode | — | no prompt-block hook | — | n/a | gap | 1.18.30, 2026-09-15 |

The shared validator `hooks/lib/validate-plugin-file.mjs` is a library, not a
hook; it is called by Claude `post-write-validate.mjs`, Codex
`post-write-validate.mjs`, and OpenCode `tool.execute.after`.

## Duplicated hooks, listed

Duplication is deliberate: a host whose stdin, output envelope, or exit-code
contract differs gets a readable host-native copy rather than a compatibility
layer. Every duplicated copy's header names its siblings and its exact divergence.

| Logical hook | Canonical copy | Codex copy | Antigravity copy | OpenCode binding |
|---|---|---|---|---|
| `session-start-recover` | `hooks/session-start-recover.mjs` | `hooks/codex/session-start-recover.mjs` | — (event absent) | `opencode/team.js` reuses canonical |
| `pre-compact-anchor` | `hooks/pre-compact-anchor.mjs` | `hooks/codex/pre-compact-anchor.mjs` | — (event absent) | `opencode/team.js` reuses canonical |
| `post-write-validate` | `hooks/post-write-validate.mjs` | `hooks/codex/post-write-validate.mjs` | — (cannot block) | `opencode/team.js` calls the shared validator |
| `validate-team-config` | `hooks/validate-team-config.mjs` | reused canonical | `hooks/antigravity/validate-team-config.mjs` | — (no block channel) |

The two recovery hooks keep a **byte-identical inference region** across all
four recovery copies — `hooks/session-start-recover.mjs`,
`hooks/pre-compact-anchor.mjs`, `hooks/codex/session-start-recover.mjs`, and
`hooks/codex/pre-compact-anchor.mjs` — from `const ID_RE` to
`async function main(`.

## Per-host notes

### Claude Code

The canonical files and `.claude-plugin/plugin.json` are the unchanged
baseline. Recovery hooks write their envelope to **stderr** (context only);
`post-write-validate` exits 1 and `validate-team-config` exits 2. Each row's
program contract was verified by direct invocation; host-firing is unverified
(see the status vocabulary above).

### Codex CLI

- **Plugin hook envelope.** Codex parses a plugin hook file as
  `codex_config::HooksFile` — a struct with a top-level `hooks` object and
  `deny_unknown_fields` — not Claude's inline event map. `hooks/hooks.json`
  wraps its event map in `hooks` accordingly. Verified against codex-cli
  0.154.0 source (`codex-rs/config/src/hook_config.rs`,
  `codex-rs/core-plugins/src/loader.rs`); a live host-firing probe was not run.
- **Registration path.** `.codex-plugin/plugin.json` sets
  `"hooks": "./hooks/hooks.json"`. Codex's plugin loader honours a manifest
  `hooks` path, or falls back to `<plugin-root>/hooks/hooks.json` when the field
  is absent.
- **Root `hooks.json` is not a collision.** Codex reads JSON hooks from a config
  layer's own folder (`<config-folder>/hooks.json`, i.e. `.codex/hooks.json`
  for a project) or from a plugin's registered `hooks` file — never from a bare
  plugin-root `hooks.json`. The Antigravity root `hooks.json` is therefore
  invisible to Codex. The Antigravity root `plugin.json` is likewise ignored as
  an Agent Plugins manifest because it carries no `$schema`, so Codex selects
  `.codex-plugin/plugin.json` and loads plugin hooks normally.
- **Trust gate.** Project-local Codex hooks and agents load only when the
  directory is trusted. An untrusted directory skips them without warning. See
  [cross-host portability](cross-host-portability.md#edge-cases).
- **Commands are anchored to `${PLUGIN_ROOT}`.** Codex 0.154.0 injects
  `PLUGIN_ROOT`, `CLAUDE_PLUGIN_ROOT`, `PLUGIN_DATA`, and `CLAUDE_PLUGIN_DATA`
  into a plugin hook command's environment
  (`hooks/src/engine/discovery.rs`, `append_plugin_hook_sources`). Every
  `hooks/hooks.json` command names its script as
  `node "${PLUGIN_ROOT}/hooks/<script>.mjs"`, so the path resolves inside the
  plugin and never against the user's project. If the variable is unpopulated
  the command cannot resolve and Codex fails safe — it no-ops rather than
  executing a project-local `hooks/` file of the same name. The variable's live
  population is not separately probed; host-firing is unverified.
- **Hook bodies resolve their own directory.** Each duplicate still derives the
  plugin root from `import.meta.url` when it imports the shared validator, so a
  renamed variable cannot mis-resolve the module import.
- **`PreCompact` injection is unproven.** Codex exposes the event and the copy
  emits the stdout envelope, but whether Codex forwards `additionalContext` to
  the model on compaction is not confirmed. Treat that cell as
  verified-program / unverified-injection.

### Antigravity CLI

- **Registers through a root `hooks.json`.** A bundled `hooks/` directory is
  not discovered; the root `hooks.json` is keyed by plugin name (`team`) and
  holds a flat `PreInvocation` handler array.
- **Command cwd anchors the path.** Antigravity documents that a hook command's
  cwd is the directory containing `hooks.json` — the plugin root — so the
  relative command `node hooks/antigravity/validate-team-config.mjs` resolves
  inside the plugin, never against the user's project. `${PLUGIN_ROOT}` is not
  used here because its interpolation on Antigravity is unconfirmed; the cwd
  contract is the one that can be defended.
- **No `SessionStart` or `PreCompact`.** Those events do not exist on the
  public surface, so recovery and compaction are named gaps — never stubbed.
- **`PostToolUse` cannot block or inject.** Its output is `{}`, so
  `post-write-validate` has no failure channel and is a named gap.
- **`PreInvocation` can warn but not block.** `validate-team-config` emits
  `{"injectSteps":[{"ephemeralMessage":"..."}]}` and the prompt proceeds. It is
  the one partial binding, not a guard.

### OpenCode

- **No prompt-block hook.** There is no event that can reject or block a prompt,
  so `validate-team-config` is a gap. The nearest candidate — throwing from
  `chat.message` — is unprobed.
- **Recovery and compaction reuse the canonical files.** `team.js` spawns
  `hooks/session-start-recover.mjs` and `hooks/pre-compact-anchor.mjs` with the
  user's project as `cwd` and the host-shaped stdin `{"cwd": <project>}`, then
  parses their stderr envelope. Recovery context is cached per `sessionID`
  because the host rebuilds `output.system` on every call.
- **Write validation throws.** `tool.execute.after` calls the shared validator
  and throws on a failure so the tool call reports it. A path outside the
  project is skipped; a spawn, parse, or filesystem error throws nothing.
- **Host-firing unverified.** The adapters were driven in-process with the real
  callback signatures; a running OpenCode session was not exercised.
