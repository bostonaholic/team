# Rubric: nested-agents skill

1. The dispatch plan treats nested spawning as an optimization, not a
   dependency — it names an inline fallback for when the `Agent` tool is
   unavailable rather than stalling or reporting failure.
2. Helpers are read-only (Explore / file-finder / read-only general-purpose)
   and bounded (one level deeper, at most ~4 in flight); the verification
   request states the finding as a neutral, falsifiable claim to be refuted
   rather than handing the helper the verdict.
