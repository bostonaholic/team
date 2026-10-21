# Bug diagnosis reference

Read this when a failure is non-obvious, intermittent, or its first fix would be a guess.

## 4-phase investigation

### Phase 1: OBSERVE

Gather evidence before any theory; do not hypothesize yet.

- Read errors and stack traces completely; reproduce and record exact steps.
- Note what still works; trace a bad value back to where it was produced, comparing the working path.
- Record what changed just before (git, deploys, dependencies). When the question becomes "why was it written this way", trace the introducing commit (`git log -S`, `git blame` on the parent revision) and its PR or issue before changing the code.
- Intermittency is evidence: record failure rate, environment variance, and the timing, concurrency, resources, and shared state in the path.

### Phase 2: HYPOTHESIZE

List at least two hypotheses that explain ALL the evidence, common before exotic, configuration before code, environment before logic. State what each predicts.

### Phase 3: TEST

Run a discriminating experiment that eliminates a hypothesis either way, changing one variable at a time and recording expected and actual results. With a working baseline and failing tip, use `git bisect`; binary-search config, dependency, or feature-flag ranges likewise.

### Phase 4: CONCLUDE

Fix the root cause, not the proximate symptom; the original reproduction passes with no unrelated behavior change. Search for related instances; document evidence and eliminated theories.

#### Root Cause Analysis (5 Whys)

Ask why from the symptom and stop at a cause you can change. Anchor every link in OBSERVE evidence; branch when a link has multiple causes. The chain can be length one. Fix the root link, not one above it.

## Escalation rules

### After 3 failed hypotheses

Widen to adjacent systems, environment differences, questioned evidence, and component interactions.

### When to escalate to the user

Only after plausible hypotheses are exhausted, the required environment is inaccessible, reproduction stays unreliable, or the cause is external. Give evidence, eliminated hypotheses, and remaining possibilities.
