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
claude plugin marketplace add /path/to/team
claude plugin install team@team-dev
```

The first command registers the checkout as a marketplace; the second installs
from it. Skills register as slash commands (`/team`, `/shipit`), and agents and
hooks load with them.

For a clone-backed install that updates when `git pull` changes the checkout:

```bash
script/dev-install claude
```

This adds clone-local hooks for merge and rebase pulls. Existing non-Team hooks
and a `core.hooksPath` outside the clone are never overwritten: the install
still completes, and reports that it skipped the hooks and how to wire them up
yourself. Remove the install and Team-owned hooks with:

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

</details>

<details>
<summary><strong>Antigravity CLI</strong></summary>

```bash
agy plugin install /path/to/team
```

Team ships `plugin.json` at the repo root, which is this host's plugin marker,
so it installs as a native Antigravity plugin — all skills and all 13 agents.
`agy plugin uninstall team` removes it.

Skills arrive under **bare names** — ask for `shipit`, not `team:shipit`. The
install copies the checkout, so upgrading means installing again.

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
Invoked standalone, `/team-worktree` consumes `8-plan.md` (post-PLAN). Use it for manual recovery
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
- **Question.** Decompose intent into a full task record (`1-task.md`) and neutral research questions (`2-questions.md`). The questioner is the only agent that ever sees the user's original description.
- **Research** *(isolated)*. Parallel agents (file-finder + researcher) consume only `2-questions.md`. They never see the task. This structurally prevents opinion-bias in research findings.
- **Design** *(design review)*. Design author drafts a ~200-line alignment doc, resolving its own open questions as recorded assumptions. An adversarial design review gates advancement.
- **Structure.** Break the design into vertical slices with verification checkpoints. Produced autonomously. Advances to Plan with no gate.
- **Plan.** Tactical implementation plan derived from the structure. Read by the implementer. Not gated.
- **Implement.** Test-first, where test-architect writes failing tests and a mechanical gate checks them and the project's static checks. Then slice execution, where implementer commits each vertical slice atomically. Then adversarial verification, with 5 parallel reviewers and a typed failure-class retry loop that runs until no Blocking or Major finding remains.
- **PR.** Update changelog, commit, open pull request with inline UI screenshots when applicable, surface the tracking item.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full architecture, the artifact frontmatter schema, and the phase-inference rules.

## Components

- **13 agents** in `agents/`: decoupled workers that read predecessor artifacts from `docs/plans/` and write their outputs there
- **Entry-point + methodology skills** in `skills/`: slash commands, the standalone `/shipit`, `/pr-open-comments`, `/pr-watch-as-author`, `/pr-watch-as-reviewer`, `/groom-backlog`, `/pr-cleanup`, `/pr-verify`, `/pr-rebase`, `/reflect`, `/why`, and `/how` utilities, and shared methodologies
- **3 hooks** in `hooks/`: `docs/plans/`-aware compaction resilience and plugin-file validation
- **1 registry** at `skills/team/registry.json`: phase-tagged inventory of the 13 agents
- **State** lives in `docs/plans/<id>/*.md`, where `<id>` is `<TICKET>-<topic>` or `<YYYY-MM-DD>-<topic>`. Each artifact carries YAML frontmatter (`topic`, `date`, `phase`). `6-design.md` also carries `revision`, review verdicts live in `design-review-<n>.md`, and cross-model review dispositions in `cross-model-notes.md`, with raw design-round vendor transcripts in `cross-model-raw.md`. Live in-session coordination uses TodoWrite.

## References and inspiration

- [matanshavit/qrspi](https://github.com/matanshavit/qrspi/tree/main) — the QRSPI workflow: a phased Claude Code methodology that splits complex coding tasks into sequential steps, each producing a markdown artifact the next phase consumes
- [mattpocock/skills](https://github.com/mattpocock/skills) — a collection of agent skills and workflows targeting common AI-assisted development failure modes
- [cursor/plugins — pstack](https://github.com/cursor/plugins/tree/main/pstack) — engineering skills and playbooks that route tasks to appropriate models and verification strategies
- [garrytan/gstack](https://github.com/garrytan/gstack) — a collection of AI-assisted workflow tools for Claude Code with specialized roles (product review, engineering management, QA, release) as slash commands
