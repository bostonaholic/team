---
topic: agent-behavioral-evals
date: 2026-05-28
phase: research
---

# Research: agent-behavioral-evals

## Tech stack & build

- **Language:** bash for tests, Node.js ESM (`.mjs`) for hooks. No TypeScript, no compiled artifacts.
- **Runtime:** `bun >=1.0.0` is declared in `package.json` `engines`, but **`package.json` defines no `scripts` entries**. Tests are invoked manually with `bash tests/<name>.sh`. Hooks run under `node` per the plugin manifest.
- **CI:** **No CI configuration exists** (no `.github/workflows/`, no CircleCI, no other CI files). The convention "run from the repository root" lives only as a comment at the top of each test script.

## Directory conventions

| Path | Purpose | Distribution |
|---|---|---|
| `agents/*.md` | 13 agent files with YAML frontmatter | Runtime (shipped to users) |
| `skills/<name>/SKILL.md` | 27 skills (entry-point + methodology) | Runtime |
| `hooks/*.mjs` | 4 runtime hooks | Runtime |
| `.claude/hooks/*.mjs` | Dev-only hooks (e.g. `check-registry-sync.mjs`) | Not distributed |
| `.claude/scripts/*.sh` | Dev-only acceptance scripts (e.g. `check-discovery-consistency.sh`) | Not distributed |
| `tests/*.sh` | Acceptance tests, all bash | Not distributed (no CI runs them today) |
| `docs/plans/<id>/` | Per-topic QRSPI artifact directory | Repo state, committed |

The `evals/` directory does **not yet exist** and is **not** in `PLUGIN_DIRS` of `post-write-validate.mjs` — files placed there receive no structural validation, which is what we want for a new top-level area.

## Agent inventory (13)

From `agents/*.md` frontmatter and `skills/team/registry.json`:

| Agent | Model | Parallel? |
|---|---|---|
| questioner | sonnet | no |
| file-finder | haiku | **yes** (RESEARCH) |
| researcher | sonnet | **yes** (RESEARCH) |
| design-author | opus | no |
| structure-planner | opus | no |
| planner | opus | no |
| test-architect | inherit | no |
| implementer | opus | no |
| code-reviewer | sonnet | **yes** (IMPLEMENT) |
| security-reviewer | sonnet | **yes** (IMPLEMENT) |
| technical-writer | sonnet | **yes** (IMPLEMENT) |
| ux-reviewer | sonnet | **yes** (IMPLEMENT) |
| verifier | haiku | **yes** (IMPLEMENT) |

The judgment-heavy agents (the priority targets named in the ticket) are: **planner**, **implementer**, and the four parallel reviewers + verifier. The questioner and design-author also do judgment work, but the planner / implementer / reviewers are where regression would do the most damage.

## Test conventions

All tests use a near-identical bash skeleton:

```bash
#!/usr/bin/env bash
# Run from the repository root: bash tests/<name>.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILURES=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; FAILURES=$((FAILURES + 1)); }

# ... tests using grep -q, awk, head, etc. ...

if [ "$FAILURES" -eq 0 ]; then
  echo "All tests passed."
  exit 0
else
  echo "$FAILURES test(s) failed."
  exit 1
fi
```

Key observations:

- **No sourced helpers.** No `source` or `.` calls anywhere in `tests/*.sh` — each script duplicates the `pass()` / `fail()` / `REPO_ROOT` boilerplate. Convention, not code.
- **No test framework.** Assertions are inline `if grep -q ...; then pass; else fail; fi`.
- **Two pass/fail patterns coexist:** the accumulator style above (6 of 7 files) vs. `simplify-orchestration-acceptance.sh`'s assert-and-exit-immediately style. New work should match the accumulator style.
- **Naming:** `<feature-or-topic>-tests.sh`. The lone `-acceptance.sh` (`simplify-orchestration-acceptance.sh`) is a milestone scope fence, not a general convention.
- **Frontmatter-aware assertions:** `product-thinking-methodology-tests.sh` uses an awk snippet to isolate frontmatter from body:
  ```awk
  awk 'NR==1 && $0=="---"{f=1;next} f && $0=="---"{exit} f{print}'
  ```
  This is the most representative pattern for behavioral-content inspection.

## Frontmatter & validation constraints

