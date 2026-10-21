# Sweeping Local State

Before each consuming step, read its linked shared rules. Resolve links in this file from this file's own directory. If a required read fails, stop that step with the exact path. Never use checkout fallback or recursive loading.
Read [external-data rules](../../team/references/external-data.md) before teardown; stop with the resolved path on failure.

The worktree playbook's teardown step 8 follows this file after the worktree is removed.

A value is pasted only inside single quotes. A supplied value is refused, not pasted, when it contains a single quote, a newline, `$`, or a backtick.

## Ownership boundary

Run only the rows marked **this skill**; the caller owns the rest. Never
re-run a caller step: a second pass bypasses that playbook's guards.

| State | Owner |
|---|---|
| Worktrees, local branches, stale tracking refs | the worktree playbook teardown steps 1-5 |
| `docs/plans/<id>/` planning scratch | teardown step 6 |
| Every other merged worktree and local branch; leftover directories under `.claude/worktrees/` | teardown step 7 |
| Databases, containers, queues, buckets, caches | **this skill** |

## Inputs

From the worktree playbook's teardown step 8, all recorded before step 1:

| Argument | Meaning |
|---|---|
| `<repo-path>` | The repository being torn down |
| `<branch>` | The branch the finished work lived on |
| `<worktree>` | Absolute path of the removed worktree, or empty when there was none |

The script derives and validates the primary clone and default branch itself.

## The declaration: `.teamteardown`

A repo declares its own teardown in a root `.teamteardown` file; this skill
never infers one:

```
# Lines starting with # at column 0 are comments. Blank lines are ignored.
# Every other line is one command, run verbatim from the repo root.
dropdb --if-exists "app_test_$TEAM_BRANCH"
docker compose --project-name "$TEAM_BRANCH" down --volumes
```

Commands read `TEAM_REPO_ROOT` (the primary clone's root), `TEAM_BRANCH`
(`<branch>`), and `TEAM_WORKTREE` (`<worktree>`, empty when none) from the
environment, never from substitution by this skill. Teardown step 7's sweep
runs first, so swept worktrees are already gone.

Only the copy committed to the default branch runs, never a working-tree or
finished-branch copy. **Why:** a PR that edits `.teamteardown` would otherwise
get code execution from cleanup. No committed copy means no declared
teardown — the common case, not an error.

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
([external-data rules](../../team/references/external-data.md)). Never guess
credentials: a command that needs them reads them the way the repo's tooling
does. This skill opens no `.env` file and prompts for no secret.

### Step 2 — report

Report per [Report](#report) below, then hand back to the caller.

## Report

Report the script's stdout lines (one per declared command), any refusal with
the check that fired, and the `none` line — never silence that reads as a
clean sweep. Name anything left on disk.
Never block caller teardown ([verified results rules](../../team/principles/verified-results.md)).
