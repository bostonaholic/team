---
topic: gate-llm-ci-jobs-on-pr-author
date: 2026-06-09
phase: plan
---

# Plan: gate-llm-ci-jobs-on-pr-author

## Context

Implements the two-layer author gate plus the fail-fast spawn guard approved in
`docs/plans/2026-06-09-gate-llm-ci-jobs-on-pr-author/structure.md` (design at
`design.md`, codebase facts at `research.md`). Three atomic slices: (1) the
code-reviewable `author_association` gate on the PR-triggered token seam, (2) a
fail-fast guard in `session-runner.ts` when the live spawn has no API key, and
(3) an `environment: evals`-scoped secret backstop. All tests are free
tripwires/unit tests — no `*.evals.ts`, no paid tier (per TESTING.md L1/L2).

### Reconciliation against the current checkout (read before starting)

These facts are TRUE on this branch and override anything that assumes #32/#47
have landed:

- `harness-checks.yml` has exactly ONE job (`harness-checks`) that runs free
  `bun test` (no secrets). PR #32's "Run gate-tier evals (mocked, free)" step
  and `scripts/run-gate-evals.ts` do NOT exist here yet. Do not invent them.
- `harness-checks.yml:17` concurrency still keys on `github.head_ref` (PR #32's
  rename to `pull_request.number` has not landed). Do NOT change it — out of
  scope and a #32 conflict surface.
- `behavioral-evals.yml` triggers ONLY on `schedule` + `workflow_dispatch`
  (lines 13-16); it does NOT trigger on `pull_request` today. Its one job
  `behavioral-evals` consumes the secret (lines 59-60).
- The canonical trust expression returns **false on non-PR events** (no
  `pull_request` context). So any job that must still run on `schedule` /
  `workflow_dispatch` requires an event-aware `if:` (see Slice 1 step 1), not
  the bare `contains(...)`. This is the design edge case "missing
  author_association → schedule/dispatch unaffected."
- Keep every addition to single `if:` / declaration / comment lines on existing
  blocks. Do NOT restructure the matrix or add jobs (#32/#47 conflict-light
  mandate, design Risks).

## Slices

### Slice 1: Author gate on the PR-triggered token seam

**Acceptance tests** (from structure.md, all in `tests/static-gate.test.ts`):
- `static gate: author gate` — `harness-checks.yml` contains the canonical
  trust expression verbatim as an `if:` on the PR-triggered token seam.
- `static gate: untrusted authors excluded` — the trust allowlist literal
  contains none of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, `NONE`.
- `static gate: gate sits on every token job` — every secret/`claude`-spawn
  reference in both workflows is covered by the trust `if:` (or carries no PR
  trigger). Asserts on presence of the `if:` near token jobs, tolerating both
  the static matrix (#47) and a future dynamic `discover` matrix (#32).

**Steps:**

1. `.github/workflows/behavioral-evals.yml` — [sequential] Add a job-level
   `if:` to the `behavioral-evals` job (after `name:` on line 24, before
   `runs-on:` on line 25). Use the **event-aware** form so scheduled/dispatch
   runs are unaffected and only `pull_request` events are gated:
   `if: github.event_name != 'pull_request' || contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.pull_request.author_association)`.
   The embedded substring `contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.pull_request.author_association)`
   MUST match the canonical contract from structure.md Cross-slice concerns
   verbatim (the tripwire matches this substring). This is the only job that
   touches the secret today (lines 59-60).

2. `.github/workflows/harness-checks.yml` — [sequential] Add the contract as a
   workflow comment AND apply the trust `if:` to the PR-triggered token seam.
   Since PR #32's mocked-eval step is not present yet, anchor the gate at the
   seam where paid execution will attach: add a comment block above the
   `harness-checks` job steps (near line 26) stating "Any step that consumes a
   secret or spawns `claude` MUST carry this trust `if:`:
   `${{ contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.pull_request.author_association) }}` —
   #32's 'Run gate-tier evals' step inherits it." Then place the canonical
   `contains(...)` expression text inside that comment so the tripwire in
   step 3 finds it in this file. Do NOT gate the existing free `bun test`
   step or the job itself — that would skip free CI for fork authors (design
   Decision 2; harness-checks stays free, out-of-structure note).

3. `tests/static-gate.test.ts` — [parallel with step 4] Add a new
   `describe("static gate: author gate")` block. Read both workflow files
   (reuse the `EVALS_WORKFLOW` constant pattern at lines 15-20; add a sibling
   `HARNESS_WORKFLOW` constant for `harness-checks.yml`). Define a module-level
   `const TRUST_EXPR =
   `contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.pull_request.author_association)``
   and assert (mirror the existing `expect(workflow).toContain(...)` and
   `/regex/m.test(workflow)` styles at lines 87/95):
   - `author gate`: `harness-checks.yml` text `.toContain(TRUST_EXPR)`.
   - `untrusted authors excluded`: `TRUST_EXPR` does NOT match
     `/CONTRIBUTOR|FIRST_TIME_CONTRIBUTOR|NONE/` (assert the allowlist literal
     excludes them — note `CONTRIBUTOR` is a substring of
     `FIRST_TIME_CONTRIBUTOR`, so test the canonical string itself, which
     contains neither).
   - `gate sits on every token job`: `behavioral-evals.yml` text
     `.toContain(TRUST_EXPR)` AND the `if:` on its secret-consuming job is
     present. Assert on substring presence, NOT on a fixed job/matrix shape, so
     the test tolerates either #47's static entries or #32's `discover` job
     (structure.md Cross-slice "#32/#47 coexistence").

