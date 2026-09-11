---
title: Overview
description: "Team orchestrates specialized agents that implement features end-to-end through the QRSPI pipeline."
permalink: /
audience: [user, developer]
nav_order: 1
nav_label: home
---

# Team

**You have been made tech lead. Your team never sleeps.**

## What is Team?

Team orchestrates 13 specialized agents. They range from isolated researchers to adversarial
reviewers. Together they drive a feature through an 8-phase pipeline (QRSPI) and deliver a
verified pull request.

Agents are decoupled microservices. Each one consumes a predecessor artifact on disk, does its
work, and writes its own artifact. The orchestrator is the main session. It walks a
linear phase table with no mid-run human gates. An adversarial design review gates the design,
and the human reviews the finished PR.

## The pipeline

```
WORKTREE → QUESTION → RESEARCH → DESIGN → STRUCTURE → PLAN → IMPLEMENT → PR
```

| Phase | What happens |
|-------|-------------|
| **Worktree** | The orchestrator prepares an isolated git worktree first. It authors `docs/plans/<id>/` inside that worktree. Your home checkout stays clean for the whole run. |
| **Question** | Decompose intent into `1-task.md` + neutral `2-questions.md`. The questioner is the only agent that ever sees your original description. |
| **Research** *(isolated)* | Parallel agents (file-finder + researcher) consume only `2-questions.md`. They never see the task. This isolation prevents opinion bias. |
| **Design** *(design review)* | The design author drafts a ~200-line alignment doc. It resolves its own open questions as recorded assumptions. An adversarial design review gates advancement. |
| **Structure** | Break the design into vertical slices with verification checkpoints. The document is about two pages. It advances to Plan with no gate. |
| **Plan** | The planner derives a tactical implementation plan from the structure. The implementer reads it. No gate applies. |
| **Implement** | Test-first → slice execution → 5 parallel reviewers + typed retry loop. |
| **PR** | Update changelog, commit, open pull request. |

## The governance stack

Every team you have worked on had rules that made its output trustworthy: an
author does not approve their own pull request, a design gets challenged before
it is built, security reads the change before it ships. Team ships those rules
as machinery rather than as manners.

| The rule | How Team enforces it |
|----------|----------------------|
| An author never approves their own work | Reviewers hold no `Write` or `Edit` tool and run in `plan` mode. Pinned by `tests/protocol.test.ts`, not requested in a prompt. |
| Review is not a rubber stamp | The implement loop re-runs until no Blocking or Major finding is left. There is no fixed number of rounds to outwait. |
| A reviewer cannot be lobbied | Reviewers read the diff and a spec written before the code existed, never the implementer's account of its own work. |
| The design is challenged before it is built | A fresh-context adversarial design review hard-gates the pipeline. |
| Nobody escalates to dodge a check | The orchestrator is forbidden from handing a blocking finding to the human mid-run. |
| Every decision is on the record | `docs/plans/<id>/` holds the task, the questions, the research, the design, every review verdict, and the plan. Files in the repo, not chat history. |

You cannot overrule the security reviewer by asking nicely. [Ethos](ethos.md)
explains why each rule exists.

## How far the delegation goes

Team's scope today is contained: a groomed ticket, one repository, a context
that already exists. Each rung above that hands Team a less framed problem — a
problem statement, then an outcome to move — until one person carries
company-significant work from problem definition through measured outcomes.
[Vision](vision.md) has the ladder.

## Install

Team installs from one local checkout using each host's native plugin mechanism.
The full pipeline runs on Claude Code, Codex CLI, and Antigravity CLI. OpenCode
support covers native skill/command discovery and installation. Execution limits
are listed beside setup. Pick yours.

### Claude Code

```bash
claude plugin marketplace add /path/to/team
claude plugin install team@team-dev
```

The first command registers the checkout as a marketplace; the second installs
from it. Skills register as slash commands (`/team`, `/shipit`), and agents and
hooks load with them.

Developing Team itself? Run the loop Claude Code documents for local plugins:

```bash
script/dev-install claude
```

Claude Code keys its plugin cache on the manifest version and reports "already
at the latest version" when it has not moved, so the install stamps a
`+claude.<timestamp>` cachebuster onto the manifests, refreshes the catalog,
installs, restores the manifests, and prunes the copy the last run left. The
install is a copy either way, so **re-run it after changing a skill.**

It also adds clone-local hooks that re-run it after merge and rebase pulls.
Existing non-Team hooks and a `core.hooksPath` outside the clone are never
overwritten: the install still completes, and reports that it skipped the hooks
and how to wire them up yourself. Remove the install and Team-owned hooks with:

```bash
script/dev-uninstall claude
```

**Turn on auto-update, or you stay on the version you installed.** Claude Code
enables auto-update for official Anthropic marketplaces by default and
**disables it for local development marketplaces** — which is what a local
checkout is. Without it, `git pull`ing this repo moves the source while your
installed copy stays pinned, silently, with nothing to tell you a release
happened. Toggle it in `/plugin` → **Marketplaces** → `team-dev` → **Enable
auto-update**, or declare it in `~/.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "team-dev": {
      "source": { "source": "directory", "path": "/path/to/team" },
      "autoUpdate": true
    }
  }
}
```

