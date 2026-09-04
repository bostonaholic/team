---
name: principle-skip-loudly
description: 'Defines skip loudly. Apply when its cross-cutting rule governs the current work.'
user-invocable: false
---

# Skip Loudly

Report every skipped pass, degraded mode, and deliberate omission on a named line; a silent skip is indistinguishable from one that had nothing to do.

- Keep every report section; when empty, it says so on its own line: "No findings.", "Not run: <reason>.", or "Nothing declared."
- Name which check skipped, what was unavailable, and what would have run.
- Name deliberate omissions, fence-skipped items, partially loaded data, and anything left on disk or the board.
- Describe each affected item with degraded wording such as "unverified" or "captured — not yet uploaded", never success wording.
