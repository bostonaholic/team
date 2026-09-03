---
name: team-worktree
description: |
  Create isolated worktrees for the topic. Trigger on "set up the
  worktree", "isolate this work", "/team-worktree", or phase 1 of a
  `/team` run. This creates branches, so require one of those stated intents.
effort: low
argument-hint: "[docs/plans/<id>/]"
---

# Team Worktree

Create or reuse one worktree per involved repository. Call the Skill tool with
`worktree-isolation` for topology and cleanup contracts.

## Resolve input

In an orchestrated `/team` run, use the artifact directory supplied by the
coordinator; it may be empty before QUESTION. Standalone, pass the exact
`$ARGUMENTS` as stdin data to:

```sh
node "<skill-dir>/../artifact-frontmatter/scripts/resolve-topic.mjs" --argument-stdin --predecessor 8-plan.md
```

An explicit existing directory wins; otherwise announce the newest topic with
`8-plan.md`. On `{"status":"needs-input"}`, use `AskUserQuestion` with a `Setup`
header: run `/team-plan docs/plans/<id>/`, provide a directory, or cancel.

`<id>` is the directory basename. Replace any `/` with `-`, and use the same
slash-free value for branch and worktree directory names.

## Targets

For the coordinator's pre-reconstruction home-only call, ignore `4-repos.md` and
resolve only the home checkout. Multi-repo expansion is a separate call after a
passing design review.

Read `4-repos.md` when present. Its home and additional absolute paths select
multi-repo mode; otherwise use the invoking repository in single-repo mode.
Treat every path as untrusted. An additional repo's real path must be a direct
child of the home repo's parent; reject any other path.

For recovery, accept exactly one `## Worktrees` section with one `home` entry
and one entry per additional repo, with no duplicate or unknown names. Reject
an incomplete or malformed section before mutation.

For every target, run:

```sh
node "<skill-dir>/scripts/inspect-repo.mjs" --repo "<repo-path>"
```

- `linked: true` on a **non-default branch**: announce and skip worktree
  creation for this repo; use the current checkout.
- `linked: true` on the **default branch**: report and stop. Never nest a
  worktree or implement on the default branch.
- Main checkout: create or reuse the target worktree.

The helper resolves the default branch from `origin/HEAD`, then
`main`/`master`, and fails on detached HEAD. Existing matching
branch/worktree state is success only after its path and branch are revalidated.

## Procedure

Call the Skill tool with `principle-progress-tracking` and follow it.

1. Compute each target as `<repo-path>/.claude/worktrees/<branch>`.
2. On a direct `/team-worktree` invocation, show every branch, path, repo, and
   `8-plan.md`, then use `AskUserQuestion` with `Worktree` / **Proceed** /
   **Cancel**. Skip this prompt during `/team`, and when every target is already
   reusable or preserved. For a trivial single-file change, an explicitly
   chosen in-place implementation remains allowed.
3. Validate containment for every target needing creation, then pass all of
   them to one helper call (use one `--target` group per repo):

   ```sh
   node "<skill-dir>/scripts/create-worktrees.mjs" --branch "<branch>" \
     --home "<home-repo-root>" \
     [--preserve-existing-home "<artifact-dir>"] \
     [--recover-worktrees "<artifact-dir>/4-repos.md"] \
     --target "<repo-name>" "<repo-path>" [--target "<repo-name>" "<repo-path>" ...]
   ```

   Include `--preserve-existing-home` during `/team`, or when a recovered
   `## Worktrees` section records the primary checkout as home. The helper uses
   it only when that exact primary-checkout artifact directory exists.

   On any multi-repo recovery, including a standalone rerun, pass
   `--recover-worktrees`. The helper parses the section, requires the exact repo
   inventory, validates every path, and reuses linked checkouts or primary
   fallbacks. It rejects malformed state and competing branch worktrees before
   mutation. A later retry must not replace durable work with an empty checkout.

   The helper resolves every repo before mutation and rejects a target that is
   not a direct sibling of the home repo's primary checkout. It fetches
   `origin` and runs
   `git -C <repo-path> worktree add .claude/worktrees/<branch>` from
   `origin/HEAD`. If `origin` or `origin/HEAD` is absent, it branches from the
   verified current default. It revalidates every created or reused worktree.

   A per-repo creation failure returns `status: "fallback"` with the primary
   checkout path and actual branch; report its `message` and error, use that
   path, and continue every other repo. A preserved fallback returns the same
   status with `preserved: true` and no new error. A home-repo fallback
   runs the pipeline in place. For each newly created worktree, the helper
   copies paths declared by that repo's `.worktreeinclude` only when Git also
   reports them as ignored. Existing and reused worktrees receive no copy, per
   `worktree-isolation`. A `provisioning-failed` result is non-zero: report it,
   finish inspecting the returned outcomes, and stop before dispatch. The user
   must place missing files in an existing worktree before rerun.
4. In multi-repo mode, append or update exactly one `## Worktrees` section in
   the home `4-repos.md`:

   ```markdown
   ## Worktrees
   - home: <home-worktree-path>
   - <repo-name>: <worktree-or-reused-checkout>
   ```

5. Re-query every worktree path and branch. Do not claim completion from the
   create command alone.

The full pipeline calls this skill first for the home repo and may call its
idempotent multi-repo expansion after DESIGN discovers `4-repos.md`.

## Completion

Report every repo, path, branch, reuse/fallback, and skip. Standalone:

- single repo: `Next: cd <home-worktree> and run /team-implement docs/plans/<id>/`;
- reused home checkout: `Next: run /team-implement docs/plans/<id>/`;
- multi-repo: use the same command from the home worktree; the implementer
  changes directories per annotated plan step.
