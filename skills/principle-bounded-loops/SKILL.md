---
name: principle-bounded-loops
description: "Apply to loops, retries, watches, and output budgets: define and report the limit."
user-invocable: false
---

# Bounded Loops

**Invariant:** Every loop or output has a declared bound or terminal verdict;
reaching it is loud and terminal.

**Rules:**
- Declare limits for cycles, retries, polls, concurrent helpers, and output.
- At a numeric cap, halt and report all unresolved work. Never restart, extend,
  or soften exit criteria silently.
- Keep retry budgets small and explicit.
- A verdict may be the bound. Declare it and never invent a count the procedure
  omits; the operator is the outer bound. Team's DESIGN loop ends on the review
  verdict, and IMPLEMENT ends with no Blocking or Major findings. Neither has a
  round cap.
- When output exceeds its budget, drop whole units, restructure, and name every
  omission. Never truncate silently.

**Check:** Can this loop or output exceed its declared bound without a terminal
report?
