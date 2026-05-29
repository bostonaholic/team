---
topic: surface-pipeline-open-questions
date: 2026-05-28
phase: research
---

# Research: surface-pipeline-open-questions

## Tech stack & conventions

- Markdown agent definitions with YAML frontmatter; no programming-language runtime
- Claude Code agent dispatch + the built-in `AskUserQuestion` tool
- Tools declared per-agent in the `tools:` frontmatter field
- `agents/*.md` — 13 specialist agent definitions
- `skills/*/SKILL.md` — methodology skills, some doubling as slash commands
- `docs/plans/<id>/` — per-topic artifact directory; every file carries YAML frontmatter

## File map (file-finder output)

### Agents that declare `AskUserQuestion`
- `agents/questioner.md:6` — `tools: Read, Write, Grep, Glob, Bash, AskUserQuestion`
- `agents/design-author.md:6` — `tools: Read, Write, Edit, Grep, Glob, AskUserQuestion`

### Agents that do NOT declare `AskUserQuestion`
- `agents/file-finder.md:6` — `Read, Grep, Glob`
- `agents/researcher.md:6` — `Read, Grep, Glob`
- `agents/structure-planner.md:6` — `Read, Write, Edit, Grep, Glob`
- `agents/planner.md:6` — `Read, Write, Edit, Grep, Glob`
- `agents/test-architect.md:6` — `Read, Write, Edit, Grep, Glob, Bash`
- `agents/implementer.md:6` — `Read, Write, Edit, Grep, Glob, Bash`
- `agents/verifier.md:6` — `Read, Grep, Glob, Bash`
- `agents/code-reviewer.md:6` — `Read, Grep, Glob, Bash`
- `agents/security-reviewer.md:6` — `Read, Grep, Glob, Bash`
- `agents/ux-reviewer.md:6` — `Read, Grep, Glob, Bash`
- `agents/technical-writer.md:6` — `Read, Grep, Glob, Bash`

### Skill / doc files in scope
- `skills/team/SKILL.md` — phase-table orchestrator; design + structure approval, PR shipping
- `skills/team-design/SKILL.md` — design phase execution
- `skills/team-structure/SKILL.md` — structure phase execution
- `skills/team-pr/SKILL.md` — PR phase execution (shipping options)
- `skills/qrspi-workflow/SKILL.md` — pipeline discipline + artifact conventions
- `skills/code-review/SKILL.md` — generator-evaluator separation
- `skills/eng-design-doc-review/SKILL.md` — optional design audit
- `docs/architecture.md` — phase-table orchestrator design (lines 264–293)

## Answers

### Q1 — Which agents declare `AskUserQuestion`?

See file map above. Only **two** of the 13 agents declare it: `questioner` and `design-author`. The other 11 are mechanically blocked from calling it (the runtime enforces `tools:`).

### Q2 — How are the two agents instructed to use `AskUserQuestion`?

**`agents/questioner.md:196–213`** (multi-repo detection):
> "If you suspect multi-repo, ask the user via `AskUserQuestion` before writing any artifacts. Use a single question with a `Repos` header and two options: **Single repo (Recommended if unsure)** [...] **Multi-repo** [...] If the user picks **Multi-repo**, follow up with a free-text `AskUserQuestion` for the absolute paths and short slug names of each additional repo."

**`agents/design-author.md:91–106`** (MANDATORY interactive step):
> "Before writing the design document, you MUST present open questions to the user and wait for answers. Do not draft the design first and then ask. Use the `AskUserQuestion` tool — Claude Code's built-in multi-choice prompt — to surface each question. Do **not** print a markdown numbered list and wait for free-text replies; `AskUserQuestion` renders the choices as a structured form, captures the user's selection (with optional notes), and ensures every question has a labeled trade-off. Present at most 3–5 sharp questions in a single `AskUserQuestion` call (the tool accepts 1–4 questions per call; if you truly need 5, split into two calls)."

Also `agents/design-author.md:76–85` (repo-scope case) and `agents/design-author.md:138–139` (revision dispatch case).

### Q3 — How does the orchestrator treat subagent text output vs. structured tool calls?

