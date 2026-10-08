# Team

**You have been made tech lead. Your team never sleeps.**

Team is a plugin that orchestrates specialized agents to autonomously implement entire features end-to-end, driven by the **QRSPI** workflow. The orchestrator is the main session. It persists pipeline state as artifacts in `docs/plans/` and tracks live progress with TodoWrite.

Team installs on Claude Code, Codex CLI, Antigravity CLI, and OpenCode. The full pipeline runs on Claude Code, Codex CLI, and Antigravity CLI. OpenCode support covers skill/command discovery and installation. Execution limits are listed beside setup.

**Documentation:** [team.bostonaholic.dev](https://team.bostonaholic.dev)

The [shared principle resources](docs/skills.md#shared-principle-resources) define the installed rules for scope, state, evidence, review, and focused work.

## Install

Copy/paste into your CLI prompt:

```text
Install the Team plugin from https://github.com/bostonaholic/team, refer to the repo's AGENTS.md for instructions.
```

Or 🔗 [check the installation instructions](INSTALL.md).

## Skills that moved

Team now ships only its pipeline. Its other 18 skills moved to the `bostonaholic/skills` collection, which installs without Team, and took gerund names there:

| Team command | Now in bostonaholic/skills |
| --- | --- |
| `/agent-prompt` | `/composing-agent-prompts` |
| `/audit-complexity` | `/auditing-complexity` |
| `/audit-tests` | `/auditing-tests` |
| `/code-review` | `/reviewing-code` |
| `/eng-design-doc-review` | `/reviewing-design-docs` |
| `/groom-backlog` | `/grooming-backlogs` |
| `/how` | `/explaining-architecture` |
| `/no-comments` | `/removing-comments` |
| `/paparazzi` | `/capturing-screenshots` |
| `/pr-open-comments` | `/addressing-pr-comments` |
| `/pr-rebase` | `/rebasing-branches` |
| `/pr-screenshots` | `/attaching-pr-screenshots` |
| `/pr-watch-as-author` | `/watching-authored-prs` |
| `/pr-watch-as-reviewer` | `/watching-reviewed-prs` |
| `/prove` | `/proving-claims` |
| `/retro` | `/running-retros` |
| `/shipit` | `/landing-prs` |
| `/why` | `/investigating-design-rationale` |

The standalone `pr-cleanup` command is retired. Team retains its internal pipeline cleanup.

Install the collection as a plugin on Claude Code:

```bash
claude plugin marketplace add bostonaholic/skills
claude plugin install bostonaholic@skills
```

On Codex:

```bash
codex plugin marketplace add bostonaholic/skills
codex plugin add bostonaholic@skills
```

On other agents, such as Antigravity or OpenCode, pick skills with the command below. To install one skill, add `--skill <name>`.

```bash
npx skills@latest add bostonaholic/skills
```

As plugins, the skills carry the `bostonaholic:` prefix instead of `team:`. Update Team first, then install the skills. Docs: https://skills.bostonaholic.dev

**Set up before v0.147.0?** Update Team, then run `/team-migrate` (`team:team-migrate` on Codex). It finds every harness on the machine, shows one plan, and after you confirm it installs Team and the collection natively everywhere, removes local-checkout installs and their pull hooks, and moves old-name skill copies to a `-retired` folder. It deletes no skill copy, and a second run changes nothing.

The pipeline does not need these skills. It keeps its own copies of the reviewer briefs, the screenshot upload, and the worktree teardown.

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

## Configuration

Team reads one optional project-local file, `.team/config.json`, at the home
project root. It overrides the bundled model selections used to dispatch
body-loaded agents on Codex CLI and Antigravity CLI; Claude Code's named-agent
dispatch ignores it.

```json
{
  "codex": {
    "sonnet": { "model": "terra", "reasoning_effort": "medium" }
  },
  "antigravity": {
    "sonnet": { "model": "flash" }
  }
}
```

Only the `codex` and `antigravity` hosts, the `opus`/`sonnet`/`haiku` tiers, and
the `model` (required) and `reasoning_effort` (Codex only) fields are accepted.
A Codex `model` can name a class such as `sol`, which resolves to the newest
model in that class, or a concrete catalog ID, which pins one version.
Overrides replace individual bundled selections. Team validates each selection
against the running host's capabilities and fails on an unknown, unavailable, or
unsupported value rather than falling back to a default. See
[docs/configuration.md](docs/configuration.md) for the full schema and
validation rules.

## The governance stack

Every team you have worked on had rules that made its output trustworthy: an author does not approve their own pull request, a design gets challenged before it is built, security reads the change before it ships. Team ships those rules as machinery rather than as manners.

| The rule | How Team enforces it |
|----------|----------------------|
| An author never approves their own work | Reviewers hold no `Write` or `Edit` tool and run in `plan` mode. Enforced by frontmatter, not requested in a prompt. |
| Review is not a rubber stamp | The implement loop re-runs until no Blocking or Major finding is left. There is no fixed number of rounds to outwait. |
| A reviewer cannot be lobbied | Reviewers read the diff and a spec written before the code existed, never the implementer's account of its own work. |
| The design is challenged before it is built | A fresh-context adversarial design review hard-gates the pipeline. |
| Nobody escalates to dodge a check | The orchestrator is forbidden from handing a blocking finding to the human mid-run. |
| Every decision is on the record | `docs/plans/<id>/` holds the task, the questions, the research, the design, every review verdict, and the plan. Files in the repo, not chat history. |

You cannot overrule the security reviewer by asking nicely. [docs/ethos.md](docs/ethos.md) explains why each rule exists, and [docs/vision.md](docs/vision.md) covers how far the delegation goes.

## Design philosophy

Each agent does work and returns an artifact. The orchestrator dispatches the next agent based on a phase table. Agents remain decoupled: they know nothing about each other.

## Pipeline (QRSPI)

```
WORKTREE → QUESTION → RESEARCH → DESIGN → STRUCTURE → PLAN → IMPLEMENT → PR
```

- **Worktree.** Orchestrator prepares an isolated git worktree first and authors `docs/plans/<id>/` inside it, keeping the home checkout's `git status` clean for the whole run.
- **Question.** Decompose intent into a full task record (`1-task.md`) and neutral research questions (`2-questions.md`). The questioner is the only agent that ever sees the user's original description.
- **Research** *(isolated)*. Parallel agents (file-finder + researcher) consume only `2-questions.md`. They never see the task. This structurally prevents opinion-bias in research findings.
- **Design** *(design review)*. Design author drafts an alignment doc, resolving its own open questions as recorded assumptions. An adversarial design review gates advancement.
- **Structure.** Break the design into vertical slices with verification checkpoints. Produced autonomously. Advances to Plan with no gate.
- **Plan.** Tactical implementation plan derived from the structure. Read by the implementer. Not gated.
- **Implement.** Test-first, where test-architect writes failing tests and a mechanical gate checks them and the project's static checks. Then slice execution, where implementer commits each vertical slice atomically. Then adversarial verification, with 5 parallel reviewers and a typed failure-class retry loop that runs until no Blocking or Major finding remains.
- **PR.** Update an existing changelog, commit, open pull request with inline UI screenshots when applicable, surface the tracking item. Repositories without a root changelog remain unchanged unless the user explicitly requests one.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full architecture, the artifact frontmatter schema, and the phase-inference rules.

## Components

- **13 agents** in `agents/`: decoupled workers that read predecessor artifacts from `docs/plans/` and write their outputs there
- **11 skills** in `skills/`: the `/team` orchestrator, the eight phase commands, `/team-fix`, and the explicit-only `/team-migrate`, plus shared principles, playbooks, references, and reviewer briefs under `skills/team/`
- **1 registry** at `skills/team/registry.json`: phase-tagged inventory of the 13 agents
- **State** lives in `docs/plans/<id>/*.md`, where `<id>` is `<TICKET>-<topic>` or `<YYYY-MM-DD>-<topic>`. Each artifact carries YAML frontmatter (`topic`, `date`, `phase`). `6-design.md` also carries `revision`, review verdicts live in `design-review-<n>.md`, and cross-model review dispositions in `cross-model-notes.md`, with raw design-round vendor transcripts in `cross-model-raw.md`. Live in-session coordination uses TodoWrite.

## References and inspiration

- [matanshavit/qrspi](https://github.com/matanshavit/qrspi/tree/main) — the QRSPI workflow: a phased Claude Code methodology that splits complex coding tasks into sequential steps, each producing a markdown artifact the next phase consumes
- [mattpocock/skills](https://github.com/mattpocock/skills) — a collection of agent skills and workflows targeting common AI-assisted development failure modes
- [cursor/plugins — pstack](https://github.com/cursor/plugins/tree/main/pstack) — engineering skills and playbooks that route tasks to appropriate models and verification strategies
- [garrytan/gstack](https://github.com/garrytan/gstack) — a collection of AI-assisted workflow tools for Claude Code with specialized roles (product review, engineering management, QA, release) as slash commands
