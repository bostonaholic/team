---
name: changelog
description: Update CHANGELOG.md [Unreleased] with user-visible changes. Loaded during PR preparation.
user-invocable: false
---

# Changelog

## Input

Read root `CHANGELOG.md`; create it with `[Unreleased]` if absent. Call the
Skill tool with `writing-prose` and apply its `## Self-lint` in
STE-flavored mode.

### Find the baseline

1. Read the newest `## [X.Y.Z] - YYYY-MM-DD` heading.
2. Resolve `vX.Y.Z` or `X.Y.Z` with `^{commit}`.
3. If neither tag exists, find a commit whose subject contains the version.
4. If no release exists, use the root commit.
5. Inspect every ambiguous candidate diff from `<baseline>..HEAD`.

## Required actions

Write one user-facing, past-tense bullet per visible change under exactly one
Keep a Changelog section:

| Section | Change |
|---|---|
| Added | New user-visible capability |
| Changed | Existing visible behavior changed |
| Deprecated | Future removal announced |
| Removed | Capability removed |
| Fixed | Defect fixed |
| Security | Vulnerability fixed |

Include `feat:`, `fix:`, user-visible `perf:`, security changes, and every
`BREAKING CHANGE:`. Exclude internal `chore:`, `test:`, `refactor:`,
`ci:`, WIP/fixup/merge commits, and add-then-revert pairs. Include `docs:`
only when documentation is the user-facing product change.

Before writing, remove candidates already represented in `[Unreleased]`.
Combine multiple commits for one visible change. Sort each section by impact.
If nothing survives, leave the file unchanged and report that outcome.

Use absolute `https://` links because released sections become GitHub release
notes. Bare anchors and `mailto:` are allowed; repository-relative links are
not.

On a rebase conflict, keep both sides: branch entries remain under
`[Unreleased]`, above every dated base section. Never cut a versioned section
without explicit release intent.

## Output

Update only `[Unreleased]`, in the same commit as the change it describes.
A repeat run over unchanged history writes nothing.
