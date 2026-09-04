## Worktree

This is the **leading** phase, and the one hard gate in the pipeline. A fix
never commits to the default branch. Everything after this phase runs in the
checkout this phase resolves.

### Branch gate

Run this block first. It prints `on-default` when HEAD is the repository's
default branch, and `ok <branch>` otherwise:

```sh
# Branch gate — a fix never commits to the default branch.
default="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null)"
default="${default#origin/}"
if [ -z "$default" ]; then
  # No origin/HEAD (no remote, or an unset remote head): fall back to whichever
  # conventional default-branch name actually exists locally.
  for candidate in main master; do
    if git show-ref --verify --quiet "refs/heads/$candidate"; then
      default="$candidate"; break
    fi
  done
fi
head="$(git rev-parse --abbrev-ref HEAD)"
if [ -n "$default" ] && [ "$head" = "$default" ]; then
  echo "on-default"
else
  echo "ok $head"
fi
```

- **`ok <branch>`** — HEAD is already on a non-default branch. Check
  whether it is the head of an open pull request:
  `gh pr view --json number,title --jq '"#\(.number) \(.title)"' 2>/dev/null`.
  No open PR, or one whose title names this bug → reuse the branch in
  place: create no worktree and no new branch, and announce the reuse
  once: "Continuing on branch `<branch>`." This is also the linked-worktree
  reuse case in `skills/team-worktree/SKILL.md` → "Detect existing
  worktree". An open PR for other work → treat it as `on-default`: a fix
  never rides on another PR's branch, so isolate per **Isolate** below.
- **`on-default`** — isolate before the first commit, per **Isolate** below.

### Isolate

Create the home worktree on branch `<id>` off `origin/HEAD`, exactly as
`/team`'s leading WORKTREE phase does. Call the Skill tool with
`team-worktree` for the single-repo
"Create the worktree(s)" procedure, and with `worktree-isolation` for the topology:

```sh
git fetch origin --quiet
git worktree add .claude/worktrees/<id> -b <id> origin/HEAD
```

Then continue the fix inside that worktree.

**Edge — branch `<id>` already exists** (re-invocation): reuse the worktree
that holds it. Do not recreate either one.

**Edge — worktree creation fails**, on a shallow clone, certain CI systems,
or permissions. Isolation is best-effort; **the branch is not.** Report the
failure loudly, then branch in place and keep going:

```sh
git switch -c <id>
```

Re-run the branch gate afterward. It must print `ok <id>`. If the run cannot
get off the default branch at all, stop and report — that is the one
condition that aborts before any work, because the alternative is committing
a fix to the default branch.