**Verification:** Run `bun test`. Slice done when the three new tripwires pass
and all pre-existing `static-gate` tests still pass. Reviewer reads the single
`if:` line in `behavioral-evals.yml` and the contract comment in
`harness-checks.yml` from the diff. Apply Quality Checklist item 12 (failures
are actionable): each tripwire message should name which workflow + which
contract failed.

**Commit:** `ci: gate token-consuming PR jobs on author_association`

### Slice 2: Fail-fast guard on the live-spawn path

**Acceptance tests** (from structure.md, in
`tests/helpers/session-runner.test.ts`):
- `runAgentTest: throws on empty API key at live path` — with `EVALS_MOCK_AGENT`
  unset and `EVALS_ANTHROPIC_API_KEY` empty/unset, `runAgentTest` rejects with
  an error naming the missing variable and never spawns.
- `runAgentTest: mock path unaffected by empty key` — with `EVALS_MOCK_AGENT`
  set and the key empty, the existing mock replay still succeeds.

**Steps:**

1. `tests/helpers/session-runner.ts` — [sequential] Insert an empty-key guard
   immediately AFTER the mock seam (after line 258, the
   `if (mockPath !== undefined && mockPath !== "") return runMocked(...)`
   block) and BEFORE building `args` (line 260). Mirror the existing
   empty-string check shape (`!== undefined && !== ""` at lines 255-256, per
   design Patterns): read `process.env.EVALS_ANTHROPIC_API_KEY`; if it is
   `undefined` or `""`, `throw new Error("EVALS_ANTHROPIC_API_KEY is empty; refusing live spawn")`.
   The throw must use this exact message text (the test asserts on it). Placing
   it after the mock seam guarantees mock runs never trip it (design Risk:
   behavior change in session-runner). No other lines change.

2. `tests/helpers/session-runner.test.ts` — [parallel with step 1's design,
   sequential to its landing] Add a new
   `describe("runAgentTest live-path API-key guard")` block (after the existing
   mock-replay describe at lines 126-167):
   - `throws on empty API key at live path`: save/restore `EVALS_MOCK_AGENT` and
     `EVALS_ANTHROPIC_API_KEY` in a try/finally (follow the env save/restore
     pattern at lines 148-165). `delete process.env.EVALS_MOCK_AGENT`,
     `delete process.env.EVALS_ANTHROPIC_API_KEY`, then
     `await expect(runAgentTest({ prompt, workingDirectory: tmp, testName }))
     .rejects.toThrow(/EVALS_ANTHROPIC_API_KEY is empty/)`. Use a `mkdtempSync`
     temp dir as the existing test does (line 128) and `rmSync` it in finally.
     No subprocess is spawned because the guard fires first.
   - `mock path unaffected by empty key`: set `EVALS_MOCK_AGENT` to a written
     mock NDJSON file (reuse the fabricated-events fixture shape from lines
     130-146) with `EVALS_ANTHROPIC_API_KEY` deleted/empty; assert
     `result.exitReason === "success"`, proving the guard sits after the mock
     seam.

**Verification:** Run `bun test`. Slice done when both unit tests pass, no
subprocess spawns (the live test rejects before `spawn`), and Slice 1's
tripwires still pass. This is L1 pure-unit per TESTING.md (no I/O beyond a temp
dir, no model, $0).

**Commit:** `fix(evals): fail fast when live spawn has no API key`

### Slice 3: Environment-scoped secret backstop

