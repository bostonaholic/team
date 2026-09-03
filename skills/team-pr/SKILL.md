---
name: team-pr
description: |
  Commit final metadata, push, and open draft PRs. Trigger on "open the PR",
  "open a draft PR", "/team-pr", or a `/team` PR phase. This mutates git,
  GitHub, and tracker state, so require stated intent. Use /shipit for "ship it",
  "land the PR", or "land this"; this skill never merges.
effort: medium
argument-hint: "[docs/plans/<id>/]"
---

# Team PR

Open draft pull requests after implementation verification. Never merge.

## Resolve mode

Pass the exact `$ARGUMENTS` as stdin data to:

```sh
node "<skill-dir>/../artifact-frontmatter/scripts/resolve-topic.mjs" --argument-stdin --predecessor 6-design.md
```

A resolved directory selects **resume mode**. Announce discovered topics and
read `1-task.md`, `6-design.md`, `8-plan.md`, optional `4-repos.md`, review records, and
optional `screenshots/manifest.md`.

`needs-input` selects **standalone mode**: use the current branch only. Detect
its base from `origin/HEAD`, falling back to `main`; require commits ahead or
ship-worthy staged changes. If neither exists, report `Nothing to ship.` and
stop. Standalone skips the aggregate-gate assertion and reports that the user
accepts responsibility for correctness. It never opens multi-repo PRs.

## Procedure

Call the Skill tool with `principle-progress-tracking` and follow it.

1. **Inventory work.** In resume mode, read `4-repos.md`'s `## Worktrees` when
   present. For every repo, resolve its base independently and retain only
   branches with commits. Multi-repo mode opens **one draft PR per repo**.
   Require evidence that IMPLEMENT's aggregate gate passed; never infer it
   from `6-design.md` alone.
2. **Update CHANGELOG.md.** Call the Skill tool with `changelog`. Add only that
   repo's user-facing changes under `## [Unreleased]`; report a no-entry skip.
3. **Commit final files.** Call the Skill tool with `git-commit`. Preserve the
   implementer's slice commits; create one trailing ship commit only for
   remaining files such as `CHANGELOG.md`. Verify its signature.
4. **Render the body.** Read `references/body.md`. Build its JSON contract and
   pipe it to `<skill-dir>/scripts/render-body.mjs`; write stdout to a body
   file. Pass external prose as JSON data, never shell text. `## PR Body
   Template` ordering and conditional-section rules live in that reference and
   executable renderer.
5. **Open a draft PR automatically — do not stop to ask.** Push each branch,
   then run the terminal mutation visibly:

   ```sh
   gh pr create --draft --body-file <body-file>
   ```

   A body file is mandatory; never interpolate the body into a command.
6. **Cross-link multi-repo PRs.** After all URLs exist, rerender each body with
   `## Companion PRs` entries for every other repo, then use
   `gh pr edit --body-file`. Dependency direction and home-only ticket closing
   follow `references/body.md`.
7. **Link the ticket.** If `1-task.md` has non-null `ticketId`, call the Skill
   tool with `tracking-tickets`. The home PR gets the sole closing footer;
   companion PRs use a qualified non-closing `Part of owner/repo#<n>` reference.
   Keep the ticket In progress while draft; moving it In review waits until the
   PR becomes ready. Tracker failure is best-effort and must be reported.
8. **Handle screenshots conditionally.** When a manifest exists, or a later
   push changes UI, read `references/screenshots.md`. Upload only after the PR
   exists. If UI changed, call the Skill tool with `verifying-ux` to recapture.
   Screenshot failure degrades the section and never blocks the PR.
9. **Refresh after every push.** Compare the body with the pushed commits and
   rerender Summary, Changes, How to Verify, conditional Review notes,
   screenshots, ticket line, Pre-merge items, and Companion PRs. Re-emit exactly
   one applicable ticket line, never duplicated and never dropped. Leave no
   stale description.
10. **Preserve worktrees.** Do not clean up after opening. Cleanup happens only
    after merge or explicit abandonment through the separate cleanup flow.

## Completion

Report every draft PR URL, repo, pushed head SHA, ship-commit SHA or skip,
tracker result, screenshot result/instruction, and any omitted repo. End with:
`Next: say "the PR is ready for review" (or run /pr-watch-as-author with that wording).`
