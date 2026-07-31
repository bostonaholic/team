---
title: Ethos
description: "The principles behind Team that make the autonomous middle trustworthy: files as the contract, mechanical gates over good intentions, adversarial-by-design review, and deep agents with narrow seams."
audience: [user, developer]
nav_order: 3
nav_label: ethos
---

# Team Ethos

> **The principles behind the pipeline, the agents, and the loop.** They shape
> how Team thinks, plans, reviews, and ships, and they explain why the system is
> built the way it is. They reflect what we believe about building software when
> the building itself is done by agents, and the human's scarce resource is
> judgment, not keystrokes.

## Contents

- [The shift](#the-shift)
- [1. The human owns the ends](#1-the-human-owns-the-ends)
- [2. Files are the contract](#2-files-are-the-contract)
- [3. Mechanical gates over good intentions](#3-mechanical-gates-over-good-intentions)
- [4. Adversarial by design](#4-adversarial-by-design)
- [5. Deep agents, narrow seams](#5-deep-agents-narrow-seams)
- [How they work together](#how-they-work-together)
- [Autonomy is earned, not assumed](#autonomy-is-earned-not-assumed)

## The shift

When agents write the code, write the tests, and open the PRs, the bottleneck
moves. It stops being *how fast a human can implement* and becomes *how much a
human can trust without watching*. Every design choice in Team answers one
question:

> **What is the smallest set of decisions that must stay human, and how do we
> make everything else safe to automate?**

The answer is two decisions: **what to build** and **what to ship**. A human
fills the Backlog (what to build) and reviews what reaches In Review (what to
ship). Everything in between runs itself: grooming, designing, planning,
implementing, testing, reviewing, and opening the PR.

| The human owns | The machine owns |
|----------------|------------------|
| **What to build**: fill the Backlog | Shaping each item into a ready ticket |
| **What to ship**: review In Review, merge | Designing, planning, implementing |
| | Testing, reviewing, opening the PR |

This only works if the autonomous middle is *trustworthy*. The rest of this
document is how we earn that trust. See [Vision](vision.md) for the end state
this drives toward.

## 1. The human owns the ends

The human's leverage is at the edges of the pipeline, not in the middle of it.
Autonomy does not mean "the machine decides everything." It means "the machine
handles everything between the two decisions only a human should make."

A human dragging cards across the board, approving design docs mid-flight, and
babysitting the implementer is spending judgment on mechanics. A human choosing
what matters and judging what's done is spending it where it compounds. Move the
judgment to where it's scarce; automate everything else.

This is the one rule that orders all the others: the goal of every other
principle is to make the *ends* the only place a human is needed.

**Anti-patterns:**
- A human approving a gate in the *middle* of a run. (Move that judgment to the PR.)
- The loop merging its own PR. (Shipping is always a human decision.)
- "Ask the user at every step." (Ask at the ends. Be autonomous in the middle.)

## 2. Files are the contract

The conversation is ephemeral; the artifact on disk is durable. Every phase
writes a file that declares what it is and whether its gate passed. Agents
communicate through these files, never through shared chat memory.

This is what lets a run survive a truncated context, a crash, a new session, or a
handoff to a different agent. The state lives on disk, not in memory. The file
is the value passed between steps, and it is immutable history once written.
*(Hickey: prefer durable, inspectable data over hidden mutable state. The
artifact is the value.)*

**Anti-patterns:**
- Passing state between agents through the prompt instead of a file.
- Trusting "the model will remember." It fails about one time in five.
- A phase that produces no artifact. If it didn't write a file, it didn't happen.

## 3. Mechanical gates over good intentions

LLMs forget instructions roughly one time in five. So where a rule must hold, we
do not ask the model to remember it. We enforce it with a deterministic check
that runs whether or not the model cooperates. A rule enforced only by the
model's good behavior is not enforced at all.

The corollary is layering: push every check to the cheapest, most deterministic
layer that can catch it. A test at the wrong layer is worse than no test,
because it is slow, flaky, or costs money to learn nothing.
*(See [the testing guide](testing.md).)* Detect errors early, surface them
loudly, never mask them silently.

**Anti-patterns:**
- "The agent's prompt says not to do X." (Add a check that makes X impossible.)
- A check that only passes when the model happens to be well-behaved.
- An expensive LLM judge for something a regex could decide.

## 4. Adversarial by design

A generator must not grade its own work. Team deliberately separates who builds
from who judges. Reviewers get fresh context and no shared history with the
implementer: they read the diff and the upstream spec, never the implementer's
account of its own work — so intent reaches them through artifacts written
before the code existed, not through the author's defense of it. The researcher
goes further and never sees the original task description at all, so it cannot
rationalize toward a wanted answer. Review verdicts hard-gate, so a blocking
finding stops the line.

Note what reviewer isolation is *not*. A reviewer that could not see the intent
could not tell a correct implementation from a correct implementation of the
wrong thing, which is why the done-criteria check is the first thing it does.
What the isolation withholds is narration. A spec is a fixed target; an author
explaining why the code is already right is a moving one.

The system is built to catch itself being wrong, because a *confident* wrong
answer is the most expensive kind. This is the generation-verification loop, but
with the verifier structurally unable to collude with the generator.

### Checks and balances

Separating the powers is only half of it. Separation says the builder does not
judge. Balance says no role holds enough power to finish alone, and every check
is itself checked.

- **Veto without authorship.** Reviewers block but cannot edit — their tool
  grants are read-only and they run in `plan` mode, so the constraint is a
  property of the harness rather than a promise in a prompt. Producers change
  code but cast no verdict. Neither role can close a review cycle by itself.
- **Bounded veto.** The review loop is capped at five rounds, then halts to a
  human. A check that cannot be satisfied must hand the work back, not grind. An
  unbounded veto is its own failure mode.
- **A check on the check.** The skeptic pass that tries to refute a blocking
  finding is default-keep: inconclusive means the finding stands. A refuter can
  remove a false positive and never a true one.
- **The orchestrator cannot punt.** The no-consult rule forbids escalating a
  blocking finding to the human mid-run. The one role positioned to dodge the
  loop by asking permission is denied that exit.
- **The deterministic layer outranks the model.** A mechanical gate can fail a
  step that every agent in the run believes is fine.

What these guard against is concentrated power — not malice, but a single agent
whose mistake nothing else in the system is positioned to catch. Every one of
them costs something: a round trip, a retry, a halt a human has to pick up. That
is the price of a middle that runs unattended.

**Anti-patterns:**
- Letting the implementer review its own implementation.
- A reviewer that read the conversation where the code was written.
- Withholding the spec from a reviewer, then asking it to judge correctness in a
  vacuum. Isolation from narration, not from intent.
- Treating model confidence as correctness. Agreement is a signal, not a proof.

## 5. Deep agents, narrow seams

Each agent is a deep module behind a narrow interface: read one predecessor
artifact, do one job well, write one artifact. The complexity lives *inside* the
agent; the seam between agents stays simple, a file path in and a file path out.

This is what makes the roster swappable, the pipeline legible, and failures
local: a crash in one agent is contained to one phase instead of cascading down
the line. *(Ousterhout: deep modules with simple interfaces; pull complexity
downward. Armstrong: isolate failures so one fault can't take down the system.)*

**Anti-patterns:**
- An agent that reaches around its input artifact to peek at others' state.
- Orchestration logic leaking into a specialist agent.
- A "utility" agent that quietly does five unrelated things.

## How they work together

**The human owns the ends** sets the goal: a trustworthy autonomous middle. The
other four are how the middle earns that trust.

- **Files are the contract** makes the work durable.
- **Mechanical gates** make the rules hold without supervision.
- **Adversarial by design** makes the system catch its own mistakes, and keeps
  any one agent from being the last word.
- **Deep agents, narrow seams** keep failures local and the whole thing legible.

Take any one away and autonomy stops being safe: without durable files it
forgets; without mechanical gates it drifts; without adversarial review it ships
confident mistakes; without clean seams one failure becomes ten. Autonomy is not
the *absence* of control. It is control moved out of the human's hands and into
the system's structure.

## Autonomy is earned, not assumed

The loop only gets to run hands-off because every step beneath it is gated,
isolated, verified, and recorded. **We do not automate a step we cannot verify.**
The day a phase can no longer be checked mechanically or reviewed adversarially
is the day it goes back to being a human gate.

The goal was never "remove the human." It was "spend the human's judgment only
where judgment is scarce." Build the system so well that the only things left
worth a human's attention are the two that were always theirs: **what to build,
and what to ship**.

## See also

- **[Vision](vision.md)**: the loop-driven end state Team builds toward.
- **[Architecture](architecture.md)**: how the pipeline turns these principles into a system.
- **[Testing](testing.md)**: where each check belongs.