- **post-write-validate.mjs** validates only that `agents/*.md` and `skills/*/SKILL.md` begin with `---` (presence, not schema). For `.claude-plugin/*.json` it runs `JSON.parse`; for `hooks/*.mjs` it dynamically imports for syntax.
- **check-registry-sync.mjs** (dev-only) parses `name:` from each agent's frontmatter and cross-checks against `skills/team/registry.json`. Warnings to stderr; non-blocking.
- **Banned fields in agent frontmatter** (enforced by `simplify-orchestration-acceptance.sh`): `phase:`, `consumes:`, `produces:`. These live only in `registry.json`.
- **Skill frontmatter** allows only `name:` and `description:` (enforced by `product-thinking-methodology-tests.sh`).
- A new `evals/` directory at repo root would face **zero validation overhead** from the existing hooks — they hardcode `PLUGIN_DIRS = ["agents/", "skills/", "hooks/", ".claude-plugin/"]`.

## Pipeline phases & artifact paths

The QRSPI phase table (from `skills/team/registry.json` and `skills/team/SKILL.md`):

| Phase | Agent(s) | Artifact path |
|---|---|---|
| QUESTION | questioner | `docs/plans/<id>/task.md`, `questions.md` (+ optional `repos.md`) |
| RESEARCH | file-finder, researcher (parallel) | `docs/plans/<id>/research.md` |
| DESIGN | design-author (→ human gate) | `docs/plans/<id>/design.md` (frontmatter `approved`) |
| STRUCTURE | structure-planner (→ human gate) | `docs/plans/<id>/structure.md` (frontmatter `approved`) |
| PLAN | planner | `docs/plans/<id>/plan.md` |
| WORKTREE | orchestrator-emit | (worktree side-effect; optional `repos.md` update) |
| IMPLEMENT | test-architect, implementer, 5 reviewers (parallel) | (code + tests) |
| PR | orchestrator-emit | (PR side-effect) |

The earliest *judgment-heavy* phase is **DESIGN**; the earliest phase where regression has cascading downstream cost is **PLAN** (planner produces the implementer's input).

## Relevant files for eval design

### Most representative test pattern to copy
- `tests/product-thinking-methodology-tests.sh` — frontmatter-isolation awk snippet, body-only assertion pattern, accumulator pass/fail.
- `tests/topic-consistency-tests.sh` — multi-file consistency checks; useful template for evals that compare an agent's output against its input artifact.

### Existing artifacts that an E2E eval would target
- `agents/planner.md`, `agents/implementer.md`, `agents/code-reviewer.md`, `agents/security-reviewer.md`, `agents/ux-reviewer.md`, `agents/technical-writer.md`, `agents/verifier.md` — the seven judgment-heavy agents named in the ticket.
- `skills/team/registry.json` — single source of truth for phase + model + parallel flags.
- `skills/team/SKILL.md` — phase loop semantics; an eval verifying orchestrator behavior would model against this.

### Headless invocation reference
The codebase does not currently invoke `claude -p` anywhere; the gstack reference pattern would be net-new tooling for this repo.

### Things conspicuously absent
- No fixtures directory; evals would need to introduce one.
- No JSON-result persistence convention; evals can pick any layout without conflict.
- No package.json `scripts` — evals can wire `npm run eval` (or `bun run eval`) without colliding with anything.

## Patterns & constraints summary

**Hard constraints:**
- Tests run as `bash tests/<name>.sh` from repo root.
- Agent frontmatter must start with `---`; `phase` / `consumes` / `produces` are banned there.
- Skill frontmatter is exactly `name` + `description`.
- `PLUGIN_DIRS` is closed (`agents/`, `skills/`, `hooks/`, `.claude-plugin/`). A new top-level area like `evals/` is outside that scope and untouched by structural hooks.

**Soft conventions:**
- SKILL.md soft line limit ~175.
- One test file per feature area, accumulator pass/fail style, no sourced helpers.
- Stdout-only assertion output (`PASS  …` / `FAIL  …` with two spaces).

**Notable absences (greenfield freedom):**
- No CI to integrate with — `evals/` design can pick its own cron/PR-gate split without inheriting constraints.
- No third-party test framework — bash + grep is the lingua franca; adding a TS/Bun harness would be a deliberate change of convention.
- No existing subprocess-invocation pattern; introducing `claude -p` is greenfield.
- No fixtures, no LLM-judge tooling, no diff-based selection — all net-new.

## Open questions

None from this research phase. All thirteen questions from `questions.md` are answered with concrete file/line evidence above. The design phase has clean greenfield space for the `evals/` top-level directory and can decide gate-tier integration without retrofitting existing CI.