**Acceptance tests** (from structure.md, in `tests/static-gate.test.ts`):
- `static gate: evals environment declared` — `behavioral-evals.yml` declares
  `environment: evals` on the token job and carries a comment banning
  `pull_request_target` for token jobs.
- `static gate: no pull_request_target token trigger` — neither workflow
  triggers paid execution on `pull_request_target`.

**Steps:**

1. `.github/workflows/behavioral-evals.yml` — [sequential] Add
   `environment: evals` to the `behavioral-evals` job, on its own line within
   the job header (alongside `runs-on:`/`permissions:`, around lines 25-28).
   This scopes `secrets.EVALS_ANTHROPIC_API_KEY` (used at lines 59-60) to the
   protected environment; the declaration fails closed if the environment is
   absent (design Risk: settings drift). Keep it a single added line — no
   matrix or step restructuring.

2. `.github/workflows/behavioral-evals.yml` — [sequential] Add two comment
   lines in the same edit: (a) a hard-ban comment near the `on:` block (lines
   13-16) stating "Token/secret-consuming jobs MUST NOT trigger on
   `pull_request_target` (runs in base-repo context with secrets — exfiltration
   vector). Paid execution stays on schedule / workflow_dispatch or
   trust-gated pull_request only." (design Decision 5); (b) a one-time-setup
   comment near the new `environment: evals` line documenting that the `evals`
   GitHub environment must be created with required reviewers and/or a main-only
   branch restriction (design Decision 2, Open question on branch restriction).

3. PR body (record in the slice commit body, surfaced at `/team-pr`) — Document
   the one-time repo settings change: create the `evals` environment in repo
   Settings → Environments, attach `EVALS_ANTHROPIC_API_KEY` as an environment
   secret, set required reviewers and/or restrict deployment branches to `main`.
   This is the reproducibility note (structure.md Slice 3 goal); no file edit.

4. `tests/static-gate.test.ts` — [parallel with steps 1-2's design] Add a new
   `describe("static gate: evals environment backstop")` block reusing the
   `EVALS_WORKFLOW` read:
   - `evals environment declared`: assert
     `/^\s*environment:\s*evals\s*$/m.test(workflow)` is true AND the workflow
     text contains a `pull_request_target` ban marker (assert the comment is
     present, e.g. `expect(workflow).toContain("pull_request_target")` within a
     comment context — anchor on the ban phrasing chosen in step 2a so the
     match is intentional, not incidental).
   - `no pull_request_target token trigger`: assert NEITHER workflow's `on:`
     trigger list activates paid execution on `pull_request_target` — i.e. the
     only `pull_request_target` occurrence (if any) is inside a comment, never
     as a live `on:` key. Read both `EVALS_WORKFLOW` and the `HARNESS_WORKFLOW`
     constant added in Slice 1; assert no line matches
     `/^\s*pull_request_target:/m` (a bare-key trigger), which is the forbidden
     form (design Decision 5).

**Verification:** Run `bun test`. Slice done when the two tripwires pass and
Slices 1-2 tests still pass. The PR body carries the `evals` environment setup
note. Reviewer confirms the `environment: evals` line and ban comment in the
`behavioral-evals.yml` diff.

**Commit:** `ci: scope EVALS_ANTHROPIC_API_KEY to a protected evals environment`

## Done Criteria

- All seven acceptance tests across the three slices pass under `bun test`
  (three in Slice 1, two in Slice 2, two in Slice 3).
- No regressions: every pre-existing test in `tests/static-gate.test.ts` and
  `tests/helpers/session-runner.test.ts` still passes.
- No `*.evals.ts` file is touched; the free `bun test` suite stays free
  (TESTING.md §5 free/paid line; out-of-structure mandate).
- Every workflow addition is a single `if:` / declaration / comment line on an
  existing block — no matrix restructuring, no new jobs, no concurrency-key
  change — so the change stays conflict-light against in-flight PRs #32/#47
  (design Risks).
- `behavioral-evals.yml`'s scheduled/dispatch runs remain ungated (event-aware
  `if:`); only `pull_request` events are author-gated.
- The PR body documents the one-time `evals` environment setup.

## Deviations (review-mandated)

- **`harness-checks.yml` concurrency key changed** (commit 8a795ae). The
  Reconciliation note above said "Do NOT change it" (concurrency on
  `github.head_ref`), but a round-1 security MEDIUM required keying on the PR
  number instead — an attacker-controlled `head_ref` can collide with or cancel
  another PR's concurrency group. The key was changed to the
  `pull_request.number || github.run_id` form on security-review direction,
  superseding the earlier do-not-touch note. The change is byte-identical to
  PR #32's planned rename, so the conflict surface against #32 is nil.
