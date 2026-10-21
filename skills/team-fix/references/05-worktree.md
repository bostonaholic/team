## Worktree

This **leading** phase is the one hard gate: a fix never commits to the
default branch. Everything after runs in the checkout it resolves.

### Branch gate

`<team-fix-skill-dir>` is the absolute directory holding the installed
`skills/team-fix/SKILL.md`. Run first:

```sh
'<team-fix-skill-dir>/scripts/branch-gate.sh'
```

- **Exit 3** — no git checkout. Stop and report its stderr before any work.
- **`ok <branch>`** — already on a non-default branch. Check for an open PR:
  `gh pr view --json number,title --jq '"#\(.number) \(.title)"' 2>/dev/null`
  (judging whether the title names this bug stays inline). No open PR, or
  one whose title names this bug → reuse the branch in place, with no new
  worktree or branch; announce once: "Continuing on branch `<branch>`." An
  open PR for other work → treat as `on-default`: a fix never rides another
  PR's branch.
- **`on-default`** — isolate before the first commit, per **Isolate**.

### Isolate

Create the home worktree on branch `<id>` off `origin/HEAD`: call the Skill tool with `team-worktree` for
the single-repo "Create the worktree(s)" procedure, and read the
[worktree playbook](../team-worktree/playbooks/worktree.md) for topology:

```sh
git fetch origin --quiet
git worktree add .claude/worktrees/<id> -b <id> origin/HEAD
```

**Edge — branch `<id>` already exists** (re-invocation): reuse the worktree
holding it; recreate neither.

**Edge — worktree creation fails.** Isolation is best-effort; **the branch is
not.** Report the failure loudly, then branch in place:

```sh
git switch -c <id>
```

Re-run `branch-gate.sh`; it must print `ok <id>`. If the run cannot leave the
default branch, stop and report before any work.
