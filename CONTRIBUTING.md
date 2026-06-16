# Contributing to Team

Thanks for your interest in improving **Team** — the autonomous feature-delivery
plugin for Claude Code. This guide is the contributor's entry point: how the
project is organized, how work is tracked, and the conventions every change is
expected to follow. It links out to the docs site rather than duplicating it.

> The full documentation lives at **[team.bostonaholic.dev](https://team.bostonaholic.dev)**
> (source under [`docs/`](docs/)). Before opening a pull request, read the
> [Architecture](docs/architecture.md) overview and the [Testing](docs/testing.md)
> strategy.

## Start here

| Read | Why |
|------|-----|
| [Vision](docs/vision.md) | The loop-driven end state Team builds toward. |
| [Ethos](docs/ethos.md) | Why the autonomous middle can be trusted — the principles behind every design choice. |
| [Architecture](docs/architecture.md) | How Team is built: agents as microservices, the QRSPI pipeline, artifact frontmatter, phase inference. |
| [Testing](docs/testing.md) | The six-layer test harness and which layer each check belongs at. **Read this before writing any test.** |
| [Versioning](docs/versioning.md) | Land-time versioning and the release-on-merge flow. |
| [Skills](docs/skills.md) | The full per-skill reference. |
| [Project Tracking](docs/project-tracking.md) | The GitHub Project board and how cards move. |

## Runtime vs. development

Team produces a **distributed plugin**, so two contexts coexist:

- **Runtime** (`agents/`, `skills/`, `hooks/`, `.claude-plugin/`) — ships to end
  users. Changes here affect everyone who installs the plugin.
- **Development** (`.claude/`) — our own workspace tooling (dev hooks, scripts,
  settings). Never distributed.

Rule of thumb: if it validates that the plugin is *built correctly*, it's a dev
concern (`.claude/`); if it runs *as part of the plugin's functionality*, it's
runtime. See [AGENTS.md](AGENTS.md) for the full project router.

## How work is tracked

All work — features, bugs, chores — lives on the
[GitHub Project board](https://github.com/users/bostonaholic/projects/5/views/1).
It is the single source of truth: **if work is not on the board, it is not
tracked.**

1. Open a GitHub issue in `bostonaholic/team`.
2. Add it to the project board.
3. Move its card across the kanban as the work progresses:
   **Backlog → Ready → In progress → In review → Done.**

See [Project Tracking](docs/project-tracking.md) for the full workflow and the
label taxonomy.

## Making a change

1. **Branch off the latest `main`.** Keep history linear — never commit directly
   to `main`, and never create merge commits (rebase, don't merge).
2. **Follow the testing discipline.** Read [Testing](docs/testing.md) first, then
   push every check to the cheapest, most deterministic layer that can catch it.
   - `bun test` — the free static gate. Runs on every commit; no model, no money.
   - `bun run test:evals` — the paid behavioral + LLM-judge tiers
     (needs `EVALS_ANTHROPIC_API_KEY`).
3. **Keep the agent registry in sync.** When you add or rename an agent, update
   both `agents/*.md` and `skills/team/registry.json` in the same commit — the
   dev hook `.claude/hooks/check-registry-sync.mjs` enforces this.
4. **Write [Conventional Commits](https://www.conventionalcommits.org)** —
   `type(scope): subject`, imperative mood, following the 50/72 rule.
5. **Record user-facing changes in the changelog.** Add a bullet under
   `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md)
   ([Keep a Changelog](https://keepachangelog.com) format, absolute URLs in
   links). Internal-only changes are filtered out.

## Opening and landing a pull request

- Open a PR against `main`. A drafted PR carries **no version** — no bump commit,
  no `vX.Y.Z` title, no released changelog section. It simply accumulates
  `## [Unreleased]` bullets.
- Landing is two steps (see [Versioning](docs/versioning.md)):
  1. **`version-bump`** assigns the next version against current `main`, cuts the
     `[Unreleased]` changelog into a dated section, and commits `chore(version)`.
  2. **`/shipit`** pushes, waits for CI, and rebase-merges. `release-on-merge`
     then tags and publishes the release automatically.

## Conventions in brief

- **Clarity over cleverness.** Code is read far more often than it is written.
- **A constraint that matters gets a tripwire.** When a comment says "never do
  X," add the L2 test that fails the build when someone does — see
  [Testing](docs/testing.md).
- **Surgical changes.** Touch only what the task requires, and match the
  surrounding style.

Questions? Open an issue on the board. Thanks for contributing.
