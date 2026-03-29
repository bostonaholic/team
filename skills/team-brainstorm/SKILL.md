---
name: team-brainstorm
description: Optional collaborative brainstorming phase before research — explores user intent, requirements, and design alternatives interactively. Trigger on "/team-brainstorm <idea>" or prefix the full pipeline with brainstorming by running this before /team.
---

# TEAM Brainstorm — Optional Pre-Research Phase

Run a collaborative brainstorming session to explore a feature idea before
committing to implementation. This phase is interactive — it asks questions,
surfaces alternatives, and produces a refined feature specification that the
full TEAM pipeline can act on.

Use this when:
- The feature idea is vague and needs shaping before research
- You want to explore design alternatives before committing to one direction
- You are unsure whether a feature is worth building at all

Skip this phase when:
- The feature is clearly specified and the implementation path is obvious
- You want autonomous end-to-end execution without interactive questions

## How It Fits the Pipeline

```
[BRAINSTORM] → RESEARCH → PLAN → TEST → IMPLEMENT → VERIFY → SHIP
```

Brainstorming is optional. It produces a refined feature specification that
feeds into the RESEARCH phase. You can proceed directly to `/team <spec>`
with the output, or run `/team-brainstorm` first and then `/team` with the
refined spec.

## Session Flow

### 1. Intent Clarification

Ask one to three focused questions about the feature:

- **What problem does this solve?** Understand the user's pain point, not
  just the requested feature. Sometimes the best solution is not the feature
  requested.
- **Who is the user?** Developer, end user, ops team? Different users have
  different needs even for the same feature.
- **What does success look like?** How will the user know the feature is
  working? What would make them abandon it?

Do not ask more than three questions at once. If you need more, ask in
rounds after getting answers.

### 2. Alternatives Exploration

For the stated goal, briefly sketch two to three approaches:

```
## Approach A: [name]
[One paragraph: what it does, when it is better, what it trades away]

## Approach B: [name]
[One paragraph: what it does, when it is better, what it trades away]

## Approach C: [name] (optional)
[One paragraph: what it does, when it is better, what it trades away]
```

Present the approaches and ask which direction resonates, or whether there is
a different direction not covered.

### 3. Scope Negotiation

Once a direction is chosen, negotiate the scope boundary:

- **Must have for v1:** What is the minimum that delivers the core value?
- **Nice to have:** What would be great but can wait?
- **Out of scope:** What are you explicitly NOT doing in this iteration?

The output of scope negotiation is a short list of in-scope requirements that
becomes the input to RESEARCH.

### 4. Produce the Refined Spec

When the brainstorming session reaches agreement, output a refined feature
specification:

```markdown
## Refined Feature Specification

**Feature:** [name]

**Problem:** [one sentence: what pain does this solve?]

**Approach:** [which approach was chosen and why]

**Scope:**
- [in-scope requirement 1]
- [in-scope requirement 2]
- ...

**Out of scope:**
- [explicitly excluded item 1]
- [explicitly excluded item 2]

**Success criteria:**
- [how we know it's working]

**Suggested next step:** /team <refined spec>
```

## Rules

- **Ask before assuming.** The purpose of brainstorming is to surface
  intent, not to assume it. If anything is unclear, ask.
- **Prefer fewer, better questions.** Three focused questions beat ten
  scattered ones. Think about what single answer would most change the
  design direction.
- **Alternatives, not advocacy.** Present approaches neutrally. Do not push
  toward one option unless the user asks for a recommendation.
- **Time-box.** A brainstorming session should conclude in one to three
  rounds. If it goes longer, suggest narrowing the scope.
- **End with a clear action.** The session always ends with a refined spec
  and a suggested `/team` command the user can run.

## Example Session

```
User: /team-brainstorm add a notification system

Agent: To shape this well, a few questions:
1. What triggers a notification — pipeline events (e.g., verification failed),
   user-initiated actions, or both?
2. Who receives notifications — only the person who ran /team, or configurable
   recipients?
3. Where should notifications go — terminal output only, or external channels
   like Slack or email?

User: Pipeline events only, just the person who ran it, terminal output is fine
      but Slack would be great too.

Agent: Based on that, here are two approaches:
...
[session continues]
...

## Refined Feature Specification

**Feature:** Pipeline event notifications

**Problem:** Users running /team have no visibility into pipeline progress
without watching the terminal continuously.

**Approach:** Event-log-driven notifications that emit terminal output for
each pipeline phase transition, with optional Slack webhook for async delivery.

**Scope:**
- Emit a terminal notification on each major phase transition
- Optional Slack webhook via environment variable
- Notify on pipeline completion (success and failure)

**Out of scope:**
- Email notifications
- Per-agent granular notifications
- Notification preferences UI

**Success criteria:**
- Running /team with TEAM_SLACK_WEBHOOK set sends a Slack message on completion
- Terminal output shows phase transitions without user intervention

**Suggested next step:** /team add pipeline event notifications with terminal output and optional Slack webhook
```
