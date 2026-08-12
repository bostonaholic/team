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

Team ships `.codex-plugin/plugin.json` and `.agents/plugins/marketplace.json`
— the manifests Codex looks for first — and takes `skills/` as the plugin's
skill root, so nothing needs building or converting.

Two differences worth knowing. Skills arrive **namespaced** — ask for
`team:shipit`, not `shipit`. And Codex budgets its skill catalog, so with
all 54 skills present it shortens the longer descriptions; the skills still
load and still work.

> **Two skills lose a safety guard on Codex.** On Claude Code
> `team:pr-watch-as-reviewer` and `team:pr-rebase` both set
> `disable-model-invocation`, so only a person can start them — the first
> casts an approval that can transitively merge a PR with auto-merge
> enabled, and the second force-pushes a rewritten branch over published
> history. **Codex ignores that key**, so the model can invoke either one,
> in every session, with no prompt: skills bypass Codex's trust gate. Each
> skill's own description says it is user-only, but that sentence is past
> the point where Codex truncates. To keep the guards, remove the skills
> after installing:
>
> ```bash
> rm -rf "$CODEX_HOME/plugins/cache"/*/team/*/skills/pr-watch-as-reviewer
> rm -rf "$CODEX_HOME/plugins/cache"/*/team/*/skills/pr-rebase
> ```
>
> Re-running `codex plugin add` restores them.

The `/team-*` pipeline commands load on Codex but cannot dispatch Claude
Code agents there, so they will not run the pipeline. The standalone
utilities — `team:shipit`, `team:pr-watch-as-author`, `team:pr-open-comments`,
`team:groom-backlog`, `team:code-review` — work as they do on Claude Code.

</details>

<details>
<summary><strong>Antigravity CLI</strong></summary>

```bash
agy plugin install /path/to/team
```

Team ships `plugin.json` at the repo root — this host's own plugin marker, with
`skills/` and `agents/` beside it where Antigravity resolves them — so it
installs Team as a native Antigravity plugin, not as an imported Claude Code
one. `agy plugin list` shows it afterwards, and `agy plugin uninstall team`
removes it. All 54 skills and all 13 agents install. Measured against `agy`
1.1.12.

Two differences worth knowing. Skills arrive under **bare names** — ask for
`shipit`, not `team:shipit` — because this host takes each skill's catalog name
from its own frontmatter rather than from where the file sits. And the install
copies the checkout, so pulling a new version of Team means installing again.

Unlike Codex, **Antigravity honors `disable-model-invocation`**, so
`pr-watch-as-reviewer` and `pr-rebase` keep the guard that makes them
user-only, and nothing needs removing after installing. Measured: with the
plugin installed, neither one appears in the model's own list of available
skills, while the other 52 do.

The 13 agents install, but whether this host dispatches them the way Claude
Code does is untested, so the `/team-*` pipeline commands are not claimed to run
here yet. Full parity is tracked in
[#56](https://github.com/bostonaholic/team/issues/56). The standalone
utilities — `shipit`, `pr-watch-as-author`, `pr-open-comments`,
`groom-backlog`, `code-review` — need no agent and work as they do on Claude
Code.

**Developing Team itself?** The install copies, so a checkout's edits never
reach it. This links them instead:

```bash
script/dev-install antigravity
script/dev-uninstall antigravity
```

That points `~/.gemini/config/plugins/team` at your checkout with one symlink,
so an edit to a `SKILL.md` is live in the next `agy` session. It replaces
nothing it did not create: a native install of Team, or another checkout's link,
stops the run and is named, since the uninstall could not put it back.

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
