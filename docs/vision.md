---
title: Vision
description: "Team's north star: a human keeps the board fed and reviews finished work, and everything in between runs itself via a continuously running, board-driven control loop."
audience: [user, developer]
nav_order: 2
nav_label: vision
---

# Team Vision

> **The north star for the Team plugin.** This is the end state we are building
> toward, not a description of how Team works today.

## Contents

- [The one-sentence vision](#the-one-sentence-vision)
- [What the human does](#what-the-human-does)
- [What the system does](#what-the-system-does)
- [Why this is the goal](#why-this-is-the-goal)
- [How we get there](#how-we-get-there)

## The one-sentence vision

**A human keeps the board fed and reviews finished work; everything in between
runs itself.**

## What the human does

In the end state, a human is responsible for exactly **two** things:

1. **Fill the Backlog.** Identify new features, bugs, and chores and drop them
   into the **Backlog** column. This is the creative, judgment-heavy work of
   deciding *what should exist*.
2. **Review what is finished.** Inspect items in the **In Review** column: read
   the PR, accept or request changes, and merge. This is the quality gate on
   *what gets shipped*.

That is the whole job. Nobody shapes tickets by hand, kicks off pipelines,
babysits implementation, or moves cards across the middle of the board.

## What the system does

Everything between "captured in the Backlog" and "ready for human review" is
fully autonomous. A continuously running control loop watches the board and
drives work rightward toward the human review gate:

```text
   HUMAN            AUTONOMOUS LOOP                          HUMAN
  ┌───────┐  groom  ┌───────┐  start  ┌─────────────┐  PR   ┌───────────┐  merge  ┌──────┐
  │Backlog│ ──────► │ Ready │ ──────► │ In Progress │ ────► │ In Review │ ──────► │ Done │
  └───────┘         └───────┘         └─────────────┘       └───────────┘         └──────┘
   add work        (Backlog→Ready)   (Ready→In Progress)    open the PR          review +
                    grooming agent    full Team pipeline                          merge
```

**The loop works the board right-to-left: stop starting, start finishing.**
This is the core kanban discipline. Throughput comes from *reducing* work in
progress, not from starting more of it. So every cycle the loop looks at the
rightmost column first and takes whatever action moves work as far right as fast
as possible. It pulls new work in only when nothing already in flight can be
advanced, because finishing beats starting.

In strict priority order (right to left):

1. **Finish first (In Progress → In Review).** If a pipeline run is complete,
   open its PR and move the card to In Review. That gets finished work in front
   of the human and frees the In Progress slot. The pipeline runs end to end
   with no mid-run human gates; the single human checkpoint is at the end, the
   PR review.
2. **Start only when nothing is waiting to finish (Ready → In Progress).** When
   In Progress is below its WIP limit and no in-flight work can be pushed
   further right, pull the highest-priority Ready item and launch the Team
   pipeline for it.
3. **Groom last (Backlog → Ready).** When Ready is below its WIP limit, a
   grooming agent picks the most important Backlog item, verifies and rewrites
   it to a ready-to-work standard, and promotes it. The queue refills only once
   the line downstream is flowing.

The board is the single source of truth. Each cycle the loop reads it, finds the
rightmost action that advances work, executes that one action, and repeats. The
board drains toward Done instead of flooding from the Backlog.

## Why this is the goal

Team already automates the *inside* of a single feature. The remaining human
overhead is the *orchestration between* features: grooming, prioritizing,
starting runs, and shepherding cards across the board. Loop-driven development
automates that orchestration too. The human's role collapses to the two
decisions only a human should own, **what to build** and **what to ship**, and
the machine handles the mechanical flow.

## How we get there

The loop is assembled from capabilities the pipeline already has (isolated runs,
adversarial review, durable artifacts) plus a control loop over the board. The
first of the loop's own steps to land as a capability is grooming:
[`/groom-backlog`](skills.md#groom-backlog) does the `Backlog → Ready` work a
grooming agent would do, still asking a human to approve each plan. The
controller that decides *when* to run it is what remains. See
[Ethos](ethos.md) for the principles that make the autonomous middle
trustworthy.

## See also

- **[Ethos](ethos.md)**: the principles that make the autonomous middle trustworthy.
- **[Architecture](architecture.md)**: how the pipeline is built.
- **[Overview](index.md)**: what Team is and how the pipeline runs.
