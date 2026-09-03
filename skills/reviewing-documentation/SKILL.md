---
name: reviewing-documentation
description: Review a diff for required and recommended documentation changes.
user-invocable: false
---

# Reviewing Documentation

## Input

Read the applicable diff and `skills/writing-prose/SKILL.md`.

## Documentation-Gap Review Process

1. Inventory READMEs, docs, inline/API/config docs, and changelog entries.
2. Identify public APIs, behavior, removals, dependencies, setup, or
   configuration changed by the diff.
3. Cross-check those changes against docs, examples, and types.
4. Report concrete failure modes and cite the governing prose rule. Suggest
   direction only; reviewers do not rewrite.
5. State when documentation is accurate, complete, and readable.

## Doc-Change Classification

### REQUIRED

A gap that makes a user or contributor fail: undocumented public API, wrong
setup, removed behavior still documented, or a missing required setting.

### RECOMMENDED

A gap that can confuse but does not block use: missing examples, stale inline
comments, missing notable changelog entry, or useful public-interface docs.

## Done

Each affected documentation surface is checked and every finding is classified.
