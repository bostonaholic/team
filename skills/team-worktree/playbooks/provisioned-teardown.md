# Sweeping Local State

Before each consuming step, read its linked shared rules. Resolve links in this file from this file's own directory. If a required read fails, stop that step with the exact path. Never use checkout fallback or recursive loading.
Read [external-data rules](../../team/references/external-data.md) before teardown; stop with the resolved path on failure.

The worktree playbook's teardown step 8 follows this file after the worktree is removed.

A value is pasted only inside single quotes. A supplied value is refused, not pasted, when it contains a single quote, a newline, `$`, or a backtick.

## Ownership boundary

Run only the rows marked **this skill**. The others already ran, or will run,
in the caller.

| State | Owner |
|---|---|
| Worktrees, local branches, stale tracking refs | the worktree playbook teardown steps 1-5 (step 5 prunes the tracking ref) |
| `docs/plans/<id>/` planning scratch | teardown step 6 |
| Every other merged worktree and local branch in the repo | teardown step 7, the worktree sweep |
| Leftover directories under `.claude/worktrees/` | teardown step 7 |
| Databases, containers, queues, buckets, caches | **this skill** |

Never re-run a step the worktree playbook owns: a second pass at the same target bypasses the guards that playbook applies.

## Inputs

| Argument | Meaning | Source |
|---|---|---|
| `<repo-path>` | The repository being torn down | the worktree playbook's teardown step 8, as `<repo-path>` in its steps 3 and 5 |
| `<branch>` | The branch the finished work lived on | teardown step 8, recorded before step 1 |
| `<worktree>` | Absolute path of the worktree that was removed, or empty when there was none | teardown step 8, recorded before step 1 |

The script derives and validates the primary clone and the default branch
itself.

## The declaration: `.teamteardown`

A repo declares its own teardown; this skill never infers one. The
declaration is a file named `.teamteardown` at the repository root:

```
# Lines starting with # at column 0 are comments. Blank lines are ignored.
# Every other line is one command, run verbatim from the repo root.
dropdb --if-exists "app_test_$TEAM_BRANCH"
docker compose --project-name "$TEAM_BRANCH" down --volumes
```

The worktree sweep in teardown step 7 runs before this file. A command that
reads `git worktree list` or `.claude/worktrees/` finds each worktree the
sweep removed already gone.

Each command runs with three environment variables set, and reads its values
from them rather than from any substitution this skill performs:

| Variable | Value |
|---|---|
| `TEAM_REPO_ROOT` | the primary clone's root |
| `TEAM_BRANCH` | `<branch>` |
| `TEAM_WORKTREE` | `<worktree>`, empty when no worktree existed |

### Read it from the default branch, never from the checkout

Only the copy committed to the default branch runs — `origin/<default>`, else
`refs/heads/<default>`. The working-tree copy and the
finished branch's copy are never read: a PR that adds or edits
`.teamteardown` would otherwise get arbitrary code execution from the act of
cleaning up after it. On a fork PR against a public repo, that is anyone.

No committed copy means the repo declares no teardown — the common case, not
an error.

## Procedure

### Step 1 — run the declared teardown

`<team-worktree-skill-dir>` is defined in the worktree playbook's teardown
step 7. Run:

```sh
"<team-worktree-skill-dir>/scripts/run-teardown.sh" '<repo-path>' '<branch>' '<worktree>'
```

The script header lists each output line and exit code. Exit 0 means the
declaration ran, whatever each line's outcome. Exit 1 is a refusal: report
its stderr verbatim and stop this step.

**Never invent a teardown command.**
**Never edit, re-quote, or interpolate a declared line**
([external-data rules](../../team/references/external-data.md)). Never guess credentials.
A teardown command that needs them reads them the way the repo's own tooling
does. This skill does not open `.env` files and does not prompt for secrets.

### Step 2 — report

Report per [Report](#report) below, then hand back to the caller.

## Report

Report the script's stdout lines, one per declared command, plus any
refusal with the check that fired. The `none` line is reported too, rather
than silence that reads as a clean sweep.

Anything left on disk is named.
Never block caller teardown ([verified results rules](../../team/principles/verified-results.md)).
