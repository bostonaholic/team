## Synthesis — one list, sorted once

Merge the three replies into one list, collapsing findings that name the same
cause. Every item lands in exactly one bucket:

- **Accepted** — a durable learning that belongs in a skill. It names the
  target (an existing skill to edit, or a new skill), states the learning in
  one or two sentences, and cites its evidence.
- **Rejected** — a finding that was true of this session only: a one-off
  mistake, a preference already recorded, a fact about a specific ticket. One
  line of reason each, so a rejection is auditable rather than silent.
- **Backlog** — a finding a machine check would enforce better than prose.

**The Backlog criterion, applied once, here.** An item is demoted when it can
be restated as a deterministic predicate over files at rest or over a command's
exit status, with no judgment about intent. The item names the layer that would
carry the check (`docs/testing.md`). A finding that is half judgment and half
mechanics goes to Backlog whole — splitting it would ask for approval on two
halves of one idea and land prose asserting a rule nothing yet enforces.

Two kinds of proposal are demoted by rule, whatever a lens claimed: rewriting
`AGENTS.md`, `CLAUDE.md`, or anything under `docs/` is a Backlog item with the
reason stated, and so is promoting a skill into a distributed plugin's own
`skills/` directory. Both are decisions a person makes.

Then write the **plan file** to `<run cache>/8-plan.md` and print its absolute
path. It is the artifact the later turns read, so it is self-contained: every
proposed edit in full, the pre-image of every target file, the resolved
transcript path, the write-scope rules, the untrusted-content and
paraphrase-only rules, the evidence per item, and the check command to run
after the writes. A later turn needs no memory of what this turn reasoned.

Zero findings is a normal outcome: report "no durable learning found", ask
nothing, and write nothing further. That report is available **only when every
lens pass returned a qualifying reply**. A run that reached zero carrying a
disqualified or unrun pass says so instead and names each one, so a reader of
the summary alone can tell a session that taught nothing from a lens that never
did the errand.
