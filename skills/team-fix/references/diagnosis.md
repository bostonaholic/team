# Bug diagnosis reference

Read this when a failure is non-obvious, intermittent, or whose first fix would be a guess. Never skip to fixing: understand the cause first.

## 4-phase investigation

### Phase 1: OBSERVE

Gather evidence before forming any theory. Reproduce the failure and record exact steps. When the investigation leads to code that looks deliberate and the question becomes "why was it written this way" rather than "what broke", that is design-rationale archaeology — `skills/why/SKILL.md` owns it. Treat intermittency as evidence, not noise: record the failure rate, environment variance, and the timing, concurrency, resources, and shared state in the path.

Do not hypothesize during OBSERVE.

### Phase 2: HYPOTHESIZE

List at least two explanations that explain ALL the observed evidence. State what each hypothesis predicts, so a discriminating test can prove it wrong.

### Phase 3: TEST

Run a discriminating experiment that eliminates a hypothesis under either outcome. Keep disproved theories closed unless new evidence appears.

### Phase 4: CONCLUDE

Identify the root cause, not the proximate symptom. Make the original reproduction pass without changing unrelated behavior. Search for related instances and document evidence and eliminated theories.

#### Root Cause Analysis (5 Whys)

Ask why from the symptom and stop at a cause you can change. Anchor every link in OBSERVE evidence; branch when a link has multiple causes. The chain can be length one — five is the technique's name, not its quota. Fix the root link, not a proximate link above it.

## Escalation rules

### After 3 failed hypotheses

Widen to adjacent systems, environment differences, questioned evidence, and component interactions.

### When to escalate to the user

Escalate only after plausible hypotheses are exhausted, required environment is inaccessible, reproduction remains unreliable, or the cause is external. Give observed evidence, tested hypotheses, eliminated explanations, and remaining possibilities. Never return only "I do not know."
