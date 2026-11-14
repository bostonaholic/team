## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`. If empty, the discovery command below resolves it for the **resume** path only.

For each changed repository, the Inputs subagent writes these Team record facts into `<scratch>/pr-inputs-<repo-slug>.md`, under context headings such as `## Why`, `## Verification`, and `## Evidence gaps`. It never writes the `## Closing line`, `## Capture gap`, `## Changelog`, or `## Companion PRs` heading, which the main session owns ([Execution](02-execution.md#step-dispatch)).

- In resume mode, the verifier result is the `### verifier` report in the review record that execution step 3 bound.
  A `stale` status adds an evidence gap: name `git log <head-sha>..HEAD` for each repo, with the head SHA from the record's `## Scope` line, and each uncommitted path outside `docs/plans/`.
  A `missing` status discloses that no passing review record exists.
- In resume mode, apply the same `stale` and `missing` disclosures to the security record and security status that execution step 3 bound. A `missing` security status discloses that no passing security review record exists.

Resolve `<team-skill-dir>` to the absolute directory containing `skills/team/SKILL.md`. From the repository root, run:

```sh
"<team-skill-dir>/discover-topic.sh" "${ARGUMENTS:-}" "6-design.md"
```

- **Printed a path:** use it as `$ARGUMENTS` for the resume path. When no explicit arg was given, announce the resolved directory to the user first.
- **Printed nothing:** do not hard-error; fall through to the **Standalone path** in `## Execution`.
