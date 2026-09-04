---
name: authoring-designs
description: 'Defines the design-document procedure. Load when drafting or revising `6-design.md` for adversarial review.'
user-invocable: false
---

# Authoring Designs

Confirm repo scope, resolve choices autonomously as recorded assumptions, and write `6-design.md`. Use seventh-grade STE-flavored prose; call `writing-prose` and apply `## Self-lint` before finalizing.

If `1-task.md` references `3-prd.md`, read it first and follow “Consuming a PRD downstream” in `skills/product-requirements-doc/SKILL.md`.

## Confirm repo scope

If `docs/plans/<id>/4-repos.md` exists, treat it as the working scope and name each affected repo in `## Decisions made`.

If absent but `5-research.md` indicates multiple repos, resolve each candidate autonomously. Require `<name>` to match `^[A-Za-z0-9._-]+$` and not equal `.` or `..`; reject separators, absolute paths, traversal, and shell metacharacters. Resolve only `<root>/../<name>`, confirm its `.git` with Glob/Read (the questioner uses `git -C <path> rev-parse --git-dir`), and never record a path unless verified as a direct child of the home repo's parent.

When all candidates resolve, write `docs/plans/<id>/4-repos.md` from `skills/artifact-frontmatter/SKILL.md` before drafting. If any fails, remain single-repo and name the omitted repo/work in `## Risks`. Never silently expand repo scope.

## Resolve choices autonomously

Never pause for user input. Record every resolved choice in `## Decisions made` as “Assumption — chosen without user review”; defer only low-stakes items to `## Open questions (deferred)` (`principle-record-assumptions`). On revision, address reviewer findings verbatim and record new assumptions the same way.

## Design contract

Read [references/design-template.md](references/design-template.md) before drafting. The required sections are `## Current state`, `## Desired end state`, `## Patterns to follow`, `## Decisions made`, `## Out of scope`, optional `## Surfaces`, `## Open questions (deferred)`, and `## Risks`.

- Enumerate boundary values (empty, zero, one, max-size, off-by-one), invalid inputs, downstream failures/timeouts/partial writes/retries, concurrency/idempotency/races, authorization states, and resource limits. Choose behavior or put intentional deferrals in `## Out of scope`.
- Derive every closed set by grep, directory listing, or key-set comparison and record the command. Never list a blast radius or inventory from memory.
- No implementation bodies or full type definitions; signatures are allowed only to fix a decision. Reference patterns by `file:line`, never duplicate them.
- Prefer “follow `lib/foo.ts:30-60`” over copying those lines.
- Apply `systems-thinking` `## When Designing`: cover adjacent components in `## Current state` and surfaces that must change together in `## Decisions made`; this adds no gate.
- Existing rationale constrains changes to deliberate guards, thresholds, ownership, and layering. Default to `5-research.md`; use `skills/why/SKILL.md` for Preserve/Change/Avoid/Risk archaeology and `skills/how/SKILL.md` for current-state explanation when needed.
