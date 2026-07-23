---
name: decomposing-intent
description: Artifact templates and decomposition procedure for the questioner agent — the task.md and questions.md body templates, the topic-slug rules, and the multi-repo detection flow. Loaded when a user's task description is decomposed into intent and neutral research questions.
user-invocable: false
---

# Decomposing Intent

The questioner's templates and procedure: capture the user's intent in
`task.md`, write neutral research questions in `questions.md`, and record
repo scope in `repos.md` when the topic spans more than one repository.

## The `topic` field

`topic` must be **identical across `task.md` and `questions.md`**. It is
the kebab portion of `<id>` — i.e. `<id>` minus the `<TICKET>-` or
`<YYYY-MM-DD>-` prefix the orchestrator added. Never use the ticket id,
the date, or a re-worded form of the description as the topic. Never
write a different topic in `questions.md` than the one in `task.md`.
Downstream phases (research, design, structure, plan) inherit the same
topic value; the full invariant and worked examples live in
`skills/artifact-frontmatter/SKILL.md`.

## task.md

Capture the user's intent in their own framing. Required frontmatter:

```yaml
---
topic: <kebab-case-topic>
date: <YYYY-MM-DD>
phase: task
ticketId: null               # set if a tracking ticket is tracking this work
---
```

`ticketId` lives **only** on `task.md` — no other artifact carries it
(rationale in `skills/artifact-frontmatter/SKILL.md`).

Then the body:

```markdown
# Task: <topic>

## Description
<the user's description verbatim, plus any obvious clarifications>

## Stated goal
<one sentence: what the user wants to achieve>

## Inferred goal
<one sentence: what they probably actually need — may be the same>

## Acceptance signals
- <how the user will know this is done, even if they did not say>

## Open assumptions
- <assumptions you are making about scope, users, or environment>
```

Keep this under 80 lines. The point is intent, not exhaustive detail.

When the feature request is vague or underspecified, spans multiple user
stories, is cross-cutting, or replaces existing behavior, Load
`skills/product-requirements-doc/SKILL.md` and produce
`docs/plans/<id>/prd.md` alongside `task.md`, referencing the PRD's path
from `task.md`. The full criteria live in that skill's "When to Write a
PRD" section; for simple, well-scoped requests, skip the PRD.

Required frontmatter for `prd.md` (the PRD rides the autonomous Question
phase — it is not human-gated, so it carries no `approved` or `revision`
fields):

```yaml
---
topic: <kebab-case-topic>
date: <YYYY-MM-DD>
phase: prd
---
```

## questions.md

Write neutral research questions that, when answered factually, give the
design-author everything it needs. Phrase questions about the **codebase**,
not about the **goal**. Bad: "How should we add rate limiting?". Good:
"Where do incoming HTTP requests enter the application and what middleware
chain do they pass through?"

Required frontmatter:

```yaml
---
topic: <kebab-case-topic>
date: <YYYY-MM-DD>
phase: questions
---
```

Then the body:

```markdown
# Research Questions: <topic>

## Codebase context
- Scope: <directory paths, modules, or subsystem labels under investigation>
- Vocabulary: <neutral term definitions used below — no statement of goal>

## Topology
- Where does <component class> live in this codebase?
- What modules consume / produce <relevant data>?

## Conventions
- What test framework, naming convention, and structure does the codebase use?
- What error-handling pattern is used for <relevant subsystem>?

## Constraints
- What types, schemas, or interfaces will any change in this area need to honor?
- What existing utilities or abstractions exist for <relevant capability>?

## Reference points
- What is the most representative existing implementation of a similar feature
  in this codebase, and where is it located?
```

Aim for 8–15 questions. Each should be answerable by reading code, not by
guessing intent. The "Codebase context" section replaces the legacy
`brief.md`: it is allowed to name files, modules, and vocabulary, but it
must NOT state the goal or desired outcome.

## Multi-repo detection

A topic may legitimately span more than one repository — frontend +
backend, an API + a shared SDK, a service + its infrastructure repo. If
that is the case, you must record the repos so the rest of the pipeline
can run worktrees, slices, plan steps, and PRs in each.

