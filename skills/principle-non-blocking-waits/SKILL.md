---
name: principle-non-blocking-waits
description: 'Defines non blocking waits. Apply when its cross-cutting rule governs the current work.'
user-invocable: false
---

# Non-Blocking Waits

Waiting is not work. A wait on anything outside the session — CI, a
reviewer, a vendor CLI, a long job — is one **backgrounded** call that
ends when the thing being waited on ends. Never a foreground `sleep`,
and never a poll loop over a task whose completion the harness already
reports.

**Why:** a foreground wait spends a whole turn producing nothing, and it
is the turn, not the wall-clock, that costs. The session is idle either
way; the difference is whether the model is re-invoked once at the end or
once per fragment. A 24-hour watch built from foreground sleeps costs
~192 turns and re-sends the full context on each one. The same watch
built from backgrounded waits costs one turn per cycle.

A foreground wait is also **capped by the harness, not by your budget**.
Claude Code kills a foreground Bash call at 600 s. A stated
`timeout 1800` on a foreground call is a cap that never applies: the call
dies at ten minutes with exit 143, and whatever it was watching is lost.
Sizing sleeps to just miss the ceiling (`sleep 570`, `sleep 590`) trades
one failure for three turns and still drifts past the cap whenever the
host suspends.

**Pattern:**
- **Background the wait.** One Bash call with `run_in_background: true`.
  The harness re-invokes on exit, so the completion notification *is* the
  wake-up. No ceiling applies.
- **Put the poll inside the same backgrounded call** — `sleep <interval>;
  <poll command>`. One call per cycle, and the result is already in hand
  when the turn resumes.
- **Never poll a backgrounded task.** Its completion is reported. A
  `sleep 120; wc -c <output-file>` loop over a task the harness is
  already tracking pays for a notification twice.
- **Bound it as usual.** The cap in `skills/principle-bounded-loops/SKILL.md`
  is unchanged by where the wait runs — declare it, and make hitting it
  loud and terminal.
- **Fall back loudly.** Where a harness has no background execution, say
  so and chunk the wait into foreground calls sized under that harness's
  ceiling. Name the fallback at the call site; it is never the default
  shape.

**Below the threshold, wait inline.** A wait shorter than a single turn's
overhead stays in the foreground: settling for a few seconds after a push
before the first poll is cheaper inline than backgrounded. The rule
starts where a wait would otherwise be fragmented — roughly a minute and
up.
