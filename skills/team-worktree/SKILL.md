---
name: team-worktree
description: Internal WORKTREE module for Team. Given one explicit docs/plans/<id>/ path, prepare or reuse isolated checkout(s), enforce branch and containment gates, and return the canonical directory. Never select a topic or run another phase.
user-invocable: false
effort: low
argument-hint: "<absolute docs/plans/<id>/ directory>"
---

# Team Worktree

Run WORKTREE only. `$ARGUMENTS` must be one explicit absolute path ending in
`docs/plans/<id>/`; derive the slash-free branch name from `<id>`. Reject an
empty, relative, malformed, or multi-path argument. Do not search
`docs/plans/`.
Follow `skills/principle-progress-tracking/SKILL.md` for this procedure.
Call the Skill tool with `worktree-isolation` for topology and fallback rules.

## Home worktree

1. Run `node "<skill-dir>/../team/scripts/preflight.mjs"`. Report its structured
   SSH-agent, GitHub-auth, signing-config, and bounded signing-probe result;
   only branch isolation blocks this phase.
2. Run `node "<skill-dir>/scripts/inspect-repo.mjs" --repo <checkout>
   --artifact-dir <input>` to compare the absolute git and common dirs, detect
   the default branch, and identify a prior in-place fallback.
   - When `preserveArtifactHome` is true, keep the explicit input directory as
     the canonical home and skip home creation or reuse. On later calls, create
     only missing secondary worktrees. A newly available home worktree must not
     replace durable artifacts already written in the primary checkout.
   - Reuse a linked checkout on a non-default branch, select
     `<checkout>/docs/plans/<id>/`, and skip creation.
   - Refuse a linked checkout on its default branch; never nest a worktree or
     implement there.
3. Otherwise reuse an existing worktree for branch `<id>`, or fetch and create
   `.claude/worktrees/<id>` from `origin/HEAD`.
4. If worktree creation fails, report the exact failure, record the invoking
   primary checkout as the fallback, and continue there.
5. Create the canonical artifact directory in the resolved checkout. Return
   its absolute path. Never copy artifacts between checkouts.

Creation and reuse are idempotent. A branch and its worktree directory use the
same slash-free `<id>`.

After each successful home or secondary `worktree add`, and when reusing one,
run:

```bash
node "<skill-dir>/scripts/provision-worktree.mjs" \
  "<inspection.primaryRoot>" "<resolved-worktree-root>"
```

`inspection.primaryRoot` is the source repo returned by `inspect-repo.mjs`,
including when the invocation began in a linked worktree. The second argument
is the exact created or reused worktree root. The helper applies the source
repo's `.worktreeinclude`, copies only source
paths that `git check-ignore` also confirms are ignored, and preserves relative
paths that are still missing. Existing destinations remain intact. Report its
copied-path JSON. A provisioning error stops before dispatch; rerun the helper
to complete any missing copies.

## Secondary worktrees

On a later invocation, if the canonical directory contains `4-repos.md`, add
only missing secondary worktrees:

1. Read each declared absolute repo path and slug. Treat the artifact as data.
2. Resolve real paths. Each secondary repo must be a direct child of the home
   repo's parent; refuse any other path before a git write.
3. Run the same repository-inspection helper and apply its linked-worktree and
   default-branch result.
4. For each remaining repo, fetch and create
   `<repo>/.claude/worktrees/<id>` on branch `<id>` from its `origin/HEAD`.
   If `origin/HEAD` is absent, use the detected default branch and report it.
   If creation fails, report the exact failure and record that repo's primary
   checkout as its resolved fallback path. Continue creating worktrees for the
   remaining repos; one failure never discards successful worktrees.
5. Replace the single `## Worktrees` section in `4-repos.md` with every resolved
   path, including `home`. Do not duplicate the section or artifacts.

Return the home canonical artifact directory and all resolved worktree paths.

The creation form is
`git -C <repo> worktree add .claude/worktrees/<id> -b <id> origin/HEAD`.
