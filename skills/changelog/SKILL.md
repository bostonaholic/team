---
name: changelog
description: 'Defines Keep a Changelog updates. Load when the ship phase updates `CHANGELOG.md` with user-facing changes.'
user-invocable: false
---

# Changelog

Maintain a curated user-facing `CHANGELOG.md` under [Keep a Changelog](https://keepachangelog.com). Every entry answers “How does this affect me?” Create the root file if missing.

Write at seventh-grade, STE-flavored level. Before finalizing, call `writing-prose` and apply its `## Self-lint`.

## Structure

All changes stay under `## [Unreleased]` until an explicit release. Each bullet belongs to exactly one of `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, or `Security`; always document vulnerability fixes. On release only, rename it using `[X.Y.Z] - YYYY-MM-DD` as `## [X.Y.Z] - YYYY-MM-DD` and add a new empty `[Unreleased]` above it. Read [references/format-and-examples.md](references/format-and-examples.md) when creating the file or choosing a section.

## Candidate selection

Before classifying commits, read [references/baseline-and-filter.md](references/baseline-and-filter.md) and execute its baseline commands. Every commit after the most recent release is a candidate; if no versioned heading exists, use the root commit. Read ambiguous diffs; never classify from an unclear subject.

Include every `feat:`, `fix:`, `perf:`, `BREAKING CHANGE:`, and `security:` or security-related fix. Exclude internal-only `chore:`, `test:`, `refactor:`, `docs:`, `ci:`, `revert:`, WIP, fixup, and merge commits. A dependency or docs-only change earns an entry only when users experience the result; describe that result. If a feature and its revert occur in one release, include neither.

## Ship-phase procedure

1. Read `[Unreleased]`; skip every change already covered. An unchanged second run writes nothing.
2. Find the baseline, list later commits, inspect ambiguous diffs, and apply the filter.
3. Merge commits that implement one user-visible change into one bullet. Sort each section by user impact.
4. Commit the changelog with the code it documents. If nothing survives, leave `CHANGELOG.md` untouched and report that result.

## Rules

- Describe user-observable results, never implementation details. One user-visible change gets one short bullet of one or two sentences.
- Never duplicate an entry; reruns are idempotent.
- Write in past tense: “Added X,” not “Add X.”
- Use absolute URLs for links because released sections become GitHub release notes. Use `https://github.com/<owner>/<repo>/blob/<default-branch>/<path>` or published docs; never repository-relative links. Bare `#anchors` and `mailto:` are allowed.
- Relative `[versioning](docs/versioning.md)` links break in release notes; replace them with full `https://…` URLs.
- A changelog rebase conflict keeps both: branch entries remain under `[Unreleased]`, above the base’s newest `## [X.Y.Z]`; every dated base section remains unchanged.
- Always update `[Unreleased]`. Never create a versioned section unless the user explicitly requests a release.
