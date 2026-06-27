---
status: frozen
feature: save-bookmark-posts
target_app: linkboard
frozen_on: 2026-06-26
issue: 134
epic: 132
---

# Golden Master — Canonical Feature Prompt (FROZEN)

> ⛔ **DO NOT EDIT.** This is the frozen input for the Team pipeline Golden Master
> benchmark. The prompt below is replayed **verbatim** across runs to measure
> pipeline drift; **changing a single character invalidates every historical
> comparison.** If the feature ever needs to change, that is a *new* benchmark,
> recorded as a *new* file — never an edit to this one. See the epic (#132) and
> the freeze contract in [`README.md`](./README.md).

**Target app:** Linkboard — a Reddit-style link aggregator (Rails 8 · Inertia ·
React · Tailwind/Catalyst) with users/auth, boards, link/text posts, **flat**
comments, and up/down post votes. It deliberately does **not** have
saved/bookmarked posts — that is exactly the capability this prompt asks the
pipeline to add, so the app is a clean "before" state.

**How it is used:** the operator opens a Claude Code session *in the Linkboard
repository* (never in this repo) and runs `/team` with exactly the text in the
block below. The full procedure lives in the runbook (#137).

## The prompt (verbatim — copy the block below)

```text
I want signed-in users to be able to save posts for later. On any post — in a
board listing or on the post's own page — there should be a "Save" control that
toggles to "Saved" when clicked, so people can save and unsave without leaving
the page they're on. Add a /saved page that lists everything the current user
has saved, newest first, and show a small count somewhere sensible so I can see
how many I've saved. Saving is private — only I can see my own saved posts, and
signed-out visitors shouldn't see the control at all. Please cover the
migration, the model and associations, routes and controller, the views, and
tests. Keep an eye on N+1 queries on the listings and on the saved page.
```
