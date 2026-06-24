---
topic: version-bump-runtime-gate
date: 2026-06-24
phase: task
ticketId: "120"
---

# Bug: version-bump protocol bumps a dev-only (CI) PR

The land-time `version-bump` protocol treats *every* Team PR as bump-worthy,
including PRs that change nothing in the **distributed plugin** (`agents/`,
`skills/`, `hooks/`, `.claude-plugin/` content). It bumped #118 (a `.github/`-only
CI fix) `0.13.1 → 0.13.2` and cut a changelog section — wrong; the maintainer
reverted before merge. Dev-only PRs (`710d44c`, `7d2e218`, `b8f81e9`, `0821129`)
land plain, with no bump.

## Root cause

The version/changelog/release exist for **plugin end users**, but the protocol
conflates contributor-facing / plugin-developer infrastructure with user-facing
change. The text is ambiguous and contradicts observed practice, and the
decisive signal (empty `[Unreleased]` + no runtime files) is framed as "derive a
bullet" rather than "do not bump."

## Fix (per #120 goals)

1. Add a runtime-vs-dev gate as **step 0** of `version-bump` SKILL.md, before the
   level table.
2. Reframe the bump-level table to apply only once a bump is warranted; route
   empty-`[Unreleased]` + no-runtime to "no bump," not "derive a bullet."
3. Fix CLAUDE.md land rule and `docs/versioning.md` to make the bump conditional
   on a runtime change, defined by the Runtime-vs-Development split.
4. Add a **deterministic gate** (free, diff-based): a PR that touches runtime
   paths must carry a bump; a PR that touches no runtime paths must not. Proven
   by a git-fixture test mirroring `pr-title-version.test.ts`.
