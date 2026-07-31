---
title: Codex CLI
description: "How to install Team's skills into Codex CLI: the two install shapes, the qualified names to type, and what degrades on this host."
audience: [user, developer]
nav_order: 10
nav_label: codex
---

# Codex CLI: install Team's skills

Codex CLI reads Claude Code's plugin manifest natively. It discovers
`.claude-plugin/plugin.json` and loads the `skills/` tree directly. No
build step is necessary for skills. Two install shapes exist: the native
plugin for end users, and a symlink script pair for maintainers. All
facts on this page were verified on `codex-cli 0.145.0` on 2026-07-30.

**Always type the qualified name.** Codex prefixes each skill with the
plugin name, so the skills surface as `team:<name>` — `team:shipit`,
`team:code-review`, `team:team-fix`. The `$` sigil appears only when you
write a mention in a prompt, for example `$team:shipit`.

## Shape 1: native plugin (end users)

Run two commands from any directory:

```bash
codex plugin marketplace add <source>   # local path or owner/repo
codex plugin add team@team-dev
```

Codex copies the source into its plugin cache and serves all 51 skills
as `team:<name>`. The copy is versioned and stable. It is not
live-editable.

### Limitation: truncated descriptions

Codex budgets the injected skill catalog. With all 51 skills installed,
41 descriptions truncate at about 183 characters. Codex selects skills
by description match, so a truncated description loses most of its
trigger phrases. Three named losses matter most:

- `team:shipit` loses its explicit-ship-intent-only rule: "never infer
  ship intent from a PR merely being approved, green, or finished".
- `team:pr-approve-watch` loses both guardrails: approval is the only
  write action, and the auto-merge caution.
- `team:groom-backlog` loses "nothing on the tracker changes before the
  user answers".

`team:pr-approve-watch` fails twice on this shape. Codex ignores
`disable-model-invocation`, so the skill is implicitly invocable, *and*
its caution is truncated. Both protections fail together. The dev
script shape below refuses to install this skill for exactly this
reason.

## Shape 2: dev script pair (maintainers)

`script/codex-dev-install` and `script/codex-dev-uninstall` (`dev.yml`:
`codex-install` / `codex-uninstall`). The installer creates one symlink
per skill under `team/` in the resolved physical path of
`~/.agents/skills`, skipping any skill whose frontmatter sets
`user-invocable: false` or `disable-model-invocation: true`. The set is
re-derived on every run (16 skills as of 2026-07-30). The links point
into the checkout, so edits are live. The linked set fits the catalog
budget whole — zero truncation — and the one skill whose safety depends
on a key Codex ignores is excluded outright (next section).

Discoverable is not functional: eleven of the 16 links are pipeline
entry points whose procedures dispatch Claude Code agents, and Codex
cannot run those agents. On Codex the bodies load and read, but they
cannot execute the pipeline they describe. The near-term value is the
five functional skills — the four standalone utilities that install
here plus `team:code-review`.

### Excluded: `team:pr-approve-watch`

The installer never links `team:pr-approve-watch`. That skill sets
`disable-model-invocation: true` for a reason: on a PR with auto-merge
enabled, an approval can transitively trigger an irreversible merge, so
only a deliberate human invocation should arm the watch. Codex ignores
the key, which would silently downgrade a hard guard to prose — at user
scope, in every session, with no trust prompt. The host cannot honor
the guard, so the safe projection is not to install the skill.

A user who understands the exposure can link it manually:

```bash
ln -s "$(pwd)/skills/pr-approve-watch" ~/.agents/skills/team/pr-approve-watch
```

A re-run of `codex-dev-install` rebuilds `team/` from the filter and
drops the manual link, so re-add it after each install.

### Never port the `dev-install` cache swap

Claude Code's `script/dev-install` replaces the plugin cache directory
with a symlink to the checkout. That trick breaks Codex two ways:

- `codex plugin add` copies the source and silently drops symlinks
  (research run 2).
- When the cache directory is replaced with a symlink, Codex reports the
  plugin `not installed` and the catalog drops to zero skills (research
  run 3).

Also, `codex plugin add` on a dev checkout copies `.claude/worktrees/`
into the cache — hundreds of stray files. Maintainers must use the
script shape, not the plugin shape.

### Self-check: mismatch fails, truncation reports

After linking, the installer runs `codex debug prompt-input` (no API
call, no authentication) and compares the catalog entries whose cited
source path lives in this checkout against the links it created — the
path anchor keeps a co-tenant description that merely contains a
`team:<word>` string from polluting the comparison. A link-vs-catalog
mismatch fails: the script exits non-zero and prints both sets. The
links remain installed after a mismatch — the script does not roll
back — so run `script/codex-dev-uninstall` to remove them. A truncation
warning reports: the script prints it loudly and exits 0, because the
budget is global and co-tenant skills can cause the warning through no
fault of Team's set.

### Cross-worktree hazard

This repo works from `.claude/worktrees/` checkouts. A run from a
worktree and then a run from `main` is last-writer-wins: the second run
replaces the links, and Codex serves the second tree. The diagnostic is
the source root the script echoes on every run, plus
`codex debug prompt-input` to see which paths the catalog cites.

## The catalog budget, bounded both ways

Codex caps the injected catalog with an either/or rule: 2% of the model
context window in tokens when the window is known, or 8,000 characters
when it is not. The 16 linked descriptions inject 5,701 characters —
2,299 characters of headroom on the 8,000-character arm. The token arm
fits at a context window of at least ~71,300 tokens. Below that floor,
truncation returns.

The filter buys most of that fit. The five functional skills alone (the
four standalone utilities that install here plus `team:code-review`)
total 2,830 description characters, a floor near ~35,400 tokens. The
eleven pipeline entry-point links add 2,871 characters (~50% of 5,701)
and roughly double the floor. The budget is also global, not per-plugin: the
research machine carries 35 co-tenant skills in an 86-entry catalog, and
every co-tenant description charges the same budget.

## Skills bypass Codex trust

Codex's trust gate covers project-local config, hooks, and exec
policies. Skills are not in that set. A user-scope install — either
shape above — exposes the skills to every Codex session on the machine,
with no prompt. Install only what you intend every session to see.

## Claude Code-specific bodies

As of 2026-07-30, 21 of the 51 skill bodies hold Claude Code-specific
references: 16 entry points (host-specific by construction) and 5
methodology skills. `CLAUDE_PLUGIN_ROOT` appears in exactly one body,
`skills/nested-agents/SKILL.md:35`. These bodies load on Codex, but
their host-specific instructions (tool names, `/slash` syntax, Claude
Code version pins) do not apply there. A 52nd skill makes these counts
historical, not wrong.

## Cross-references and the cwd

The linked bodies reference methodology skills by relative path
(`skills/<name>/SKILL.md`). Those paths resolve mechanically only when
the session's cwd is the Team checkout root. Elsewhere, methodology
loading degrades: the model must find the file some other way. One help:
the catalog renders the **canonicalized checkout path** for every entry,
not the symlink path (verified 2026-07-30 — each entry cites
`<checkout>/skills/<name>/SKILL.md`). A session away from the checkout
can follow that absolute path to the real files.
