# Team

A plugin that orchestrates specialized agents to autonomously implement entire features end-to-end, driven by the **QRSPI** workflow. The orchestrator is the main Claude Code session. It persists pipeline state as artifacts in `docs/plans/` and tracks live progress with TodoWrite.

Team installs on Claude Code, on Codex CLI, and on Antigravity CLI. The full pipeline needs Claude Code, because that is the host that dispatches the agents. The standalone utilities work on all three.

**Documentation:** [team.bostonaholic.dev](https://team.bostonaholic.dev)

## Install

Team ships a native manifest for each host, so one repo installs on all three
from a local checkout. Pick yours.

<details>
<summary><strong>Claude Code</strong></summary>

```bash
claude plugin add /path/to/team
```

That is the whole install. Skills register as slash commands (`/team`,
`/shipit`), and agents and hooks load with them.

</details>

<details>
<summary><strong>Codex CLI</strong></summary>

```bash
codex plugin marketplace add /path/to/team
codex plugin add team@team-dev
```

Skills arrive **namespaced** — ask for `team:shipit`, not `shipit`. Codex budgets
its skill catalog, so it shortens the longest descriptions; the skills still
work. The `/team-*` pipeline commands load but cannot dispatch Claude Code
agents, so they will not run the pipeline. The standalone utilities do.

> **Two skills lose a safety guard here.** `team:pr-watch-as-reviewer` casts an
> approval that can transitively merge a PR, and `team:pr-rebase` force-pushes a
> rewritten branch over published history. Both set `disable-model-invocation`
> so only a person can start them, and **Codex ignores that key**. To keep the
> guards:
>
> ```bash
> rm -rf "$CODEX_HOME/plugins/cache"/*/team/*/skills/pr-watch-as-reviewer
> rm -rf "$CODEX_HOME/plugins/cache"/*/team/*/skills/pr-rebase
> ```
>
> Re-running `codex plugin add` restores them.

</details>

<details>
<summary><strong>Antigravity CLI</strong></summary>

```bash
agy plugin install /path/to/team
```

Team ships `plugin.json` at the repo root, which is this host's plugin marker,
so it installs as a native Antigravity plugin — all 54 skills and all 13 agents.
`agy plugin uninstall team` removes it.

Skills arrive under **bare names** — ask for `shipit`, not `team:shipit`. The
install copies the checkout, so upgrading means installing again. Unlike Codex,
this host honors `disable-model-invocation`, so nothing needs removing
afterward. The `/team-*` pipeline commands install but are not claimed to run
here yet, because agent dispatch on this host is untested.

Developing Team itself? The install copies, so link your checkout instead:

```bash
script/dev-install antigravity
script/dev-uninstall antigravity
```

</details>

## Usage

```
/team Add rate limiting middleware to all API endpoints
```

For well-understood bugs, skip the QRSPI ceremony:

```
/team-fix Users see stale cache after profile update
```

Or run individual phases:

```
/team-worktree docs/plans/<id>/
/team-question Add rate limiting middleware to all API endpoints
/team-research docs/plans/<id>/
/team-design docs/plans/<id>/
/team-structure docs/plans/<id>/
/team-plan docs/plans/<id>/
/team-implement docs/plans/<id>/
/team-pr docs/plans/<id>/
```

In a full `/team` run the home worktree is created automatically at the leading WORKTREE phase.
Invoked standalone, `/team-worktree` consumes `plan.md` (post-PLAN). Use it for manual recovery
or multi-repo setup.

Each downstream command takes the artifact directory `docs/plans/<id>/` as
its argument.

## Design philosophy

Each agent does work and returns an artifact. The orchestrator dispatches the next agent based on a phase table. Agents remain decoupled: they know nothing about each other.

## Pipeline (QRSPI)

```
WORKTREE → QUESTION → RESEARCH → DESIGN → STRUCTURE → PLAN → IMPLEMENT → PR
```

- **Worktree.** Orchestrator prepares an isolated git worktree first and authors `docs/plans/<id>/` inside it, keeping the home checkout's `git status` clean for the whole run.
- **Question.** Decompose intent into a full task record (`task.md`) and neutral research questions (`questions.md`). The questioner is the only agent that ever sees the user's original description.
- **Research** *(isolated)*. Parallel agents (file-finder + researcher) consume only `questions.md`. They never see the task. This structurally prevents opinion-bias in research findings.
- **Design** *(design review)*. Design author drafts a ~200-line alignment doc, resolving its own open questions as recorded assumptions. An adversarial design review gates advancement.
- **Structure.** Break the design into vertical slices with verification checkpoints. Produced autonomously. Advances to Plan with no gate.
- **Plan.** Tactical implementation plan derived from the structure. Read by the implementer. Not gated.
- **Implement.** Test-first, where test-architect writes failing tests and a mechanical gate checks them and the project's static checks. Then slice execution, where implementer commits each vertical slice atomically. Then adversarial verification, with 5 parallel reviewers and a typed failure-class retry loop, capped at 5 rounds.
- **PR.** Update changelog, commit, open pull request with inline UI screenshots when applicable, surface the tracking item.

## Screenshots in PRs

For UI-touching changes, the pipeline attaches visual evidence to the PR. The ux-reviewer
captures screenshots of the affected pages during Implement. `/team-pr` then uploads them
through GitHub's user-attachments pipeline, so they render inline in a `## Screenshots` section
of the PR body. Non-UI changes never get the section. Any capture or upload failure degrades to
a visible note with local file paths, so the PR always opens.

The images stay current the same way the description does. Every follow-up
push refreshes both: a push that changes the UI re-captures and re-uploads
the screenshots, and a push that leaves the UI alone keeps the ones already
embedded.

Inline upload needs a one-time GitHub sign-in in a dedicated browser profile
at `${XDG_CONFIG_HOME:-$HOME/.config}/team/github-profile/`. `gh auth login`
is not enough, because the CLI token is not a GitHub web session and the
user-attachments upload works through the browser. Run:

```sh
mkdir -p "${XDG_CONFIG_HOME:-$HOME/.config}/team/github-profile"
chmod 700 "${XDG_CONFIG_HOME:-$HOME/.config}/team/github-profile"
npx playwright codegen \
  --user-data-dir="${XDG_CONFIG_HOME:-$HOME/.config}/team/github-profile" \
  https://github.com
```

This opens a headed Chromium (a visible browser window) bound to that
profile: sign in to github.com once in that window, then close it. The
profile holds a full **unencrypted** github.com web session. To reset or
revoke it, sign out of github.com inside that profile or delete the
directory. Until you sign in, PRs carry local screenshot paths instead of
inline images.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full architecture, the artifact frontmatter schema, and the phase-inference rules.

## Components

- **13 agents** in `agents/`: decoupled workers that read predecessor artifacts from `docs/plans/` and write their outputs there
- **54 entry-point + methodology skills** in `skills/`: slash commands, the standalone `/shipit`, `/pr-open-comments`, `/pr-watch-as-author`, `/pr-watch-as-reviewer`, `/groom-backlog`, `/pr-cleanup`, `/pr-verify`, and `/pr-rebase` utilities, and shared methodologies
- **3 hooks** in `hooks/`: `docs/plans/`-aware compaction resilience and plugin-file validation
- **1 registry** at `skills/team/registry.json`: phase-tagged inventory of the 13 agents
- **State** lives in `docs/plans/<id>/*.md`, where `<id>` is `<TICKET>-<topic>` or `<YYYY-MM-DD>-<topic>`. Each artifact carries YAML frontmatter (`topic`, `date`, `phase`). `design.md` also carries `revision`, and review verdicts live in `design-review-<n>.md`. Live in-session coordination uses TodoWrite.
