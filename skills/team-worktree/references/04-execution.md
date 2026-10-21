## Execution

### Derive identifiers

- `<id>` = `basename "$ARGUMENTS"`; branch = `<id>` in every involved repo.
- Worktree path per repo = `<repo-path>/.claude/worktrees/<id>` (see
  `skills/team-worktree/playbooks/worktree.md`).

**Branch names never contain a slash (`/`);** `-` is the only delimiter. If
`<id>` contains `/`, sanitize it with
`branch="$(printf '%s' "$id" | tr '/' '-')"` and use that as **both** branch
and worktree directory name. Only the `docs/plans/<id>/` artifact directory
keeps the original `<id>`.

### Confirm with the user (standalone invocation only)

**In a full `/team` run, skip this dialog and go straight to "Create the worktree(s)".**
Also skip it when the detect step skipped every repo; the reuse announcement
suffices, so go to the report below.

Show the count and each worktree to create (`<repo-name> @ <path>` per repo
in multi-repo mode), the branch `<id>`, and `$ARGUMENTS/8-plan.md`. Use
`AskUserQuestion` with a `Worktree` header and **Proceed** / **Cancel**
options.

### Create the worktree(s)

After confirmation (standalone) or immediately (pipeline mode), create a
worktree in each repo the detect step did **not** skip, using the sanitized
`<branch>` for both the worktree directory and `-b`.
`<team-worktree-skill-dir>` is defined in
[Detect existing worktree](03-detect-existing-worktree.md).

- **Single-repo:** create the home worktree on branch `<id>` off
  `origin/HEAD`, using the host's native worktree support when offered;
  otherwise run the command below with `<home-root>` as both paths.
- **Multi-repo:** for each listed repo, run:

  ```sh
  "<team-worktree-skill-dir>/scripts/add-worktree.sh" '<home-root>' '<repo-path>' '<branch>'
  ```

  Paste each value single-quoted; refuse a value containing a single quote.
  The script header lists each output line and exit code.

  - **`created`** or **`exists`** → record the printed path.
  - **`warn`** → warn the user once for that repo, then read the next line.
  - **Exit 3** (`refused (containment)`) → **refuse that repo and report it**;
    never create it another way.
  - **Exit 1** → report its stderr and apply the
    [fallback](../playbooks/worktree.md#fallback) for that repo.

### Record the worktree paths (multi-repo only)

Append to the home worktree's `docs/plans/<id>/4-repos.md`, giving a skipped
repo its current checkout's path:

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
  **"Next: run `/team-implement docs/plans/<id>/`"** — no `cd`; work
  continues in the current checkout and branch.
- Multi-repo: **"Next: cd <home-worktree> and run `/team-implement
  docs/plans/<id>/`. The implementer moves between the per-repo worktrees
  as the plan steps require."**

> This handoff is for **standalone, post-PLAN** invocation. In a full `/team`
> run WORKTREE is the **leading** phase: the orchestrator supplies `<id>`,
> skips this skill's `8-plan.md`-gated discovery, and proceeds to QUESTION,
> not `/team-implement`.
