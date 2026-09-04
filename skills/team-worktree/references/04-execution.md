## Execution

### Derive identifiers

- `<id>` = `basename "$ARGUMENTS"`
- Branch name = `<id>` (in every involved repo)
- Worktree path per repo = `<repo-path>/.claude/worktrees/<id>` (per Claude
  Code's native worktree convention. See
  `skills/worktree-isolation/SKILL.md`)

**Branch names must never contain a slash (`/`).** Use `-` as the only
delimiter. A `/` in a branch name creates a nested ref path in
`.git/refs/heads/`. That path collides with Claude Code's
`.claude/worktrees/` directory convention and breaks worktree cleanup. The
`<id>` produced by the questioner is already slash-free, but if
`basename "$ARGUMENTS"` ever yields a name containing `/` (e.g. a ticket
prefix like `TEAM/123`), replace every `/` with `-` first and use that
sanitized name as **both** the branch name and the worktree directory name
so the two stay in sync for cleanup:
`branch="$(printf '%s' "$id" | tr '/' '-')"`. Only the `docs/plans/<id>/`
artifact directory keeps the original `<id>`.

### Confirm with the user (standalone invocation only)

**Standalone invocation only — in a full `/team` run, skip this dialog entirely and proceed straight to "Create the worktree(s)".**
The dialog fires only when a human invoked `/team-worktree` directly — a
setup-time prompt on direct invocation. Within a full `/team` run the
orchestrator creates the worktrees **without a confirmation prompt** (the
phase loop never pauses mid-run). The resolved repo set is recorded loudly
in `6-design.md` and echoed in the PR body's `## Review notes`.

Create a worktree only for the repos that actually need one. If **no** repo
needs creation (single-repo mode where the detect step skipped the home
repo), skip this dialog entirely — the reuse announcement above is
sufficient. Proceed to Completion.

Single-repo:
```
Ready to create worktree:

Worktree: <home-worktree-path>
Branch:   <id>
Plan:     $ARGUMENTS/8-plan.md

Proceed?
```

Multi-repo:
```
Ready to create N worktrees (one per listed repo):

  <repo-1-name> @ <repo-1-path>/.claude/worktrees/<id>
  <repo-2-name> @ <repo-2-path>/.claude/worktrees/<id>
  ...

Branch in each: <id>
Plan:           $ARGUMENTS/8-plan.md

Proceed?
```

Use `AskUserQuestion` with a `Worktree` header and **Proceed** /
**Cancel** options.

### Create the worktree(s)

After the user confirms (standalone invocation) — or immediately, in
pipeline mode — create a worktree in each repo the detect step
did **not** skip:

Use the slash-sanitized name (`<branch>`, derived above) for both the
worktree directory and the `-b` flag in every repo. In the common case
`<branch>` equals `<id>`.

- **Single-repo:** create the home worktree using Claude Code's native
  worktree support, branched off `origin/HEAD`.
- **Multi-repo:** for each listed repo, first assert **containment**:
  the repo path's real path must be a direct child of the home repo's
  parent directory —
  ```
  [ "$(dirname "$(realpath "<repo-path>")")" = "$(dirname "$(realpath "<home-root>")")" ]
  ```
  If the check fails, **refuse that repo and report it**. Never create a
  worktree outside the home repo's sibling set. Do not trust `4-repos.md`
  content blindly, because someone can author it with no Bash-side path
  check. For each repo that passes:
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
path. This becomes the discoverable record any later `/team-*` invocation
reads to relocate the worktrees.

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

> The `/team-implement` handoff above is for **standalone, post-PLAN**
> invocation (this skill's discovery command is gated on `8-plan.md`). In a full
> `/team` pipeline run, WORKTREE is the **leading** phase: the orchestrator
> creates the home worktree first, supplying `<id>` directly (it does not run
> this skill's `8-plan.md`-gated discovery), and proceeds to QUESTION next — not
> to `/team-implement`.
