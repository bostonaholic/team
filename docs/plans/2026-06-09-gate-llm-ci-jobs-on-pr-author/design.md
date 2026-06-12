---
topic: gate-llm-ci-jobs-on-pr-author
date: 2026-06-09
phase: design
approved: true
approved_at: 2026-06-09T23:40:44Z
revision: 1
---

# Design: gate-llm-ci-jobs-on-pr-author

## Current state

Two workflow files exist. `.github/workflows/behavioral-evals.yml` is the paid
tier: it spawns `claude -p` and runs the LLM judge, reading the API key from
`secrets.EVALS_ANTHROPIC_API_KEY` (lines 59–60). Its only triggers are
`schedule` (Monday 06:00 UTC) and `workflow_dispatch` (lines 13–16), so it
cannot run on a PR today. `.github/workflows/harness-checks.yml` runs on every
`pull_request` to main (lines 11–14) but consumes no secrets and runs bare
`bun test`, which never loads `*.evals.ts` suites (lines 39–43).

Neither workflow has any actor or author `if:` condition (research Q4). Both
declare `permissions: contents: read` and `cancel-in-progress: true`. There is
no reusable workflow and no `.github/actions/` composite (Q7).

The token-spend seam lives in `tests/helpers/session-runner.ts`. The mock seam
is `EVALS_MOCK_AGENT` (lines 254–258): non-empty → `runMocked()`. But the live
path at `spawn("claude", ...)` (line 275) has **no guard on the API key** — an
empty `EVALS_ANTHROPIC_API_KEY` does not prevent the spawn; the CLI just fails
at auth time after the process starts (Q9). Under plain `pull_request`, fork
PRs never receive secrets (platform guarantee), so the key would already be
empty there — but nothing in the harness asserts that invariant.

Two in-flight PRs reshape these files. PR #32 adds a `discover` job to
`behavioral-evals.yml` (globs `tests/*.evals.ts` into a JSON matrix; the
eval job gains `needs: discover`) and adds a mocked, free "Run gate-tier
evals" step to `harness-checks.yml` (`bun scripts/run-gate-evals.ts`) — the
exact PR-triggered seam where paid execution could later attach. PR #47 adds 9
static matrix entries to `behavioral-evals.yml`. #32 and #47 conflict with
each other; whichever lands second rebases.

## Desired end state

A trusted author (repo owner or collaborator) opening a PR sees token jobs run
as normal. An untrusted author (fork, external contributor, Dependabot) sees
those jobs skipped, with no `EVALS_ANTHROPIC_API_KEY` reference resolving to a
real value and no `claude -p` spawn. The gate is enforced at **two layers**:

1. **YAML author gate** — a single job-level `if:` expression applied to every
   token-consuming job, including PR #32's `discover` job pattern when it
   lands. This is code-reviewable and visible in the diff.
2. **Environment-scoped secret** — `EVALS_ANTHROPIC_API_KEY` moves into a
   protected GitHub `evals` environment. `behavioral-evals.yml` declares
   `environment: evals`; only jobs that declare it can see the secret. This is
   the server-side backstop, enforced even if a YAML `if:` is later edited
   wrong.

Layer 1 targets accidental burn and approval-fatigue / compute griefing (a
fork PR can still queue free runners). Layer 2 ensures the key itself is
unreachable from any job that does not explicitly opt in. The fork-PR
no-secrets platform guarantee remains the third, implicit backstop.

`session-runner.ts` fails fast and loud when the live path is reached with no
API key, converting the silent CLI auth failure into an immediate harness
error that names the missing variable.

## Patterns to follow

- Canonical trust expression (research Q11):
  `contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.pull_request.author_association)`.
  Apply verbatim as a job-level `if:` so every token job reads identically.
- Minimal `permissions: contents: read` on every job
  (`behavioral-evals.yml:27-28`, `harness-checks.yml:24-25`).
- PR-scoped concurrency keyed on PR number, never on attacker-controlled
  `head_ref` — the post-#32 convention
  (`harness-checks.yml` becomes `...${{ github.event.pull_request.number || github.run_id }}`).
- Matrix values routed through `env:`, not inline `${{ }}` in `run:`
  (`behavioral-evals.yml:64-68`).
- Mock-seam guard style: explicit `!== undefined && !== ""` empty-string check
  (`session-runner.ts:255-256`) — mirror this shape for the new key guard.

## Decisions made

