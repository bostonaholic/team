---
topic: gate-llm-ci-jobs-on-pr-author
date: 2026-06-09
phase: structure
approved: true
approved_at: 2026-06-09T23:45:00Z
revision: 1
---

# Structure: gate-llm-ci-jobs-on-pr-author

The design ships a two-layer gate plus one fail-fast guard. Each layer is
independently demonstrable, so each is its own vertical slice. Every YAML
policy check goes in the **free static gate** (`tests/static-gate.test.ts`,
L2 tripwire) per TESTING.md — workflow contracts are deterministic and
already validated there. The guard is a pure-unit L1 test in
`tests/helpers/session-runner.test.ts`. No paid `*.evals.ts` test is
warranted; nothing here drives a live model.

Slice order follows user value: the repo owner's concrete demand is to stop
token-cost griefing from PRs *now* (design §"specific user"), so the
code-reviewable author gate ships first. The fail-fast guard and the
environment-scoped backstop harden the same outcome and follow.

## Slices

### Slice 1: Author gate on the PR-triggered token seam
**Goal:** An untrusted author's PR skips every token-consuming job/step on
`pull_request`; a trusted author's (OWNER/MEMBER/COLLABORATOR) PR runs them.
**Layers touched:** workflow YAML (`harness-checks.yml`, `behavioral-evals.yml`),
static-gate tripwire test.
**Tests:**
- `static gate: author gate` — `harness-checks.yml` contains the canonical
  trust expression `contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'),
  github.event.pull_request.author_association)` as a job/step-level `if:`,
  applied to the PR #32 mocked gate-eval seam (the step where paid execution
  could later attach). (Boundary: OWNER/MEMBER/COLLABORATOR trusted —
  design Edge cases.)
- `static gate: untrusted authors excluded` — the trust allowlist contains
  none of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, `NONE` (asserts the regex/
  string literal excludes them), proving Dependabot (`CONTRIBUTOR`) and
  external/first-time contributors skip. (Authorization edge cases.)
- `static gate: gate sits on every token job` — every job/step in
  `behavioral-evals.yml` and `harness-checks.yml` that references a secret or
  a `claude`/eval spawn carries the trust `if:` (or carries no PR trigger).
  Covers the #32 `discover` job pattern so an untrusted author never triggers
  discovery (empty-matrix edge case). (Design Decision 1, Decision 4.)
**Verification checkpoint:** `bun test` passes the three new tripwires;
reviewer reads the single `if:` lines in the workflow diff. Demonstrable in
isolation — the gate is visible and tested without slices 2–3.
**Atomic commit message:** `ci: gate token-consuming PR jobs on author_association`

### Slice 2: Fail-fast guard on the live-spawn path
**Goal:** When the harness reaches the live `claude` spawn with an empty
`EVALS_ANTHROPIC_API_KEY`, it throws a named error immediately instead of
spawning the CLI and failing at auth.
**Layers touched:** `tests/helpers/session-runner.ts` (guard after the
`EVALS_MOCK_AGENT` seam, before building `args`), `session-runner.test.ts`
(pure-unit L1).
**Tests:**
- `runAgentTest: throws on empty API key at live path` — with
  `EVALS_MOCK_AGENT` unset and `EVALS_ANTHROPIC_API_KEY` empty/unset,
  `runAgentTest` rejects with an error naming the missing variable
  ("EVALS_ANTHROPIC_API_KEY is empty; refusing live spawn") and never
  spawns. (Failure edge case — live path with empty key.)
- `runAgentTest: mock path unaffected by empty key` — with
  `EVALS_MOCK_AGENT` set and the key empty, the existing mock replay still
  succeeds (guard fires only after the mock seam). (Risk mitigation:
  behavior change in session-runner — design Risks.)
**Verification checkpoint:** `bun test` runs both unit tests; the second
proves local mock dev is unaffected. No subprocess, no money. Demonstrable
without slices 1 or 3.
**Atomic commit message:** `fix(evals): fail fast when live spawn has no API key`

