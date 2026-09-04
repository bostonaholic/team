---
name: decomposing-intent
description: 'Defines decomposing intent methodology. Load when agents need its procedure.'
user-invocable: false
---

# Decomposing Intent

Capture user intent in `1-task.md`, neutral codebase questions in `2-questions.md`, conditional requirements in `3-prd.md`, and resolved multi-repo scope in `4-repos.md`.

## Artifact invariants

`topic` is identical across artifacts: the kebab portion of `<id>` after removing `<TICKET>-` or `<YYYY-MM-DD>-`. The questioner chooses it once; downstream phases copy it verbatim. Never use the ticket, date, or a rewording. `ticketId` appears only in `1-task.md`. Full schema: `skills/artifact-frontmatter/SKILL.md`.

Read [references/artifact-templates.md](references/artifact-templates.md) before writing the artifacts. Keep `1-task.md` under 80 lines. Write 8–15 questions answerable from code. `Codebase context` may name files, modules, and vocabulary, but MUST NOT state the goal or desired outcome; it replaces legacy `brief.md`.

Call `product-requirements-doc` when a request is vague/underspecified, spans multiple user stories, is cross-cutting, or replaces existing behavior. Then write `docs/plans/<id>/3-prd.md` with `phase: prd` and reference it from `1-task.md`. Skip it for simple, well-scoped requests.

## Research isolation

Phrase questions about the codebase, never the goal. Bad: “How should we add rate limiting?” Good: “Where do incoming HTTP requests enter the application and what middleware chain do they pass through?” Each question must remain useful to a stranger who does not know the feature (`principle-blind-the-investigator`).

## Multi-repo safety

Infer multiple repos only when the description names them or explicitly names cross-repo scope; otherwise use single-repo mode and record that assumption. Never invent or silently expand scope.

Resolve candidate repos autonomously. First require each `<name>` to match `^[A-Za-z0-9._-]+$` and not equal `.` or `..`; path separators, absolute paths, traversal, `$()`, backticks, and other shell metacharacters fail. Pass names/paths as single argv arguments, never interpolate them into shell strings (`principle-never-interpolate`).

Resolve `<name>` only at `<root>/../<name>`. Require `git -C <path> rev-parse --git-dir` and require `realpath "<root>/../<name>"` to equal `"$(dirname "$(realpath "<root>")")/<name>"`; symlink escapes fail. If every candidate resolves, write `4-repos.md`. If any fails, write none, proceed single-repo, and name the omitted repo in `1-task.md` `## Open assumptions` (`principle-record-assumptions`). Read [references/multi-repo.md](references/multi-repo.md) before resolution or writing.

## Process

1. Read the description. Verify named files, modules, and error messages with grep/glob.
2. Resolve repo scope through the safety rules above.
3. Choose an approximately 3-word kebab-case topic.
4. List the directories/modules—and repos—that research will inspect.
5. Draft neutral questions; in multi-repo mode prefix each with `in repo <name>`.
6. Confirm `Codebase context` describes existing code without desired behavior.
7. Write `1-task.md`, `2-questions.md`, and conditional `3-prd.md`/`4-repos.md`; return the structured result.
