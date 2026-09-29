---
name: version-bump
description: 'Use for version bumps on explicit request or during PR landing through shipit. Never infer from finished, reviewed, green, or draft-ready work. Follows the project''s versioning conventions.'
---

# Version Bump — follow the project's versioning at land time

Follow [execution rules](../team/references/execution.md).

This skill owns no versioning scheme. Its whole job is to find how the current
project versions a change and do exactly that, or nothing when the project does
not version per change. When `/shipit` invokes it, return one outcome to
`/shipit`: **bumped**, **no bump**, or **stopped**, each with its reason.

## Precondition — explicit land intent

**Why:** a version is computed against the base branch's tip at this moment; a
bump made before the land goes stale when another PR merges.

Fire only on one of:

- The user asked to land: "ship it", "land the PR", `/shipit`.
- The user asked for the bump itself: "bump the version", "version this PR".
- A `/shipit` run is already in flight and reached its versioning step.

Finished, reviewed, green, or draft-ready work is never land intent, and neither
is a project check reporting that a bump is owed. With no land intent, stop,
report that the branch may need a bump before it merges, and wait.

## Hard limit

Edit files, commit, and set the PR title. Never push, tag, publish, create a
release, or merge, even when a project procedure lists those steps; they belong
to the caller or to the project's automation.

## Steps

### 1. Discover the project's contract

The base is the PR's base branch (`gh pr view --json baseRefName`), falling back
to `gh repo view --json defaultBranchRef`, then `origin/HEAD`. Fetch it; a
failed fetch stops. Read the project's evidence on the checked-out branch and on
the fetched base. A contract the base has and the branch removed → **stopped**.
The first source that answers wins:

1. **A documented procedure.** Agent instruction files, contributing or release
   docs, or a project-local skill that says how a change is versioned at merge.
   It replaces steps 2 to 4: follow it step by step within the hard limit, and
   map its exits to **bumped**, **no bump** (including "already bumped"), or
   **stopped**. Its gates, scripts, file list, and title rule are
   authoritative.
2. **Release automation that owns the version.** A tool that computes the
   version from commits or pending change records at merge or release time. Do
   only what that tool expects of a PR (for example, a pending change record
   when it requires one and the branch lacks it), then report **no bump**.
   Never edit version strings the tool writes.
3. **Per-merge bumps in history.** Most recent merges on the base edit the
   version, or put it in the title. Mirror that pattern: the same files, commit
   message form, changelog format, and title form.
4. **Anything else → no bump.** No procedure, no release tool, or most merges
   carry no version (versions move only in separate release commits). Leave the
   title unchanged.

Sources that disagree → **stopped**, with the conflicting evidence. Never invent
a versioning scheme for a project.

### 2. Decide whether and how much to bump

A project rule wins. Otherwise:

- Bump only when the change reaches what the project ships to its users. A
  change confined to tests, CI, docs, or contributor tooling → **no bump**.
- Pick the level by [SemVer 2.0.0](https://semver.org/spec/v2.0.0.html) from
  what a user can observe, never from the commit type. Below `1.0.0`, a breaking
  change is a minor; declaring `1.0.0` is the user's decision, never a side
  effect.

State the level and the evidence that decided it.

### 3. Apply

If the fetched base tip is not an ancestor of `HEAD`, stop: rebase first. Compute
the next version from that tip, update every place the pattern names, cut the
changelog in the project's format, and run the project's consistency checks.
Re-read each touched file: no occurrence of the previous version may remain where
the pattern moves it. Any failed check → undo the local edits and report
**stopped**.

### 4. Commit and title

Commit in the project's form. Set the PR title (`gh pr edit --title`) only when
the pattern puts the version there. Report **bumped** to the caller.