### Slice 3: Environment-scoped secret backstop
**Goal:** `EVALS_ANTHROPIC_API_KEY` is reachable only by jobs that declare
`environment: evals`; the one-time repo settings change is documented so the
backstop is reproducible.
**Layers touched:** `behavioral-evals.yml` (`environment: evals` declaration
+ forbid-`pull_request_target` comment + one-time-setup comment), PR body
(settings doc), static-gate tripwire test.
**Tests:**
- `static gate: evals environment declared` — `behavioral-evals.yml` declares
  `environment: evals` on the token job, and the workflow carries a comment
  banning `pull_request_target` for token jobs. (Design Decision 1,
  Decision 5; Resource edge case — fork PR key unreachable.)
- `static gate: no pull_request_target token trigger` — neither workflow
  triggers paid execution on `pull_request_target` (tripwire asserts the
  forbidden trigger is absent / not used for a secret-consuming job).
  (Design Decision 5 — hard ban.)
**Verification checkpoint:** `bun test` passes the two tripwires; PR body
documents the `evals` environment setup (required reviewers and/or main-only
branch restriction). The `environment: evals` declaration fails closed if the
environment is absent (secret simply unavailable) — design Risks. Demonstrable
without slices 1–2.
**Atomic commit message:** `ci: scope EVALS_ANTHROPIC_API_KEY to a protected evals environment`

## Cross-slice concerns

- **Canonical trust expression (contract).** The exact string
  `contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'),
  github.event.pull_request.author_association)` is the shared contract across
  every gated job. Defined and asserted verbatim in **Slice 1**; reused
  wherever a token job appears. Applying it verbatim is what lets the
  tripwire match identically (design Patterns).
- **#32 / #47 coexistence.** Both in-flight PRs edit the same job headers.
  Every slice keeps additions to single `if:` lines / declaration lines on
  existing blocks and does not restructure the matrix (design Risks —
  merge-conflict coexistence). The Slice 1 tripwire must tolerate either the
  static matrix (#47) or the dynamic `discover` matrix (#32) — assert on the
  presence of the `if:` on token jobs, not on a fixed job list. The
  planner/implementer reconciles `if:` placement against whichever PR lands
  first (design Open questions).
- **Where the gate is asserted.** All workflow-policy checks land in the
  existing `tests/static-gate.test.ts` free gate (TESTING.md L2); the guard
  check lands in `tests/helpers/session-runner.test.ts` free L1. No
  `*.evals.ts` file is touched — no paid tier involved.

## Out of structure

Restated from design §"Out of scope" so the planner does not pull these in:

- Org-team membership lookup or any trust source beyond `author_association`
  plus the owner.
- A reusable workflow or composite action to DRY the `if:`.
- The "Require approval for all outside collaborators" Actions setting as the
  *primary* gate (backstop only; not configured here).
- Rate limiting / quota on free harness-check runners for fork PRs.
- Resolving the #32/#47 mutual conflict (the merge author's job).
- Migrating `harness-checks.yml` to consume secrets or run paid suites — it
  stays free; the gate is defensive against a *future* paid attach.

## Implementation addendum (review round 2)

During implementation the acceptance-test names were refined for honesty and
per-assertion diagnosability. The approved slices above are unchanged; this
table records the mapping from each original spec name to its final test
name(s) so traceability holds.

| Original spec name (slice) | Final test name(s) | Reason |
|---|---|---|
| `static gate: author gate` (Slice 1) | `trust expression documented as the contract at the future paid seam in harness-checks.yml` | Review-mandated honesty rename: `harness-checks.yml` carries the trust expression as a documented-only contract (no live `if:` yet), so the name must not imply an active gate. |
| `static gate: gate sits on every token job` (Slice 1) | `canonical trust expression present in behavioral-evals.yml` + `trust expression wired as a live if: on behavioral-evals.yml's token job` | Per-assertion diagnosability split: one test asserts the canonical string is present, a second asserts it is wired as a live `if:` on the token job, so a failure points at the exact missing property. |
| `static gate: evals environment declared` (Slice 3) | `evals environment declared on the token job` + `pull_request_target ban stated as a workflow comment` | Per-assertion diagnosability split: the environment declaration and the `pull_request_target`-ban comment are independent contracts, so each gets its own test. |
