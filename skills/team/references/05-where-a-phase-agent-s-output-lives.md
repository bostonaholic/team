## Where a phase agent's output lives

Phase agents split into two kinds, and the split decides what a lost result
costs:

| Kind | Agents | Output lands |
|------|--------|--------------|
| **Self-writing** | `questioner`, `design-author`, `structure-planner`, `planner` | on disk, in `docs/plans/<id>/` |
| **Return-only** | `researcher`, `file-finder` | in the returned text, nowhere else |

The return-only agents hold no `Write` tool by design — that is what keeps
research isolated (`agents/researcher.md`: "Do not attempt to write files
yourself"). The orchestrator persists what they return.

So a lost result is cheap for the first kind and total for the second. A
self-writing agent's work survives on disk and can be read back; a return-only
agent's work exists solely in the reply, so losing it means dispatching the
whole agent again. **Dispatch every phase agent so its full result returns to
you.** If a result arrives truncated, or as a notification stub with the body
held elsewhere, re-dispatch rather than working from the preview. A summary of
a research report is not a research report, and DESIGN downstream cannot tell
the difference until it is already reasoning from a gap.
Each dispatch is a narrow seam — declared inputs in, one bounded output back,
complexity inside the agent (`principle-deep-agents-narrow-seams`).
