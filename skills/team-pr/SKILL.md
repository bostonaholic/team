---
name: team-pr
description: Internal PR module for Team. Given one explicit artifact directory with a current implementation PASS record, update the changelog, commit, push, open or recover draft PRs, and persist 10-pr.md. Never select a topic, merge, or run another phase.
user-invocable: false
effort: medium
argument-hint: "<absolute docs/plans/<id>/ directory>"
---

# Team PR

Run PR only. `$ARGUMENTS` must be one existing absolute
`docs/plans/<id>/` directory. Require `1-task.md`, `6-design.md`, `8-plan.md`, and
`9-implementation.md`; do not search, infer from the current branch, or accept a
standalone diff.

Before any write, verify `9-implementation.md` has `verdict: PASS`, lists every
worktree, and each recorded SHA equals its current HEAD. A mismatch returns to
the coordinator as an invalid predecessor. Never open from unreviewed code.
Follow `skills/principle-progress-tracking/SKILL.md` for this procedure.
Apply `skills/principle-optimization-never-dependency/SKILL.md`.

## Execute

1. If `10-pr.md` lists every worktree's current HEAD, report its URLs and stop.
2. Read `4-repos.md` when present. For each worktree, detect its base branch and
   commits ahead; only repos with commits need a PR.
3. Look for an existing open PR for each head branch before creating one. A
   crash after creation must converge by updating that PR, never duplicate it.
4. Call the Skill tool with `changelog`. Add only user-facing entries under `[Unreleased]`; never
   assign a version, cut a release section, or version the title here.
5. Call the Skill tool with `git-commit` for any final changelog changes. Confirm signing is
   enabled, create one trailing ship commit only when needed, and verify its
   signature. Existing slice commits remain separate.
6. Push each branch independently. Pass externally sourced values as argv and
   PR bodies through `--body-file`; never interpolate them into shell code.
   Read `references/body.md`, build its JSON input, and pass it on stdin to
   `node "<skill-dir>/scripts/render-body.mjs"`.
7. Open missing PRs with `gh pr create --draft --body-file <file>`. Do not stop
   to ask for shipping confirmation. A branch-protection or push failure stops
   that repo and is reported verbatim. Never merge.
8. In multi-repo mode, open all drafts first, then update each body with the
   other URLs. Open one draft PR per repo with commits. Put a dependency
   checkbox only on a PR that truly must wait for another; never create
   reciprocal blockers.
9. If `screenshots/manifest.md` exists, read
   `references/screenshots.md` from this skill and follow it. Call the Skill
   tool with `verifying-ux` for any required recapture. Screenshot failure degrades the
   body but never blocks PR creation.
10. If `1-task.md` has a non-null `ticketId`, call the Skill tool with
    `tracking-tickets` and use its home-only closing rule. The home PR receives
    that skill's `Closes <ticket>` form; companions receive `Part of
    owner/repo#<ticket>`. Keep the ticket in progress while drafts remain
    drafts; move it to in-review only when ready. This update is best-effort
    and never blocks the PR.
11. After final body edits, write `10-pr.md` with every opened URL and every
    worktree's final HEAD using `artifact-frontmatter`'s schema.

## Completion

Leave every worktree in place for review changes. Return draft URLs, final
commit SHAs, ticket ID when present, and the artifact directory.
Mention `/pr-watch-as-author` as the optional next command.
