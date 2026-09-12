# M12: preparation handoffs measurement

Milestone #380 measures whether the two preparation handoffs — Structure-to-Plan
and file-finding — can collapse into one producer each, without changing scope,
recovery, or the preserved contracts. The result is a keep-existing decision:
neither candidate demonstrates a simplification that survives its contract
cost, so the 13 roles and their dispatch boundaries are retained.

## Method

Both candidates ran as matched cases: the same task, acceptance cases, model
tier, and environment. The task is the token-bucket seeded fixture already used
by `team-structure`, `team-plan`, and `team-research` evals — a per-client
request limiter. Candidate A (Structure-to-Plan) ran `claude-opus-5` for every
leg. Candidate B (file-finding) ran `claude-haiku-4-5-20251001` for the
file-finder leg and `claude-opus-5` for the researcher legs. Each producer was
driven through `claude -p --output-format stream-json --verbose` with the
agent body plus its named playbook/reference resources injected as the system
prompt, reading the seeded `docs/plans/2026-06-03-token-bucket/` artifacts in a
disposable working directory. Time, tokens, tool calls, turns, and cost came
from the stream's `result` event.

- **Candidate A current (two producers):** `structure-planner` reads
  `1-task.md`, `5-research.md`, `6-design.md` and writes `7-structure.md`;
  `planner` then reads `7-structure.md` plus the same three and writes
  `8-plan.md`.
- **Candidate A merged (one producer):** a combined producer reads the same
  three artifacts and writes both `7-structure.md` and `8-plan.md` in one pass.
- **Candidate B current (two producers, parallel):** `file-finder` (haiku)
  locates files from `2-questions.md`; `researcher` (opus) answers the same
  questions with evidence. Both are isolated and read-only.
- **Candidate B merged (one producer):** `researcher` (opus) both locates files
  and answers questions in one pass.

## Results

### Candidate A: Structure-to-Plan

| Metric | Two producers | One producer | Delta |
| --- | ---: | ---: | ---: |
| Wall-clock (sequential) | 219 s + 207 s = **426 s** | **332 s** | −22% |
| Cost (USD) | 1.297 + 1.058 = **2.355** | **1.619** | −31% |
| Total tokens (in+out+cache) | 536,926 + 281,207 = **818,133** | **557,336** | −32% |
| Output tokens | 16,342 + 16,449 = **32,791** | **27,207** | −17% |
| Read tool calls | 8 + 4 = **12** | **7** | −42% |
| Turns | 9 + 5 = **14** | **8** | −43% |
| Handoffs | **1** | **0** | |
| Artifact bytes written | 5,436 + 6,236 = **11,672** | **14,669** | +26% |

The merged producer is cheaper and faster, but wrote 26% more content. The
saving is cache reuse — one warm context reads the shared artifacts once,
where two cold contexts each pay prompt-cache creation — not reduced work.

### Candidate B: file-finding

| Metric | Two producers (parallel) | One producer (merged opus) | Delta |
| --- | ---: | ---: | ---: |
| Wall-clock (parallel) | **~45 s** (44 s ff, 45 s res overlap) | **40 s** | −11% |
| Cost (USD) | 0.161 + 0.558 = **0.719** | **0.565** | −21% |
| Total tokens (in+out+cache) | 663,126 + 206,020 = **869,146** | **210,274** | −76% |
| Read/search calls | 20 (ff) + 3 (res) = **23** | **3** | −87% |
| Turns | 21 (ff) + 4 (res) = **25** | **4** | −84% |

On the six-file token-bucket codebase the merged opus producer matched the
file-finder's coverage at researcher-only cost. The cost saving is the
file-finder's haiku spend (20 mechanical search calls over 21 turns), which the
researcher's three-call scan did not need on this trivial tree.

## Decision: keep existing roles

**Candidate A fails the simplification bar.** The measured −31% cost is
cache-driven, not work removed: the merged producer wrote more, not less. The
real cost of merging is contract loss, not dollars. `planner` revalidates every
planned action against `1-task.md` in a fresh context and is barred from
re-slicing or re-litigating the design — a separate producer enforces that bar
by reading only `7-structure.md` plus upstream. A merged producer holds the
whole design and slice breakdown in one context and can drift the structure
while expanding it. Merging also changes recovery (STRUCTURE resumes at PLAN in
the phase-inference table and `pipeline-recovery` tests), the `registry.json`
phase mapping, and the phase table — exactly the scope and recovery the
milestone forbids changing without a demonstrated simplification.

**Candidate B fails the simplification bar.** `file-finder` is haiku, parallel,
and mechanical — 20 search calls for complete coverage. `researcher` is opus
and narrow — three calls. On a trivial tree the narrow scan suffices and
merging looks free; on a real codebase the researcher's narrow scan
under-covers, and closing that gap means making opus do the haiku's 20+
mechanical calls at opus price, or accepting missed files in the research
assembly. Merging also serializes what the phase table dispatches in parallel,
and moves a cheap mechanical task onto the most expensive tier. No evidence
shows a merged opus producer matches the file-finder's completeness at
equal-or-lower cost on a realistic codebase.

Neither candidate preserves the milestone's named contracts — intent
validation, research isolation, independent downstream review — while
demonstrating a simplification. The 13 roles, the STRUCTURE/PLAN phase split,
and the parallel file-finder/researcher RESEARCH dispatch are retained
unchanged.

## Limits

- **Single sample.** One run per candidate on one task. Opus output and timing
  vary between runs; the −22%/−31%/−76% deltas are point observations, not
  means. They are directionally informative only because the token-accounting
  mechanics (cache creation, search-call count) are deterministic, not sampled.
- **Tiny synthetic codebase.** Candidate B ran against six files. The
  completeness argument for the file-finder rests on real-codebase behavior,
  which this measurement does not cover.
- **No orchestrator cost modeled.** The two-producer flows omit the
  orchestrator's own persistence and re-dispatch turns, so their true cost is
  understated, not overstated.
- **Tool fidelity.** The structure/plan/researcher legs resolved file reads
  through `Bash` rather than the `Read`/`Grep`/`Glob` tools a named-agent
  dispatch grants, so the "reads" column counts `Bash` invocations for those
  legs. The file-finder leg did use `Read`/`Grep`/`Glob`.
- **No paid judge.** No `EVALS_ANTHROPIC_API_KEY` was available, so quality was
  checked structurally (topic slug reuse, verification checkpoints, acceptance
  mappings, `file:line` citations), not by an LLM judge. All candidates passed
  those structural checks.

Raw streams, parsed summaries, and produced artifacts are under
`.context/verification/m12/` (local, not committed).
