---
topic: codex-skills-install
date: 2026-07-30
phase: task
ticketId: "57"
---

# Task: codex-skills-install

## Description

The most important thing to implement next is getting Team's skills
installed for Codex CLI. Concretely:

- Find out how Codex CLI wants global (user-scope) skills installed —
  on-disk layout, discovery rules, frontmatter it reads.
- Find out whether Codex has a packaging/plugin/extension mechanism that
  registers a bundle of skills at once.
- Find out whether Codex supports a symlinked/linked-in-place install,
  analogous to the symlink swap this repo already does for Claude Code
  local dev installs (`script/dev-install` / `script/dev-uninstall`), and
  if so, build the Codex equivalent.
- The existing-GitHub-issue question is already answered: this tracks
  against **#57** ("Port Team to run inside Codex CLI ..."), open, label
  `enhancement`, board status "In progress". This run implements only the
  **skills-installation slice** of that epic — not agents-as-TOML-roles,
  hook adaptation, or `.team/config.json`, which are sibling slices
  unless research shows the skills install can't stand alone.

## Stated goal

Get Team's 51 skills installed and discoverable so they work under Codex
CLI, the same way they already work for Claude Code.

## Inferred goal

Give a Team maintainer/contributor a repeatable way to make Team's skill
bodies discoverable and invocable inside a Codex CLI session — via
whatever layout and, ideally, live-editable (symlink-based) dev install
Codex actually supports — without waiting on the rest of the #57 epic.
Issue #57 (already open, in progress) is the demand signal; this is the
next slice of already-prioritized work, not speculative scope.

## Acceptance signals

- A Codex CLI session discovers and invokes at least one Team skill body
  without hand-copying files in each time.
- A scripted or documented install path exists for Codex, ideally
  symlink-based like `script/dev-install`, so skill edits stay live
  without a reinstall step.
- Skill bodies carrying Claude Code-specific assumptions (tool names,
  dispatch verbs, `${CLAUDE_PLUGIN_ROOT}`-style vars) that won't resolve
  under Codex are identified, per the "Hidden Claude Code assumptions"
  risk already logged in `docs/cross-host-portability.md`.
- Existing skills-tree tests/tripwires (e.g. `tests/static-gate.test.ts`,
  `tests/architecture.test.ts`, `tests/methodology.test.ts`) still pass,
  or are deliberately updated.

## Open assumptions

- Scope is the skills-installation slice of #57 only; sibling slices
  (agents-as-TOML, hooks, `.team/config.json`) are out unless research
  says the skills install can't be built/verified without them.
- Single-repo topic — no `repos.md` written.
- The install mechanism is developer/dev-install tooling (parallel to
  `script/dev-install`, itself dev tooling per `CLAUDE.md`'s
  runtime-vs-development split), since Team has no distributed
  Codex-facing packaging step yet comparable to `.claude-plugin/plugin.json`.
- `docs/cross-host-portability.md`'s Codex section (skills map to
  `.agents/skills/SKILL.md`, description-matched invocation) was verified
  2026-06-27. Today is 2026-07-30 and Codex's surface is young and
  moving, so claims need re-verification against current upstream
  Codex docs/source, not acceptance as settled fact.
- No PRD written: the request is bounded by the existing tracking issue
  and its explicitly scoped slice, not vague or multi-story.