Claude Code then checks after a session starts, on a random delay of up to ten
minutes, so the running session keeps what it launched with. When a plugin
updates you are prompted to run `/reload-plugins` — a full restart is not
needed. To update on demand instead, refresh the marketplace before the plugin:

```bash
claude plugin marketplace update team-dev
claude plugin update team@team-dev
```

The order matters. `plugin update` reads the cached catalog, so on its own it
reports nothing to do.

Then run a phase end-to-end:

```bash
/team Add rate limiting middleware to all API endpoints
```

For a focused bug fix that skips the QRSPI ceremony:

```bash
/team-fix Users see stale cache after profile update
```

### Codex CLI

```bash
codex plugin marketplace add /path/to/team
codex plugin add team@team-dev
```

The install copies the checkout into Codex's plugin cache and reads every skill
from the plugin's own `skills/<name>/SKILL.md`, so a later `codex plugin add`
picks up new skills with no extra links and no sync step. Remove it with:

```bash
codex plugin remove team@team-dev
```

Skills arrive **namespaced** — ask for `team:shipit`, not `shipit`. Codex
budgets its skill catalog, so it shortens the longest descriptions; the skills
still work.

Developing Team itself? Run the loop Codex documents for local plugins:

```bash
script/dev-install codex
script/dev-uninstall codex
```

Codex keys its plugin cache on the manifest version, so the install stamps a
`+codex.<timestamp>` cachebuster onto it, reinstalls, restores the manifest,
and prunes the copy the last run left. The install is a copy either way, so
**re-run it after changing a skill** and start a new Codex thread.

**Installed Team for Codex before?** An earlier version of `script/dev-install
codex` linked `~/.agents/skills/team` at the checkout's whole `skills/`
directory. Keeping that link alongside a plugin install registers every skill
twice, which halves the description budget Codex renders each one with. Both
`script/dev-install codex` and `script/dev-uninstall codex` remove it for you.

### Antigravity CLI

```bash
agy plugin install /path/to/team
```

Team ships `plugin.json` at the repo root, which is this host's plugin marker,
so it installs as a native Antigravity plugin — every skill and every agent
installs with it. `agy plugin uninstall team` removes it.

Skills arrive under **bare names** — ask for `shipit`, not `team:shipit`. The
install copies the checkout, so upgrading means installing again.

Developing Team itself? The install copies, so link your checkout instead:

```bash
script/dev-install antigravity
script/dev-uninstall antigravity
```

### OpenCode

Requires **Node.js** for registration/removal and **OpenCode** for use. From a
local Team checkout or linked Git worktree:

```bash
script/dev-install opencode
script/dev-uninstall opencode
```

Or use `dev install opencode` / `dev uninstall opencode`. With no host argument,
`script/dev-install` and `script/dev-uninstall` attempt every supported host;
`dev install` and `dev uninstall` dispatch the same way.

Registration links `plugins/team.js` to that checkout's `opencode/team.js`.
The config directory is nonempty `OPENCODE_CONFIG_DIR`, otherwise
`${XDG_CONFIG_HOME:-$HOME/.config}/opencode`. Relative overrides resolve against
where you run the command. Spaces and Unicode work. Team rejects canonical
checkout and skill paths containing `$`, backticks, or `@` because OpenCode
interprets those characters in command templates. Relocate such a checkout before installing.

Restart OpenCode after installation, removal, or checkout edits. New processes
read current canonical skills without reinstalling or copying them. Keep the
checkout available. Install success means **registered**, not that your native
configuration parsed or the plugin loaded. Registration neither reads nor rewrites
OpenCode JSON/JSONC, credentials, or other plugins. Native configuration errors
surface when OpenCode starts.

Reinstalling from the same checkout succeeds. Another checkout's link, a regular
file, or a directory at the target causes refusal. Uninstall from the owning
checkout before switching. Uninstall removes only the matching link, even if its
runtime target is now missing. It retains config/plugin parent directories. Run
removal before deleting the entire checkout, because removal needs its lifecycle
scripts.

A busy or stale `plugins/team.js.lock` stops either operation. Confirm no
install/uninstall process remains, then manually remove that empty lock directory
with `rmdir` and rerun. Team never breaks locks automatically.

**Supported:** native registration, skill discovery, canonical file-reading
commands, and this lifecycle. Full QRSPI execution, specialist/nested dispatch,
reviewer isolation, and hook behavior on OpenCode remain unverified. `/reflect`
appears in the command menu but OpenCode session reflection is unsupported.
Methodology skills marked `user-invocable: false` also appear as commands.
See [OpenCode support](cross-host-portability.md#opencode) for command permissions, native argument preprocessing,
external skill sources, and discovery diagnostics.

## Read next

- **[Vision](vision.md)**: the loop-driven end state Team builds toward.
- **[Ethos](ethos.md)**: the principles that make the autonomous middle trustworthy.
- **[Architecture](architecture.md)**: full design, artifact frontmatter, phase-inference rules.
- **[Skills](skills.md)**: all skills, each with the skills it mentions.
- **[Cross-host portability](cross-host-portability.md)**: the capability matrix for Codex CLI, the Antigravity CLI host facts, and the chosen portability strategy.
- **[GitHub repository](https://github.com/bostonaholic/team)**: source, agents, skills.
