---
name: paparazzi
description: 'Use for screenshots of UI changes on a branch. Captures deterministic before/after pairs, verifies every frame, and writes a PR-ready manifest.'
effort: high
argument-hint: "[--out <dir>] [--base <ref>] [--after-only] [--url <app-url>] [<what to shoot>]"
---

Before this operation, read [external-data rules](../team/references/external-data.md).
Resolve links from this installed `SKILL.md` directory. If a required read fails, stop that step and report its resolved path.

# paparazzi — screenshots that prove a change

Photograph exactly the screens a change touched, as before/after pairs from the
merge-base and the working tree, and prove every frame shows what its caption
claims. The output is PNGs plus a `manifest.md` in the capture schema of the
[UX reviewer brief](../code-review/references/ux-reviewer.md#screenshot-capture-ui-projects),
which `team-pr` renders and `pr-screenshots` uploads.

This skill captures and never publishes: it commits, pushes, and edits no PR.

## Arguments

| Argument | Default |
| --- | --- |
| `--out <dir>` | `$(mktemp -d)/screenshots`. Pass `<artifact-dir>/screenshots` to feed `team-pr` |
| `--base <ref>` | The PR base, then `origin/HEAD`, then `main`. The before side is its merge-base with `HEAD` |
| `--after-only` | Off. On, skip the before side |
| `--url <app-url>` | Start the after app. With a URL, shoot the app already running there |
| Free text | What to shoot. It replaces the diff-derived plan, never the gates |

## Hard rules

- **A pair differs only in its origin.** One shot spec renders both sides, and
  `scripts/shoot.mjs` expands it, so viewport, scale, color scheme, locale,
  timezone, actions, and data cannot drift between before and after.
- **Frames are deterministic.** Reduced motion, frozen animations, a hidden
  caret, loaded fonts and in-view images, an idle network or a report that it
  never idled, and masked volatile content. Never `sleep` in place of a wait
  condition.
- **Every frame is looked at.** The scripts' gates run first, then each image
  is opened and checked against its caption. An unviewed frame is reported as
  not visually verified, never as captured-and-checked.
- **The change is in frame.** An identical pair does not show the change:
  reframe it or skip it as `unchanged`. Pixels changed outside what the diff
  explains are an unintended visual change to report, never to crop away.
- **The user's checkout is never touched.** The before app runs from a detached
  worktree under `$(mktemp -d)`. Never `git stash`, `git checkout`, or
  `git reset` the working tree. Teardown removes that worktree and stops every
  server this run started, by PID, even after a failure.
- **Bounded.** At most 10 frames per run, a pair counting two, unless the user
  names more. 30 seconds per frame. A failed frame is retaken at most once with
  a changed spec, then skipped with its reason.
- **Nothing sensitive is framed.** Apply the brief's data caution: seeded or
  synthetic data, mask what cannot be avoided, skip what cannot be masked.
- **Degrade, never block.** No browser is `status: skipped-no-tool`. A before
  side that cannot build or start drops the run to after-only. Each degradation
  gets its own report line ([verified results rules](../team/principles/verified-results.md)).

## Procedure references

Read each reference completely when reaching that stage, and follow them in
order. Seed one TodoWrite item per numbered step of the reference you are in
([execution rules](../team/references/execution.md)).

1. [Plan the shots](references/01-plan.md): the before side, the diff, the
   screens and states it reaches, the variants, and the shot-list schema.
2. [Stage and shoot](references/02-shoot.md): the tools, both apps, seeding,
   `shoot.mjs`, native capture, and teardown.
3. [Verify and deliver](references/03-verify.md): the gates, the look, the pair
   diff, the manifest, the report, and the handoff.

## Applied principles

Read and apply: [verified results rules](../team/principles/verified-results.md),
[focused work rules](../team/principles/focused-work.md),
[execution rules](../team/references/execution.md), and
[external data rules](../team/references/external-data.md).
