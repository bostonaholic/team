---
name: systematic-debugging
description: Root cause investigation methodology — loaded by agents when debugging failures to enforce evidence-first diagnosis over guess-and-fix approaches
user-invocable: false
---

# Systematic Debugging

Never skip to fixing. Understand the cause first. A fix applied without
understanding the root cause is a coin flip — it may mask the symptom while
leaving the disease.

## 4-Phase Investigation

> Follow `skills/progress-tracking/SKILL.md`: when this procedure has two or more steps, seed one todo item per step before starting and mark each complete as you go.

### Phase 1: OBSERVE

Gather evidence before forming any theories. The goal is to build a factual
picture of what is happening.

- **Read error messages completely.** The first line is the symptom; the stack
  trace is the geography; the last frame before your code is where to look.
- **Reproduce the failure.** If you cannot reproduce it, you cannot verify
  your fix. Document the exact reproduction steps.
- **Collect multiple data points.** One error message is an anecdote. Three
  error messages are a pattern. Gather logs, stack traces, test output, and
  runtime state.
- **Note what IS working.** The boundary between working and broken code
  narrows the search space dramatically.
- **Record timestamps and sequence.** When did it start failing? What changed
  just before? Check git log, deployment history, and dependency updates.
- **Treat intermittency as evidence, not noise.** A test that fails 1 in 10
  runs is not "flaky" — it is reporting a real condition (timing, ordering,
  resource contention, hidden global state) that most invocations don't hit.
  The conditions that make a test intermittent are frequently the conditions
  that make the product intermittently misbehave in production. Record the
  failure rate (e.g., 3/30 runs), the variance across environments (local vs
  CI), what is concurrent/asynchronous/stateful in the path, and any shared
  state (`/tmp`, env vars, singletons, DB rows).

Do not hypothesize during OBSERVE. Just collect.

### Phase 2: HYPOTHESIZE

Form theories that explain ALL the observed evidence. A hypothesis that
explains only some observations is incomplete.

- **Generate multiple hypotheses.** Premature commitment to a single theory
  creates confirmation bias. List at least two plausible explanations.
- **Rank by likelihood.** Common causes before exotic ones. Configuration
  before code. Environment before logic.
- **Check consistency.** Each hypothesis must explain why the failure occurs
  AND why related functionality still works.
- **State what each hypothesis predicts.** If hypothesis A is correct, what
  else should be true? What should be false? These predictions become your
  tests.

### Phase 3: TEST

Validate or eliminate hypotheses through targeted experiments. Test by
elimination, not confirmation.

- **Design discriminating tests.** A good test eliminates at least one
  hypothesis regardless of the outcome. A test that can only confirm is
  subject to confirmation bias.
- **Change one variable at a time.** Multiple simultaneous changes make it
  impossible to attribute the result.
- **Record results immediately.** Note what you tried, what you expected,
  and what actually happened — even for negative results.
- **Eliminate definitively.** If a hypothesis is disproven, cross it off and
  do not revisit it unless new evidence emerges.
- **When you have a working baseline and a failing tip, bisect.** Don't
  reason from first principles about which of 40 commits broke it —
  `git bisect` is faster and more reliable. Each step discriminates half the
  commit range. The same logic applies to config changes, dependency
  versions, and feature-flag rollouts.

### Phase 4: CONCLUDE

Identify the root cause and design the fix.

- **Root cause, not proximate cause.** The proximate cause is "this variable
  is null." The root cause is "this function is called before initialization
  completes." Fix the root cause. To drill from the proximate cause down to the
  root, use the [Root Cause Analysis (5 Whys)](#root-cause-analysis-5-whys)
  technique below.
- **Verify the fix addresses the root cause.** The original reproduction steps
  must succeed after the fix. No other behavior should change.
- **Check for related instances.** If the root cause is a pattern (e.g.,
  missing null check), search for the same pattern elsewhere in the codebase.
- **Document what you found.** Future debuggers (including yourself) will
  benefit from knowing what was investigated and ruled out.

#### Root Cause Analysis (5 Whys)

To get from a proximate cause to a root cause, drill the causal chain. Take the
proximate cause and ask "why?" — the answer is the next link. Ask "why?" of
that link, and so on, until the chain bottoms out at a cause you can change.

- **Drill from proximate to root.** Start at the symptom and ask "why?"
  repeatedly: "the variable is null" → why? → "the loader returned early" →
  why? → "the config flag was unset" → why? → "the flag defaults to off in
  this environment." Each "why?" turns a symptom into the next, deeper cause.
- **Anchor every link in OBSERVE evidence.** Each answer must be grounded in a
  fact gathered in Phase 1 (a log line, a stack frame, a git change) — never a
  plausible-sounding guess. If you cannot point to evidence for a link, you have
  left the chain; go back to OBSERVE and collect more, do not invent the link.
- **Branch when a link has multiple causes.** If one "why?" has two or more
  contributing answers, drill each branch separately. The root is reached only
  when **every** branch bottoms out at a cause you can change.
- **Stop at a cause you can change.** Stop when the answer is something within
  your control to fix and one more "why?" would leave that control (e.g. a
  third-party default, a platform constraint, a human decision). Do not keep
  asking past that boundary — that is how you end up blaming the universe.
- **The chain can be length 1.** Some bugs are one "why?" from their root. Stop
  when you reach a controllable cause; do not manufacture five questions to hit
  a number. Five is the technique's name, not its quota.
- **Failure modes to avoid.** Stopping too early leaves you fixing a symptom.
  Going too far blames a person instead of a process, or blames the universe —
  fix the process the person operated, not the person. Fabricating a chain
  without evidence (see "Anchor every link" above) invents a root that isn't
  real. Single-track tunnel vision ignores a branch that also contributed.
- **Tie the terminal "why?" to the fix.** The fix belongs at the root link —
  the deepest controllable cause — not at any proximate link above it. The
  mutation check in `skills/team-fix/SKILL.md` (revert one line, confirm the
  test goes red) verifies the fix landed at the root and not on a symptom.
- **When the chain will not converge, escalate.** If "why?" keeps returning
  answers outside your control — never reaching a cause you can change — stop
  drilling and hand off to `## Escalation Rules` below rather than looping.

## Escalation Rules

### After 3 Failed Hypotheses

If three hypotheses have been tested and eliminated, the investigation scope
is too narrow. Expand:

- Widen the search to adjacent systems (database, network, OS, dependencies)
- Check for environmental differences (local vs CI, dev vs production)
- Re-examine assumptions made during OBSERVE — is the evidence itself reliable?
- Look for interactions between components that were assumed to be independent

### When to Escalate to the User

Escalate when you have exhausted reasonable investigation:

- All plausible hypotheses have been eliminated
- The failure depends on environment or configuration you cannot inspect
- The failure is intermittent and you cannot establish a reliable reproduction
- The root cause is in a third-party dependency or system outside your control

When escalating, provide:

1. What you observed (evidence)
2. What you hypothesized (theories)
3. What you tested and eliminated (experiments)
4. What you believe the remaining possibilities are (next steps)

Never escalate with "I don't know what's wrong." Always escalate with
"Here is what I've ruled out, and here is where I think the answer lies."
