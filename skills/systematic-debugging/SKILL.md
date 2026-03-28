---
name: systematic-debugging
description: Root cause investigation methodology — loaded by agents when debugging failures to enforce evidence-first diagnosis over guess-and-fix approaches
---

# Systematic Debugging

Never skip to fixing. Understand the cause first. A fix applied without
understanding the root cause is a coin flip — it may mask the symptom while
leaving the disease.

## 4-Phase Investigation

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

### Phase 4: CONCLUDE

Identify the root cause and design the fix.

- **Root cause, not proximate cause.** The proximate cause is "this variable
  is null." The root cause is "this function is called before initialization
  completes." Fix the root cause.
- **Verify the fix addresses the root cause.** The original reproduction steps
  must succeed after the fix. No other behavior should change.
- **Check for related instances.** If the root cause is a pattern (e.g.,
  missing null check), search for the same pattern elsewhere in the codebase.
- **Document what you found.** Future debuggers (including yourself) will
  benefit from knowing what was investigated and ruled out.

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
