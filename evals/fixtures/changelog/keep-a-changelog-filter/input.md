---
agent: changelog
tier: periodic
deps:
  - skills/changelog/**
---

# Self-contained task: generate Keep-a-Changelog entries from commit subjects

You are updating `CHANGELOG.md` for the unreleased version. Apply the changelog
methodology: translate the user-facing commits into Keep-a-Changelog sections
(`### Added`, `### Fixed`, etc.) under `## [Unreleased]`, and EXCLUDE the
internal-only commits (`chore:`, `test:`, `refactor:`, `ci:`, `docs:`) from the
output.

The commits since the last changelog entry:

```text
feat(auth): add OAuth2 login with GitHub provider
fix: resolve token expiry causing premature logout
chore: update eslint to v9
test: add unit tests for session middleware
refactor: extract token validation to shared utility
ci: bump runner image to ubuntu-24.04
```

Output only the changelog markdown you would add. Use user-facing language —
the entries should complete "Users can now..." or "We fixed...". Do not run any
git commands; just write the markdown.
