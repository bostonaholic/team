---
name: principle-files-are-the-contract
description: "Apply when passing state between steps, agents, sessions, or runs. Write the durable artifact to disk and treat the file as the interface; never rely on conversation memory."
user-invocable: false
---

# Files Are the Contract

The conversation is ephemeral; the artifact on disk is durable. Every phase
of work writes a file that declares what it is and whether its gate passed,
and steps communicate through those files — never through shared chat
memory. Trusting "the model will remember" fails about one time in five.

**Why:** A file survives a truncated context, a compaction, a crash, a new
session, and a handoff to a different agent. The state lives on disk, not
in memory. The file is the value passed between steps, and it is immutable
history once written.

**Pattern:**
- A step that produced no artifact did not happen. Write the file before
  reporting the step done.
- Pass a path, not a paraphrase: the consumer reads the artifact itself,
  never the producer's summary of it.
- Rebuild in-session state (ledgers, phase tables) by scanning the
  artifacts; after any interruption the files are authoritative.
- Long procedures checkpoint to an append-only log, so a fresh context can
  resume from disk instead of from recollection.
- Record decisions, approvals, and pre-images in the artifact directory,
  so a later turn — or a later run — can audit what happened.
