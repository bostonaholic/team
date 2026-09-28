---
name: paparazzi
description: 'Use for screenshots of a web or native app, or before/after pairs of a branch change. Captures deterministic frames, verifies each one, and writes a manifest.'
effort: high
argument-hint: "[--out <dir>] [--compare [--base <ref>]] [--url <app-url>] [<what to shoot>]"
---

Before this operation, read [external-data rules](../team/references/external-data.md).
Resolve links from this installed `SKILL.md` directory. If a required read fails, stop that step and report its resolved path.

# paparazzi — screenshots you can trust

Photograph the screens a caller asks for and prove every frame shows what its
caption claims. The caller chooses the mode:

- **Capture**, the default: plain frames of the app as it runs now, for any
  purpose, such as docs, a bug report, a design review, or a PR.
- **Compare**, on `--compare`: before/after pairs of a branch's change, the
  before side served from the merge-base. A PR caller usually wants this.

The output is PNGs plus a `manifest.md` in the capture schema of the
[UX reviewer brief](../code-review/references/ux-reviewer.md#screenshot-capture-ui-projects),
which `team-pr` renders and `pr-screenshots` uploads. This skill captures and
never publishes: it commits, pushes, and edits no PR.

## Arguments

| Argument | Default |
| --- | --- |
| `--out <dir>` | `$(mktemp -d)/screenshots`. Pass `<artifact-dir>/screenshots` to feed `team-pr` |
| `--compare` | Off. On, shoot before/after pairs. A request for before and after in the text turns it on too |
| `--base <ref>` | Used only with `--compare`. The PR base, then `origin/HEAD`, then `main`. The before side is its merge-base with `HEAD` |
| `--url <app-url>` | Start the app from the checkout. With a URL, shoot the app already running there, which is the after side in a comparison |
| Free text | The screens, states, elements, and variants to shoot. With none named, the branch's UI change decides |

## Hard rules

- **The caller decides the mode.** Never turn a capture into a comparison, or
  a comparison into a capture, without the caller's say. A comparison whose
  before side cannot run is the one exception, and it is reported.
- **A pair differs only in its origin.** In a comparison, one shot spec renders
  both sides, and `scripts/shoot.mjs` expands it, so viewport, scale, color
  scheme, locale, timezone, actions, and data cannot drift between them.
- **Frames are deterministic.** Reduced motion, frozen animations, a hidden
  caret, loaded fonts and in-view images, an idle network or a report that it
  never idled, and masked volatile content. Never `sleep` in place of a wait
  condition.
- **Every frame is looked at.** The scripts' gates run first, then each image
  is opened and checked against its caption. An unviewed frame is reported as
  not visually verified, never as captured-and-checked.
- **A frame shows what it claims.** A plain frame shows its named screen and
  state. An identical pair does not show a change: reframe it or skip it as
  `unchanged`. Pixels changed outside what the diff explains are an unintended
  visual change to report, never to crop away.
- **The user's checkout is never touched.** A comparison's before app runs from
  a detached worktree under `$(mktemp -d)`. Never `git stash`, `git checkout`,
  or `git reset` the working tree. Teardown removes that worktree and stops
  every server this run started, by PID, even after a failure.
- **Bounded.** At most 10 frames per run, a pair counting two, unless the
  caller names more. 30 seconds per frame. A failed frame is retaken at most
  once with a changed spec, then skipped with its reason.
- **Nothing sensitive is framed.** Apply the brief's data caution: seeded or
  synthetic data, mask what cannot be avoided, skip what cannot be masked.
- **Degrade, never block.** No browser is `status: skipped-no-tool`. A
  comparison whose before side cannot build or start drops to plain frames of
  the after side. Each degradation gets its own report line
  ([verified results rules](../team/principles/verified-results.md)).

## Procedure references

Read each reference completely when reaching that stage, and follow them in
order. Seed one TodoWrite item per numbered step of the reference you are in
([execution rules](../team/references/execution.md)).

1. [Plan the shots](references/01-plan.md): the mode, the targets, the states
   and variants, the framing, and the shot-list schema.
2. [Stage and shoot](references/02-shoot.md): the tools, the app or both apps,
   seeding, `shoot.mjs`, native capture, and teardown.
3. [Verify and deliver](references/03-verify.md): the gates, the look, the pair
   diff, the manifest, the report, and the handoff.

## Applied principles

Read and apply: [verified results rules](../team/principles/verified-results.md),
[focused work rules](../team/principles/focused-work.md),
[execution rules](../team/references/execution.md), and
[external data rules](../team/references/external-data.md).
