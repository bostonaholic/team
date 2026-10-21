## Worktree

This **leading** phase is the one hard gate in the pipeline. A fix never
commits to the default branch. Everything after this phase runs in the
checkout this phase resolves.

### Branch gate

`<team-fix-skill-dir>` is the absolute directory that holds the installed
`skills/team-fix/SKILL.md`. Run this first:

```sh
'<team-fix-skill-dir>/scripts/branch-gate.sh'
```

- **Exit 3** — no git checkout to gate. Stop and report its stderr before
  any work.
- **`ok <branch>`** — HEAD is already on a non-default branch. Check
  whether it is the head of an open pull request:
  `gh pr view --json number,title --jq '"#\(.number) \(.title)"' 2>/dev/null`.
  Whether a title names this bug is judgment, so this check stays inline.
  No open PR, or one whose title names this bug → reuse the branch in
  place: create no worktree and no new branch, and announce the reuse
  once: "Continuing on branch `<branch>`." An open PR for other work → treat
  it as `on-default`: a fix never rides on another PR's branch, so isolate
  per **Isolate** below.
- **`on-default`** — isolate before the first commit, per **Isolate** below.

### Isolate

Create the home worktree on branch `<id>` off `origin/HEAD`, exactly as
`/team`'s leading WORKTREE phase does. Call the Skill tool with
`team-worktree` for the single-repo
"Create the worktree(s)" procedure, and read the
[worktree playbook](../team-worktree/playbooks/worktree.md) for the topology:

```sh
git fetch origin --quiet
git worktree add .claude/worktrees/<id> -b <id> origin/HEAD
```

**Edge — branch `<id>` already exists** (re-invocation): reuse the worktree
that holds it. Do not recreate either one.

**Edge — worktree creation fails.** Isolation is best-effort; **the branch is
not.** Report the failure loudly, then branch in place and keep going:

```sh
git switch -c <id>
```

Re-run `branch-gate.sh` afterward. It must print `ok <id>`. If the run cannot
get off the default branch at all, stop and report before any work.
