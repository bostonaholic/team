# Independent review

Producers change work and cast no review verdict. Fresh-context evaluators report defects and change nothing.
Give evaluators the artifact and upstream specification written before the work, without producer discussion or narration.
Require both roles to close a review cycle. Evaluators record open questions without asking the producer.
Assign each claim to one fresh judge. Never reuse a checker that judged earlier claims.

## Neutral investigation

- Give investigators neutral questions, vocabulary, and evidence sources. Withhold the desired answer and task framing.
- Restrict task-derived scout content to verbatim questions, stated `Codebase context`, and `4-repos.md` paths.
- Fixed operational paths, audit steps, tool limits, and output contracts are allowed. Add no intent speculation.
- Return missing context as an open question. Stop and report any intent leakage as a critical defect.
- Give verification helpers falsifiable claims with `file:line` and the applicable rule. Omit your verdict, severity, and reasoning.

## Enforced capabilities

Reviewers hold no `Write` or `Edit` tools and use `permissionMode: plan`. Prompts do not change actual grants.
Give child processes explicit environment allowlists and vendor-specific credentials, never the parent's full environment or another vendor's credentials.
Choose the narrowest capable target. Reject command-sink targets for required read-only work when a narrower target exists.
If only broader targets exist, state the prompt restriction and report that the structural guarantee is unavailable.
Required independent review never falls back into the producer's context. Stop when an independent reviewer cannot run.
