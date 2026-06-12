---
topic: gate-llm-ci-jobs-on-pr-author
date: 2026-06-09
phase: research
---

# Research: gate-llm-ci-jobs-on-pr-author

Combined findings from file-finder and researcher (isolated; worked from
questions.md only), plus orchestrator-supplied facts about two in-flight PRs.

## Tech Stack

- TypeScript, Bun (runtime + test runner), GitHub Actions
- Key libraries: `bun:test`, `node:child_process`, `@anthropic-ai/claude-code` (installed globally in CI)
- Two workflow files; no composite actions; no reusable workflows

## Relevant Files

### Workflows
- `.github/workflows/behavioral-evals.yml` — scheduled/manual workflow running live behavioral evals with `EVALS_ANTHROPIC_API_KEY` secret (Q1, Q2, Q3, Q5, Q6)
- `.github/workflows/harness-checks.yml` — runs on every PR to main, free gate-tier tests, no secrets (Q1, Q2, Q5, Q6)

### Tests & fixtures
- `tests/code-reviewer.evals.ts` — paid eval file with `testIfSelected()` registration; judge calls use `EVALS_ANTHROPIC_API_KEY` (Q1, Q10)
- `tests/static-gate.test.ts` — free gate-tier tests validating fixture schemas and workflow contracts (Q1, Q8)
- `tests/helpers/fixtures.ts` — fixture loader; `FixtureFrontmatter.tier: "gate" | "periodic"` (Q4, Q5)
- `tests/helpers/touchfiles.ts` — diff-based selection via `E2E_TOUCHFILES`, `E2E_TIERS`, `GLOBAL_TOUCHFILES`; `filterByTier()` by `EVALS_TIER` (Q3, Q4, Q5)
- `tests/helpers/session-runner.ts` — spawns `claude` CLI; `EVALS_MOCK_AGENT` decides mock vs live; `EVALS_MODEL` override (Q10)
- `tests/helpers/llm-judge.ts` — uses `EVALS_ANTHROPIC_API_KEY` and `EVALS_MOCK_JUDGE`; deterministic checks cascade before LLM calls (Q1, Q10)
- `tests/helpers/eval-store.ts` — persists eval results with tier, branch, cost tracking (Q3)

### Scripts & docs
- `scripts/eval-list.ts`, `scripts/eval-select.ts`, `scripts/eval-compare.ts` — selection/compare tooling (Q3, Q4)
- `evals/README.md` — two-tier file naming (`*.test.ts` vs `*.evals.ts`), fixture `tier`, env vars (Q1, Q4, Q5)
- `TESTING.md` — six-layer harness; gate vs periodic tiers; diff-based selection (Q4, Q5)
- `package.json` — `test` vs `test:evals` scripts; `test:evals` sets `EVALS=1 EVALS_ALL=1` (Q1, Q4)

## Answers by Question

### Q1 — Triggers and API-key consumption per workflow
- `behavioral-evals.yml` (lines 13–16): triggers `schedule` (Mon 06:00 UTC) + `workflow_dispatch`. Job `behavioral-evals` sets both `EVALS_ANTHROPIC_API_KEY` and `ANTHROPIC_API_KEY` from `secrets.EVALS_ANTHROPIC_API_KEY` (lines 59–60). The only job touching API keys.
- `harness-checks.yml` (lines 11–14): triggers `pull_request` (branches `[main]`) + `workflow_dispatch`. No secrets at all.

### Q2 — `harness-checks.yml` test invocation
Single step "Run harness checks" (lines 39–43): bare `bun test`, no args, no `*.evals.ts` path, no API key. Comment notes `*.evals.ts` is outside Bun's auto-discovery pattern, so bare `bun test` never loads paid suites.

### Q3 — `behavioral-evals.yml` job graph
Exactly one job, `behavioral-evals` (line 23). No `needs:`. Matrix is **static**, inline (lines 31–35), single entry `{ name: code-reviewer, file: ./tests/code-reviewer.evals.ts }`. No `discover` job on this branch (but see In-Flight PRs below).

### Q4 — Existing author/actor `if:` conditions
**None.** Neither workflow has any `if:` referencing `github.actor`, `author_association`, `github.repository_owner`, etc. Only `if: always()` on the artifact-upload step (`behavioral-evals.yml:71`).