### When to suspect a multi-repo topic

Watch for these signals in the description:

- The user names two or more directories or projects (e.g. "the `web`
  app and the `api` service").
- The description says "across", "spans", "in both", or refers to a
  protocol/contract that lives in a third repo.
- The user references repos by absolute paths or by names that do not
  exist as subdirectories of the current repo (run `ls` to confirm).

If you suspect multi-repo, surface the question via the
agent-open-questions envelope before writing any artifacts, per the
protocol in `skills/agent-open-questions/SKILL.md`.

The envelope shape (single label-only question with header `Repos` and
two options):

```json
{
  "openQuestions": [
    {
      "question": "Does this topic span more than one repository?",
      "header": "Repos",
      "options": [
        { "label": "Single repo (Recommended if unsure)", "description": "The work happens entirely in the current repo." },
        { "label": "Multi-repo",                          "description": "The work spans the current repo and one or more others. If you pick this, the orchestrator will follow up with a plain-text question asking for each additional repo's slug and absolute path." }
      ]
    }
  ]
}
```

This is the **canonical worked example of the free-text escape hatch**
documented in `skills/agent-open-questions/SKILL.md`: because the
multi-choice prompt tool returns only the chosen `label` and not a
free-text field, the **Multi-repo** option's `description` declares
that the orchestrator will follow up with a plain-text question for
repo paths and slugs.

Path-and-slug collection is an **orchestrator responsibility**, not
yours. If the user picks **Multi-repo**, the orchestrator asks a
plain-text follow-up requesting one entry per line in the format
`<slug>: <absolute-path>`, validates each path with `git -C <path>
rev-parse --git-dir`, and `SendMessage`s the validated list (or any
validation errors) back to you as the resume payload.

On resume:

- If the orchestrator returns **Single repo**, proceed in single-repo
  mode and do not write `repos.md`.
- If the orchestrator returns **Multi-repo** with a validated list of
  `<slug>: <absolute-path>` pairs, write `repos.md` from that list per
  the schema in `skills/artifact-frontmatter/SKILL.md`.
- If the orchestrator returns validation errors instead, either
  re-emit the envelope (e.g. ask the user to confirm Single vs Multi
  again) or follow your existing error-handling guidance to surface the
  blocker.

### Writing `repos.md`

Required frontmatter:

```yaml
---
topic: <kebab-case-topic>
date: <YYYY-MM-DD>
phase: repos
---
```

Body — see the schema in `skills/artifact-frontmatter/SKILL.md`. The home
repo is whichever repo the orchestrator dispatched you in (the one
holding `docs/plans/<id>/`); use its absolute path. Each additional
repo gets a name slug (unique, kebab-case) and an absolute path.

Do not yet write the `## Worktrees` section — that is the orchestrator's
job during the WORKTREE phase.

### Don't infer multi-repo

If the description does not name additional repos and the user does not
confirm them, stay in single-repo mode. Inventing extra repos would
expand scope without consent. When in doubt, ask.

## Process

1. Read the user's description carefully. If it references existing code
   (file names, modules, error messages), grep/glob to confirm those exist.
2. **Decide repo scope.** Look for the multi-repo signals above. If
   present, surface the question via the agent-open-questions envelope
   (the orchestrator will render it and, on **Multi-repo**, follow up
   with a plain-text question for the additional repo paths).
3. Decide the topic slug (kebab-case, ~3 words).
4. Identify the codebase scope: which directories or modules — and in
   multi-repo mode, which repos — will research touch? Confirm by
   listing them.
5. Draft questions. For each, ask: "If a stranger answered this without
   knowing the goal, would the answer still be useful?" If no, rewrite.
   In multi-repo mode, scope each question to "in repo `<name>`, ..."
   so research can answer it in the correct repo.
6. Read the "Codebase context" section back: it should tell a stranger
   "what code exists here" without telling them "what we want to do with it".
7. Write `task.md` and `questions.md`. When the PRD criteria apply, also
   write `prd.md`. In multi-repo mode also write `repos.md`. Return the
   structured result.
