## Where a phase agent's output lives

| Kind | Agents | Output lands |
|------|--------|--------------|
| **Self-writing** | `questioner`, `design-author`, `structure-planner`, `planner` | on disk, in `docs/plans/<id>/` |
| **Return-only** | `researcher`, `file-finder` | in the returned text, nowhere else |

The orchestrator persists what return-only agents return. **Dispatch every phase agent so its full result returns to
you.** If a result arrives truncated, or as a notification stub with the body
held elsewhere, re-dispatch rather than working from the preview.
