# Team

A plugin that orchestrates specialized agents to autonomously implement entire features end-to-end, driven by the **QRSPI** workflow. The orchestrator is the main Claude Code session. It persists pipeline state as artifacts in `docs/plans/` and tracks live progress with TodoWrite.

Team installs on Claude Code and on Codex CLI. The full pipeline needs Claude Code, because that is the host that dispatches the agents. The standalone utilities work on both. Antigravity CLI is dev-install-only: its skills come from a checkout of Team through `script/dev-install antigravity`, and nothing distributed ships for it.

**Documentation:** [team.bostonaholic.dev](https://team.bostonaholic.dev)

## Install

Team ships a native manifest for Claude Code and for Codex CLI, so one repo
installs on both. Pick yours. Antigravity CLI has no manifest of its own, so
its entry below installs from a checkout instead.

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
<summary><strong>Antigravity CLI</strong> (dev install only)</summary>

Nothing distributed ships for this host, so the install needs a checkout of
Team:

```bash
script/dev-install antigravity
script/dev-uninstall antigravity
```

Those two are the only supported way in and out. The install creates one
symlink per skill under `~/.gemini/config/skills/`, this host's global skill
directory, so an edit to a `SKILL.md` in your checkout is live in the next
`agy` session.

It links **every user-invocable skill except the two guarded ones**. The
methodology skills only an agent loads — the ones that set `user-invocable:
false` — are left out, because this install links no agents and they would give
you nothing to type. (The [skills page](docs/skills.md) counts one more
methodology skill than that, because it counts by the absence of an
`argument-hint`. The difference is `/code-review`, which is a command you can
type, so it installs here.)

> **Two skills are held back rather than installed.** `pr-watch-as-reviewer`
> and `pr-rebase` both set `disable-model-invocation`, so on Claude Code only a
> person can start them — the first casts an approval that can transitively
> merge a PR with auto-merge enabled, and the second force-pushes a rewritten
> branch over published history. **Antigravity has no trust gate and no
> activation prompt**, so anything installed here is model-invocable in every
> session, with nothing to fall back on. Neither one is installed, no flag turns
> them on, and a link an earlier run left behind — from before a skill gained
> its guard — is taken away by the next run.

Nine of the installed commands load and then find no agent to dispatch, because
this install links skills only: `/team`, `/team-question`, `/team-research`,
`/team-design`, `/team-structure`, `/team-plan`, `/team-implement`,
`/eng-design-doc-review`, and `/code-review`. Full parity is tracked in
[#56](https://github.com/bostonaholic/team/issues/56).

Skills arrive under **bare names** — ask for `shipit`, not `team:shipit`. The
catalog name comes from each skill's own frontmatter, so this host gives Team no
namespace, and a same-named skill in a higher-precedence location shadows
Team's silently. The install warns when a skill elsewhere in the global skill
directory already claims a Team skill's name, and links anyway: the host decides
which of the two wins. It also refuses to run at all on top of a native `agy`
plugin install of Team, which would load every skill twice.

Three shadowing cases no install-time scan can see, by nature rather than by
choice: `agy`'s built-in skills live inside the binary; skills loaded from a
plugin under `~/.gemini/config/plugins/` sit outside everything these scripts
read; and a project's own `.agents/skills/` may outrank the global directory —
that last one is read from the Gemini-family docs rather than measured here, and
either way no global install can enumerate every future workspace.

The install writes only to a path that is free or already holds this checkout's
own link. A directory, a file, or another checkout's symlink on a target path
aborts the whole run and names what is there. Nothing is overwritten, because
the uninstall could never put it back. Two checkouts of Team are the usual way
to reach that abort, and a worktree counts as a second checkout: Team's own
pipeline works in `.claude/worktrees/<topic>/`, so installing from the main
checkout and re-running inside a worktree aborts by design. Run
`script/dev-uninstall antigravity` from the checkout the abort names, then
re-run.

Each run reconciles the whole set rather than only adding to it. A skill that
stops being installable — it gains a guard, or stops being user-invocable —
loses the link an earlier run gave it, so pulling and re-running is enough to
bring the directory back in line. The run then reports what sits at each held-back
skill's path, so a link left there by something else is visible rather than
implied.

The uninstall removes only the links this checkout owns, and never removes a
parent directory. It selects by where each link points rather than by its name,
so any symlink resolving into this checkout's `skills/` is swept whatever it is
called, and everything else — your own skill folders, and links pointing
anywhere else — is left alone.

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