`skills/team/SKILL.md` does **not** describe this distinction. The skill describes return values as structured JSON summaries (e.g., `{designPath, id, openQuestionsResolved: <number>}` at `agents/design-author.md:221–223`) or prose reports. The orchestrator's phase loop at `skills/team/SKILL.md:64–66` says:
> "4. Dispatch the agent(s) (parallel where the phase table marks them). 5. Write each returned artifact to docs/plans/<id>/<name>.md with the YAML frontmatter the agent specifies"

This describes consuming **artifact files on disk**, not streaming tool-call output. There is no documentation of how subagent-emitted tool calls vs. prose are routed.

### Q4 — Are subagent tool calls visible to orchestrator / user?

No skill or agent file states this explicitly. The QRSPI research-isolation section (`skills/qrspi-workflow/SKILL.md:206–219`) calls enforcement "procedural" (prompt-based) rather than "structural" (mechanically enforced):
> "A PreToolUse(Read) hook that blocks `*/task.md` reads from the research agents would convert step 2 from procedural to structural."

The implication: subagent tool invocations are not mechanically intercepted by the orchestrator. The only inter-boundary communication mechanism documented is disk artifacts.

### Q5 — Every place the orchestrator calls `AskUserQuestion`

**Site 1 — Design approval gate** (`skills/team/SKILL.md:131–136`):
> "Use `AskUserQuestion` to capture the verdict. Use a single question with a `Decision` header and three options: **Approve**, **Request changes**, **Reject**."

Result: Approve → set `approved: true` + `approved_at`; Request changes → re-dispatch `design-author` with feedback, increment `revision`; cap at `revision: 5`.

**Site 2 — Structure approval gate** (`skills/team/SKILL.md:145–147`):
> "Same mechanics as design, applied to `docs/plans/<id>/structure.md`. Use `AskUserQuestion` for the verdict the same way."

**Site 3 — PR shipping options** (`skills/team/SKILL.md:210–212`, full text in `skills/team-pr/SKILL.md:103–111`):
> "Present shipping options via `AskUserQuestion` (header `Ship`): **Open PR**, **Keep commits locally**, **Keep as-is**."

**Site 4 — Empty arguments fallback** (`skills/team/SKILL.md:29`):
> "If `$ARGUMENTS` is empty, ask the user to describe the feature and stop."

No explicit `AskUserQuestion` call documented here.

**General canonical rule** (`skills/team/SKILL.md:236–240`):
> "`AskUserQuestion` is the canonical Claude Code tool for any multi-choice user prompt — design/structure approval, worktree-vs-in-place, shipping options. Free-text prompts ('Do you approve?') are not the convention."

### Q6 — How do non-`AskUserQuestion` agents handle ambiguity?

- **`structure-planner`** (`agents/structure-planner.md:159–163`): No ambiguity-handling pattern. Returns `{structurePath, id, sliceCount}`.
- **`planner`** (`agents/planner.md:122–128`): "Do not re-litigate design decisions. The design is approved. Do not re-slice the work. The structure is approved." No escalation path.
- **`verifier`** (`agents/verifier.md`): PASS/FAIL only; "No opinions."
- **`code-reviewer`** (`agents/code-reviewer.md:66–69`): Verdicts (APPROVE / REQUEST CHANGES / COMMENT). No user-facing question mechanism.
- **`security-reviewer`** (`agents/security-reviewer.md:119–126`): PASS/FAIL.
- **`implementer`** (`agents/implementer.md:138–143`):
  > "1. Document the blocker — what is blocked, why, and what would unblock it. 2. Continue with the next unblocked slice if the structure allows it. 3. Return to blocked slices after completing unblocked work."
  Within-agent workaround; no user routing.

**Pattern:** non-`AskUserQuestion` agents either (a) emit all output to disk artifacts and rely on the orchestrator to relay, (b) report structured pass/fail, or (c) proceed autonomously.

### Q7 — Documentation distinguishing orchestrator vs. subagent tool calls?

None. No skill or agent file contains a section that explicitly distinguishes user-visibility of orchestrator-level `AskUserQuestion` calls vs. subagent-level calls. The canonical-tool passage at `skills/team/SKILL.md:236–240` establishes `AskUserQuestion` as the orchestrator's tool but does not address whether subagents calling it reach the user.