1. **Per-job `if:` + environment-scoped secret** (chosen: "Per-job if +
   environment-scoped secret"). Apply the trust `if:` to each token job in
   YAML *and* move `EVALS_ANTHROPIC_API_KEY` into a protected `evals`
   environment that `behavioral-evals.yml` declares via `environment: evals`.
   Alternatives rejected: a *dedicated upstream gate job* (others `needs:` it)
   adds a job and a `needs:` edge that collides with #32's discover/needs
   graph; a *reusable workflow* is the heaviest change and largest conflict
   surface against both in-flight PRs. Per-job `if:` keeps each job
   self-contained and conflict-light. Touches `behavioral-evals.yml`,
   `harness-checks.yml`, and a one-time repo settings change documented in the
   PR body.

2. **Settings vs. YAML layering.** Repo settings are the server-side backstop;
   YAML is the auditable, code-reviewed control. The "Require approval for all
   outside collaborators" Actions setting is server-enforced but all-or-nothing
   (it also gates free CI and is not visible in the diff), so it is *not* the
   primary mechanism. The `evals` environment (required reviewers and/or
   branch restriction to main) scopes the secret without gating free CI. The
   PR documents the one-time settings change; the YAML gate is the part under
   version control.

3. **Trust predicate: `author_association`** (chosen: "author_association in
   OWNER/MEMBER/COLLABORATOR"). Dependabot authors as `CONTRIBUTOR`, so it
   skips correctly without a named exception. Alternative rejected: an explicit
   `github.actor` allowlist is tighter but needs editing on every collaborator
   change — higher maintenance for the same outcome. For fork PRs,
   `author_association` reflects association with the **base** repo (Q8), which
   is exactly the trust signal we want.

4. **Gate the seam + harden `session-runner.ts`** (chosen: "Gate the seam +
   harden session-runner"). Apply the trust `if:` to PR #32's mocked gate-eval
   step / job in `harness-checks.yml` (and to the `discover` job pattern when
   #32 lands) *now*, and add an empty-API-key fail-fast guard immediately after
   the mock seam in `session-runner.ts` (after line 258, before building
   `args`). This closes the silent-live-spawn gap (Q9) so a misconfigured job
   that reaches the live path with no key errors immediately and loudly rather
   than burning a runner to a CLI auth failure. Alternatives rejected:
   *workflow-only* leaves the live-spawn gap open; *document-only* enforces
   nothing until someone remembers the convention.

5. **Forbid `pull_request_target` for token jobs** (chosen: "Forbid
   pull_request_target for token jobs"). Document a hard ban in the workflow
   comments. `pull_request_target` runs in base-repo context with secrets
   available — a known exfiltration vector if PR code is ever checked out
   (Q9). Paid execution stays on `schedule` / `workflow_dispatch` or
   trust-gated `pull_request` only. Alternative rejected: "allow with mandatory
   gate + no PR checkout" — a single subtle misconfig re-opens the vector;
   the convenience is not worth the standing risk.

This serves a specific user — the repo owner (`bostonaholic`) — whose demand is
concrete: avoid token-cost griefing and accidental key burn from PRs as the
eval surface grows (#32, #47). The thinnest design that delivers it is the
two-layer gate plus the one fail-fast guard; we are not building configurable
multi-org trust policy, which no one has asked for.

## Out of scope

- Org-team membership lookup or any trust source beyond `author_association`
  plus the owner.
- A reusable workflow or composite action to DRY the `if:` — deferred until a
  third token job justifies the extraction.
- The "Require approval for all outside collaborators" Actions setting as the
  *primary* gate (documented as backstop only, not configured by this change).
- Rate limiting or quota on free harness-check runners triggered by fork PRs
  (approval-fatigue griefing of *free* compute is acknowledged, not solved).
- Resolving the #32/#47 mutual conflict — that is the merge author's job; this
  design only ensures the gate covers whichever matrix shape wins.
- Migrating `harness-checks.yml` to consume secrets or run paid suites — it
  stays free; the gate is defensive against a *future* paid attach.

## Edge cases

- **Boundary — `author_association: OWNER`:** repo owner's own PRs run token
  jobs (trusted). `MEMBER`/`COLLABORATOR` likewise.
- **Boundary — empty matrix (#32 discover):** #32's discover job intentionally
  fails loudly on an empty `tests/*.evals.ts` glob; the trust `if:` must sit on
  `discover` too, so an untrusted author never triggers discovery at all.
- **Invalid — missing `author_association`:** on non-PR events the field is
  absent; the `contains(...)` returns false. `schedule` / `workflow_dispatch`
  jobs are unaffected because they carry no PR context and are not gated (the
  `if:` lives only on PR-triggered token jobs).
- **Failure — live path with empty key:** new guard in `session-runner.ts`
  throws a named error ("EVALS_ANTHROPIC_API_KEY is empty; refusing live
  spawn") instead of spawning `claude` and failing at auth.
- **Concurrency — fork PR queues runners:** trust `if:` skips the job before
  spend; PR-number-keyed concurrency prevents head_ref griefing of the group.
- **Authorization — Dependabot PR:** authors as `CONTRIBUTOR` → skipped, no
  named exception required.
- **Authorization — first-time / external contributor:** `CONTRIBUTOR` /
  `NONE` / `FIRST_TIME_CONTRIBUTOR` → skipped.
- **Resource — fork PR under `pull_request`:** secrets resolve to `""`
  (platform); the `evals` environment makes the key unreachable regardless;
  the `if:` skips the job before it runs.

## Open questions (deferred)

- Whether the `evals` environment should additionally restrict deployment
  branches to `main` (belt-and-suspenders) or rely on required reviewers
  alone — settle at implement time when configuring the environment.
- Exact placement of the trust `if:` relative to #32's `discover` → `needs`
  graph once #32's final shape is known — the planner/implementer reconciles
  against whichever PR lands first.

## Risks

- **Merge-conflict coexistence:** the `if:` additions overlap the same job
  headers #32/#47 edit. Mitigation: keep additions to single `if:` lines on
  existing job/step blocks; do not restructure the matrix.
- **Settings drift:** the `evals` environment is configured outside version
  control. Mitigation: document the one-time setup in the PR body and as a
  workflow comment; the YAML `environment: evals` declaration fails closed if
  the environment is absent (secret simply unavailable).
- **`author_association` staleness:** GitHub may lag association updates for a
  newly added collaborator. Mitigation: acceptable — a re-run after acceptance
  reflects the new association; owner can always `workflow_dispatch`.
- **Behavior change in `session-runner.ts`:** the fail-fast guard could trip a
  local dev run that legitimately has no key set but expects mock mode.
  Mitigation: guard fires only on the live path (after the `EVALS_MOCK_AGENT`
  seam), so mock runs are unaffected.