### Q5 — Concurrency conventions
Both use `cancel-in-progress: true`.
- `behavioral-evals.yml:19-20`: group `behavioral-evals` (static string)
- `harness-checks.yml:17-18`: group `harness-checks-${{ github.head_ref || github.run_id }}` (PR #32 changes this — see below)

### Q6 — Permissions
Both jobs declare exactly `permissions: contents: read` (`behavioral-evals.yml:27-28`, `harness-checks.yml:25-26`). Minimal; no writes needed.

### Q7 — Reusable workflows / composite actions
**None.** No `workflow_call:`, no `.github/actions/` directory.

### Q8 — Context availability: `on:` level vs job `if:` level (platform knowledge, high confidence)
- `on:` level: only filter patterns (`branches`, `paths`, `types`) — no expression context; cannot gate on actor at trigger level.
- Job `if:` level: full `github` context — `github.actor`, `github.event.pull_request.user.login`, `github.event.pull_request.author_association` (`OWNER` / `MEMBER` / `COLLABORATOR` / `CONTRIBUTOR` / `FIRST_TIME_CONTRIBUTOR` / `FIRST_TIMER` / `NONE`), `github.repository_owner`, plus `contains()` / `startsWith()` / `fromJSON()` functions.
- For fork PRs, `author_association` reflects the author's association with the **base** repo.

### Q9 — Secrets on fork PRs (platform knowledge, high confidence)
- `pull_request` from fork: secrets are **not passed**; references evaluate to empty string `""`. Job does not fail.
- `pull_request_target`: runs in base-repo context, secrets **are** available — known injection risk if PR code is checked out with secrets.
- `session-runner.ts:255` checks `EVALS_MOCK_AGENT !== undefined && !== ""`. There is **no guard on `EVALS_ANTHROPIC_API_KEY`** in session-runner — an empty secret would not prevent the real `claude` spawn; the CLI would fail at auth time.

### Q10 — Mock-vs-live seam
- Primary: `EVALS_MOCK_AGENT` (`session-runner.ts:255`) — non-empty → `runMocked()`, no API call.
- `EVALS_MODEL` (`session-runner.ts:244`) — model override, does not gate the live path.
- `EVALS_MOCK_JUDGE` — handled in `llm-judge.ts`.
- Selection system (`touchfiles.ts`): `EVALS_ALL=1` (line 125) forces selection; `EVALS_TIER` (line 181) filters gate/periodic; `EVALS_BASE` (line 37) overrides diff base.

### Q11 — Canonical author-gate expression (community knowledge, moderate confidence)
Most concise single-expression form:
```yaml
if: contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.pull_request.author_association)
```
Long form chains `==` comparisons with `||`.

### Q12 — Matrix definition today vs with a `discover` job
Today: static inline list. With a discover job: `discover` outputs a JSON matrix, `behavioral-evals` gains `needs: discover` and `matrix: ${{ fromJSON(needs.discover.outputs.suites) }}`. A job-level `if:` still evaluates after `needs` resolve — but an author gate would also need to cover the `discover` job (or use a dedicated gate job) to avoid running discovery for untrusted authors.

## In-Flight PRs (orchestrator-supplied facts — actual diffs fetched from GitHub)

Two open PRs touch the same workflow files and will likely merge around the same time. The deliverable must coexist with both: minimize merge-conflict surface and cover the jobs they introduce.

### PR #32 (`2026-05-29-evals-all-agents-skills`) — workflow changes
`behavioral-evals.yml`:
- Adds a `discover` job (globs `tests/*.evals.ts` via `ls | sed | jq` into a `suites` JSON output; intentionally fails loudly on empty glob).
- `behavioral-evals` job gains `needs: discover` and `matrix: suite: ${{ fromJSON(needs.discover.outputs.suites) }}`.
- Triggers unchanged (`schedule` + `workflow_dispatch` only).

`harness-checks.yml`:
- Concurrency group changed to `harness-checks-${{ github.event.pull_request.number || github.run_id }}` (comment: never key on attacker-controlled `github.head_ref`).
- Adds step "Run gate-tier evals (mocked, free)": `bun scripts/run-gate-evals.ts` — replays gate-tier cases against recorded mock seams (`EVALS_MOCK_AGENT` / `EVALS_MOCK_JUDGE`). Explicitly no API key, no `claude -p` spawn. **This is the exact seam where paid execution could later attach to `pull_request` triggers.**

### PR #47 (`2026-06-03-skill-behavior-evals`) — workflow changes
`behavioral-evals.yml`: adds 9 static matrix entries (`changelog`, `eng-design-doc-review`, `git-commit`, `team-design`, `team-fix`, `team-plan`, `team-question`, `team-research`, `team-structure`). Triggers unchanged. All new suites are periodic tier.

### Conflict note
PR #32 (dynamic discover matrix) and PR #47 (static matrix additions) conflict with each other in `behavioral-evals.yml`; whichever lands second rebases. If #32's discover job lands, #47's entries are auto-discovered and its static list becomes moot.

## Patterns Observed
- Minimal `permissions: contents: read` on every job.
- `EVALS_MOCK_AGENT` empty-string check is the offline seam.
- `EVALS_TIER=periodic` scopes the paid suite in `behavioral-evals.yml`.
- `./`-prefix requirement for `bun test` paths; matrix values routed through env vars, not inline `${{ }}` in `run:`.
- PR-scoped concurrency: `<name>-${{ github.event.pull_request.number || github.run_id }}` (post-#32 convention).

## Constraints
- **Hard**: `harness-checks.yml` has no API keys and runs bare `bun test` — adding paid execution there would require adding secrets and explicit paths.
- **Hard**: `behavioral-evals.yml` does not trigger on `pull_request` — paid-on-PR requires adding the trigger or a new workflow.
- **Hard**: All current fixtures are `tier: periodic`; gate-tier evals on PRs run mocked and free (post-#32).
- **Hard**: Secrets are empty strings on fork PRs under `pull_request`; `pull_request_target` exposes secrets and is an injection risk.
- **Hard**: No guard on `EVALS_ANTHROPIC_API_KEY` in `session-runner.ts` — an empty key does not prevent a live spawn attempt.
- **Soft**: Concurrency group naming and minimal-permissions conventions above.

## Open Questions
- Q11's canonical example is from community knowledge, not citable from this codebase.
