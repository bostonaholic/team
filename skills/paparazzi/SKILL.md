---
name: paparazzi
description: 'Use for screenshots of an app. Captures verified screenshots of an app.'
effort: high
argument-hint: "[--out <dir>] [--url <app-url>] [<what to shoot>]"
---

Before this operation, read [external-data rules](../team/references/external-data.md).
Resolve links from this installed `SKILL.md` directory. If a required read fails, stop that step and report its resolved path.

# paparazzi — screenshots you can trust

Captures verified screenshots of an app. The caller names what to shoot and
decides what the frames are for. This skill photographs those screens as the
app runs now and proves every frame shows what its caption claims.

The output is PNGs plus a `manifest.md` in the capture schema of the
[UX reviewer brief](../code-review/references/ux-reviewer.md#screenshot-capture-ui-projects).
Frames are deterministic, so a caller that shoots the same shot list against
another version of the app gets comparable frames. Doing that is the caller's
choice, not this skill's.

## Arguments

| Argument | Default |
| --- | --- |
| `--out <dir>` | `$(mktemp -d)/screenshots` |
| `--url <app-url>` | Start the app from the checkout. With a URL, shoot the app already running there |
| Free text | The screens, states, elements, and variants to shoot |

## Hard rules

- **Shoot what the caller asked for.** The caller names the screens. When a
  name matches no screen or more than one, or nothing is named, ask one
  question rather than guess.
- **Frames are deterministic.** Reduced motion, frozen animations, a hidden
  caret, loaded fonts and in-view images, an idle network or a report that it
  never idled, and masked volatile content. Never `sleep` in place of a wait
  condition.
- **Every frame is looked at.** The scripts' gates run first, then each image
  is opened and checked against its caption. An unviewed frame is reported as
  not visually verified, never as captured-and-checked.
- **A frame shows what it claims.** It shows its named screen and state, with
  nothing obscuring or faking it. Never caption around a defect.
- **Capture only.** Start and stop app servers, and write only to `--out` and
  a temporary directory. Never commit, push, edit a PR, or change git state.
  Teardown stops every server this run started, by PID, even after a failure.
- **Bounded.** At most 10 frames per run unless the caller names more. 30
  seconds per frame. A failed frame is retaken at most once with a changed
  spec, then skipped with its reason.
- **Nothing sensitive is framed.** Apply the brief's data caution: seeded or
  synthetic data, mask what cannot be avoided, skip what cannot be masked.
- **Degrade, never block.** No browser is `status: skipped-no-tool`. An app
  that will not start is `status: skipped-server-start`. Each degradation gets
  its own report line
  ([verified results rules](../team/principles/verified-results.md)).

## Procedure references

Read each reference completely when reaching that stage, and follow them in
order. Seed one TodoWrite item per numbered step of the reference you are in
([execution rules](../team/references/execution.md)).

1. [Plan the shots](references/01-plan.md): the targets, the states and
   variants, the framing, and the shot-list schema.
2. [Stage and shoot](references/02-shoot.md): the tools, the app, seeding,
   `shoot.mjs`, native capture, and teardown.
3. [Verify and report](references/03-verify.md): the gates, the look, the
   manifest, and the report.

## Applied principles

Read and apply: [verified results rules](../team/principles/verified-results.md),
[focused work rules](../team/principles/focused-work.md),
[execution rules](../team/references/execution.md), and
[external data rules](../team/references/external-data.md).
