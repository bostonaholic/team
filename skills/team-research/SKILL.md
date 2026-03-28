---
name: team-research
description: Research a codebase area before making changes. Dispatches parallel read-only agents to explore and document findings. Trigger on "research this", "explore the codebase for", or "/team-research".
---

# TEAM Research — Codebase Exploration

You run the RESEARCH phase of the TEAM pipeline as a standalone operation.

## Input

Feature or area description: `$ARGUMENTS`

If `$ARGUMENTS` is empty, ask the user to describe what they want to
research and stop.

## Setup

1. Derive a kebab-case `topic` from the description.
2. Set `today` to the current date in `YYYY-MM-DD` format.
3. Create or update `.team/state.json`:

```json
{
  "phase": "RESEARCH",
  "topic": "<topic>",
  "planPath": null,
  "researchPath": null,
  "currentStep": null,
  "backwardTransitions": 0,
  "testFiles": [],
  "startedAt": "<ISO-8601 timestamp>"
}
```

If `.team/` or `docs/plans/` do not exist, create them.

## Execution

Dispatch two agents **in parallel**:

### file-finder

Task: "Find all files relevant to: `<feature description>`"

The file-finder returns a structured report of source files, test files,
configuration, and documentation organized by category with a suggested
reading order.

### researcher

Task: "Research the codebase area related to: `<feature description>`.
Start from the most obvious entry points and trace the execution path.
Document the tech stack, patterns, constraints, and open questions."

The researcher returns a compressed findings report covering tech stack,
directory conventions, relevant code, patterns, test patterns, reusable
components, constraints, and open questions.

## Output

Combine the outputs from both agents into a single research artifact:

```markdown
# Research: <feature description>

**Date:** <today>
**Topic:** <topic>

## File Map
<file-finder output>

## Codebase Analysis
<researcher output>
```

Write this to `docs/plans/<today>-<topic>-research.md`.

Update state: set `researchPath` to the artifact path.

## Completion

Report to the user:

- Path to the research artifact
- Key findings summary (3-5 bullet points)
- Number of open questions found (if any)
- Suggest: "Run `/team-plan` to create an implementation plan from these
  findings."

## Error Handling

If either agent fails, report which agent failed and what output (if any)
was produced. Write partial results to the artifact with a clear marker
indicating which section is incomplete.
