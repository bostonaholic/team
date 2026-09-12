# Bug diagnosis reference

Read this when a failure is non-obvious, intermittent, or whose first fix would be a guess. Never skip to fixing: understand the cause first.

## 4-phase investigation

### Phase 1: OBSERVE

Gather evidence before forming any theory.

- Read error messages and stack traces completely.
- Reproduce the failure and record exact steps.
- Collect multiple data points: logs, stack traces, test output, runtime state.
- Note what still works — the boundary between working and broken narrows the search.
- Record timestamps and sequence: what changed just before, in git, deploys, or dependencies. When the trail leads to code that looks deliberate and the question becomes "why was it written this way" rather than "what broke", that is design-rationale archaeology — `skills/why/SKILL.md` owns it.
- Treat intermittency as evidence, not noise. Record the failure rate, environment variance, and the timing, concurrency, resources, and shared state in the path.

Do not hypothesize during OBSERVE.

### Phase 2: HYPOTHESIZE

List at least two explanations that explain ALL the observed evidence. Rank common causes before exotic ones; configuration before code; environment before logic. State what each hypothesis predicts, so a discriminating test can prove it wrong.

### Phase 3: TEST

Run a discriminating experiment that eliminates a hypothesis under either outcome. Change one variable at a time. Record expected and actual results immediately. Keep disproved theories closed unless new evidence appears. With a working baseline and failing tip, use `git bisect`; apply the same binary search to config, dependency, or feature-flag ranges.

### Phase 4: CONCLUDE

Identify the root cause, not the proximate symptom. Make the original reproduction pass without changing unrelated behavior. Search for related instances and document evidence and eliminated theories.

#### Root Cause Analysis (5 Whys)

Ask why from symptom to a cause you can change. Anchor every link in OBSERVE evidence; branch when a link has multiple causes; stop at a cause you can change. The chain can be length one — five is the technique's name, not its quota. Fix the root link, not a proximate link above it. The mutation check proves the regression test depends on the fix. Blame the process, not the person.

## Escalation rules

### After 3 failed hypotheses

Widen to adjacent systems, environment differences, questioned evidence, and component interactions.

### When to escalate to the user

Escalate only after plausible hypotheses are exhausted, required environment is inaccessible, reproduction remains unreliable, or the cause is external. Give observed evidence, tested hypotheses, eliminated explanations, and remaining possibilities. Never return only "I do not know."