### Q8 — Precondition language in `design-author.md`

`agents/design-author.md:91–95` — mandatory precondition with explicit prohibition:
> "## MANDATORY interactive step
> Before writing the design document, you MUST present open questions to the user and wait for answers. Do not draft the design first and then ask."

`agents/design-author.md:189–191` — Rules-section hard rule:
> "**Interactive before written.** Open questions go to the user first via `AskUserQuestion`; the document captures their answers as `## Decisions made`. Never draft the document and then ask."

Phrased as **MUST / MANDATORY / Never** — precondition, not suggestion.

### Q9 — Fallback if `AskUserQuestion` is unavailable?

**No agent file defines a fallback.** `design-author` only rules out the prose-question fallback (`agents/design-author.md:97–98`):
> "Do **not** print a markdown numbered list and wait for free-text replies"

Without a defined fallback, the agent is forced to invent one when it (incorrectly) concludes the tool is unavailable — which is exactly the symptom in the user's report.

### Q10 — How do agents communicate ambiguity back per `qrspi-workflow/SKILL.md`?

`skills/qrspi-workflow/SKILL.md` has **no dedicated section** on this. The artifact-convention section (`skills/qrspi-workflow/SKILL.md:100–119`) describes disk files as the communication protocol. The research-isolation section (`skills/qrspi-workflow/SKILL.md:215–216`) offers the closest guidance:
> "If a researcher needs context the questions lack, it must surface that as an open question rather than guessing the intent."

But "surface that as an open question" is not specified mechanically — neither as a `AskUserQuestion` call nor as a return-value field nor as an artifact section.

### Q11 — Exact orchestrator design-approval call structure

`skills/team/SKILL.md:131–136`:
> "Use `AskUserQuestion` to capture the verdict. Use a single question with a `Decision` header and three options: **Approve**, **Request changes**, **Reject**."

No inline tool-call syntax block in `skills/team/SKILL.md`. The canonical example shape appears at `agents/design-author.md:119–131`. `skills/team-design/SKILL.md:78–88` gives more option-text detail:
> "**Approve** — design is ready; advance to STRUCTURE. **Request changes** — describe what to revise; re-dispatch `design-author` with the user's feedback verbatim. **Reject** — abandon this design and start over."

Result handling (`skills/team/SKILL.md:137–141`): Approve → edit frontmatter `approved: true` + `approved_at: <ISO-8601>`; Request changes → re-dispatch with feedback verbatim, increment `revision`.

### Q12 — Any precedent of a subagent successfully running an interactive `AskUserQuestion` flow?

The only two subagents that could attempt it are `questioner` and `design-author`. Both **presuppose** it works:
- `agents/design-author.md:91–138` — entire MANDATORY interactive step assumes the call lands with the user
- `agents/questioner.md:196–213` — multi-repo detection assumes the same

But **no documentation or test confirms** a subagent's `AskUserQuestion` call is user-visible end-to-end. The only **documented working** interactive pattern is the orchestrator calling `AskUserQuestion` directly (the three sites in Q5).

## Constraints observed

- **Hard:** Only `questioner` and `design-author` declare `AskUserQuestion`. The other 11 agents are mechanically excluded by their `tools:` frontmatter.
- **Hard:** No fallback behavior is documented anywhere if `AskUserQuestion` is unavailable in a subagent.
- **Hard:** Disk artifacts under `docs/plans/<id>/` are the only documented inter-agent communication protocol; no return-value schema for "open questions" exists.
- **Soft:** The "MUST / MANDATORY / Never" instruction style is used only in `design-author` for the interactive step; nothing else in the codebase uses comparable insistence.

## Patterns observed

- Orchestrator-level `AskUserQuestion` calls are clearly documented at three sites (design gate, structure gate, PR ship) and all use the same shape: single question, named header, 2–3 labeled options with trade-offs.
- Subagent-level `AskUserQuestion` calls are documented in two agent files but the runtime behavior (does the call actually surface to the user, or get swallowed?) is undocumented and untested.
- Agents without `AskUserQuestion` are silent on ambiguity escalation — they self-resolve, defer to artifacts, or proceed.
