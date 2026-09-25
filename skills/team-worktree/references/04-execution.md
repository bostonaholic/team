## Execution

### Derive identifiers

- `<id>` = `basename "$ARGUMENTS"`
- Branch name = `<id>` (in every involved repo)
- Worktree path per repo = `<repo-path>/.claude/worktrees/<id>` (the
  `.claude/worktrees/` convention. See
  `skills/team-worktree/playbooks/worktree.md`)

**Branch names must never contain a slash (`/`).** Use `-` as the only
delimiter. If `basename "$ARGUMENTS"` ever yields a name containing `/`,
replace every `/` with `-` first and use that sanitized name as **both** the
branch name and the worktree directory name:
`branch="$(printf '%s' "$id" | tr '/' '-')"`. Only the `docs/plans/<id>/`
artifact directory keeps the original `<id>`.

### Confirm with the user (standalone invocation only)

**Standalone invocation only — in a full `/team` run, skip this dialog entirely and proceed straight to "Create the worktree(s)".**
The dialog fires only when a human invoked `/team-worktree` directly.

Create a worktree only for the repos that actually need one. If **no** repo
needs creation (single-repo mode where the detect step skipped the home
repo), skip this dialog entirely — the reuse announcement above is
sufficient. Proceed to Completion.

Show the count and each worktree to create (`<repo-name> @ <path>` per repo
in multi-repo mode), the branch `<id>`, and `$ARGUMENTS/8-plan.md`.
Use `AskUserQuestion` with a `Worktree` header and **Proceed** /
**Cancel** options.

### Create the worktree(s)

After the user confirms (standalone invocation) — or immediately, in
pipeline mode — create a worktree in each repo the detect step
did **not** skip:

Use the slash-sanitized name (`<branch>`, derived above) for both the
worktree directory and the `-b` flag in every repo. In the common case
`<branch>` equals `<id>`.

- **Single-repo:** create the home worktree on branch `<id>` off
  `origin/HEAD`, using the host's native worktree support when it offers
  one and `git worktree add` otherwise.
- **Multi-repo:** for each listed repo, first assert **containment**:
  the repo path's real path must be a direct child of the home repo's
  parent directory —
  ```
  [ "$(dirname "$(realpath "<repo-path>")")" = "$(dirname "$(realpath "<home-root>")")" ]
  ```
  If the check fails, **refuse that repo and report it**. Never create a
  worktree outside the home repo's sibling set; do not trust `4-repos.md`
  content blindly. For each repo that passes:
  ```
  git -C <repo-path> fetch origin --quiet
  git -C <repo-path> worktree add .claude/worktrees/<branch> -b <branch> origin/HEAD
  ```
  If a repo lacks an `origin` remote or `origin/HEAD`, fall back to its
  current default branch and warn the user once for that repo.

### Record the worktree paths (multi-repo only)

After all worktrees are created, append a `## Worktrees` section to the
home worktree's `docs/plans/<id>/4-repos.md` listing each repo's worktree
path. For repos the detect step skipped, record the current checkout's
path.

```markdown
## Worktrees
- home: <home-worktree-path>
- <repo-name>: <repo-path>/.claude/worktrees/<id>
- ...
```

For trivial single-file changes, in-place implementation is allowed — no
worktree needed.

Report the worktree paths and tell the user:

- Single-repo: **"Next: cd <home-worktree> and run `/team-implement docs/plans/<id>/`"**
- Home repo skipped (already in its worktree):
  **"Next: run `/team-implement docs/plans/<id>/`"** — no `cd` needed. Work
  continues in the current checkout on the current branch.
- Multi-repo: **"Next: cd <home-worktree> and run `/team-implement
  docs/plans/<id>/`. The implementer will navigate between the
  per-repo worktrees as the plan steps require."**

> This handoff is for **standalone, post-PLAN** invocation. In a full `/team`
> run WORKTREE is the **leading** phase: the orchestrator supplies `<id>`
> directly, does not run this skill's `8-plan.md`-gated discovery, and
> proceeds to QUESTION, not `/team-implement`.
