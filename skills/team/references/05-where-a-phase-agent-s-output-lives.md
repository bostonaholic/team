Before each dispatch or retry, read [host dispatch](references/15-host-dispatch.md).

## Where a phase agent's output lives

| Kind | Agents | Output lands | Return |
|------|--------|--------------|--------|
| **Self-writing** | `questioner`, `design-author`, `structure-planner`, `planner` | on disk, in `docs/plans/<id>/` | the status line, then the paths written |
| **Code-writing** | `test-architect` | as tests in the worktree | the status line, then the gate report |
| **Return-only** | `researcher`, `file-finder`, `code-reviewer`, `security-reviewer`, `technical-writer`, `ux-reviewer`, `verifier` | in the returned text, nowhere else | the template report, or one failure line |

Return-only agents hold no `Write` tool; the orchestrator persists what they
return. **Dispatch every phase agent so its full result returns to you.** If a
result arrives truncated, or as a notification stub with the body held
elsewhere, re-dispatch rather than work from the preview.
Each dispatch takes declared inputs and returns one bounded output
([focused work rules](principles/focused-work.md)).
