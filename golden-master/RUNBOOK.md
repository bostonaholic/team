# Golden Master — Operator Runbook

The Golden Master is a **manual, out-of-band** characterization run: feed the one
frozen feature prompt to the **whole** `/team` pipeline against a **frozen**
external app, then record metrics and compare against history. It makes
**pipeline drift** (over time, as our skills/agents change) and **model quality**
(the same task across models/providers) visible — things the per-agent harness in
[`../docs/testing.md`](../docs/testing.md) cannot see. It is **not** part of
`bun test` or CI; the isolation rules below explain why.

> **Two frozen halves — a run is `prompt × baseline`:**
>
> - **Prompt:** [`prompt.md`](./prompt.md) — replayed verbatim; SHA-256 pinned in
>   [`README.md`](./README.md).
> - **App baseline:** the **Linkboard** repo at tag **`golden-master-baseline`**
>   (commit `2cfee1a`). Every run branches from that exact tag.
>
> Vary **one** thing per run: hold the model fixed and change the Team version
> (drift over time), or hold the Team version fixed and change the model (model
> comparison, #139). Record both either way.

## Isolation rules — read first

Any one of these, violated, silently invalidates the run and every comparison:

1. **Never run `/team` from inside the Team repo.** Run it only in the Linkboard
   repo. Team's own `CLAUDE.md`, in-flight skills, and plugin artifacts would
   contaminate the result — the whole point is to reproduce what an *outside* user
   experiences after installing the plugin.
2. **The seed repo carries no Team context.** Linkboard is a separate repo with no
   Team `CLAUDE.md` / skills / plugin source. Don't add any.
3. **Never edit the frozen prompt.** Copy it verbatim and verify its SHA-256 first
   (step 0). A one-character change forks the benchmark into a different one.
4. **Always start from the baseline tag**, on a fresh branch — never from a moved
   `main`. The baseline tag never moves.
5. **Don't coach the pipeline.** Submit the prompt verbatim and approve only the
   single design gate. Steering it defeats the measurement.
6. **Never merge a run's output into Linkboard `main`.** Each run is a throwaway
   branch off the tag; merging would drift the baseline. Close or archive the run
   PR for inspection — the baseline stays frozen.

## When to run (cadence)

It is expensive and manual — run it deliberately, never in CI:

- **Before/after a notable skill or agent change** — to attribute drift to that change.
- **When a new model ships** (a new Claude now; a new provider once the backend
  adapters land) — to benchmark the model itself (#139).
- **On a periodic cadence** (e.g., monthly) for a slow-drift baseline.

## Procedure

### 0 — Pre-flight (in the Team repo)

- **Verify the prompt is unchanged.** Run the verify command in
  [`README.md`](./README.md) § *Freeze contract*; it must print
  `golden-master/prompt.md: OK`. If it fails, **stop** — the prompt was edited.
- **Decide the run parameters and write them down:** `model`, `provider`,
  `backend`, the **Team pipeline version** under test (plugin version or commit),
  and the date. These key the stored result (see #136 / #139).

### 1 — Prepare Linkboard at the frozen baseline

```sh
git clone git@github.com:bostonaholic/linkboard.git   # or cd into an existing clone
cd linkboard && git fetch --tags origin
git switch -c gm/<date>-<model> golden-master-baseline # fresh branch off the exact tag
git rev-parse --short HEAD                             # must be 2cfee1a (the baseline)
bin/setup                                             # gems + JS deps + prepare the DB
bin/rails test                                        # pre-existing suite GREEN before the run — record it
```

### 2 — Open Claude Code **in the Linkboard repo**

- Open a Claude Code session with its working directory set to the **Linkboard**
  repo (never the Team repo).
- Make sure the **Team plugin at the version you're benchmarking** is the active
  installed plugin — this is the real end-user path (the plugin is loaded *as a
  plugin*, not from a Team source checkout in the cwd).
- Select the **model / backend** for this run and confirm it. Anthropic-internal
  model swaps work today; cross-provider rides on #55 / #56 / #57.

### 3 — Run the pipeline

- Note the wall-clock **start**.
- Run `/team` with the **verbatim** text from [`prompt.md`](./prompt.md) as its
  argument.
- Let it run autonomously. At the **one design gate**, review the design doc and
  approve if it aligns; record any round-trips. Don't otherwise steer it.
- On completion it opens a **PR in the Linkboard repo** — record the PR link. Note
  the wall-clock **end**.

### 4 — Capture metrics (#136)

Point the metrics extractor (#136, when it lands) at the session transcript JSONL
Claude Code wrote locally; it emits the machine-readable vector + a human summary.
The vector records, at minimum:

- **time** — total + per-phase (Q→R→D→S→P→I→PR);
- **tokens** — input and output **separately**, plus cache-read / cache-creation,
  rolled up and broken down per phase / per agent;
- **cost** — from the run model's pricing;
- **shape** — vertical slices, hard-gate review-retry loops, human-gate
  round-trips, agent / subagent dispatches;
- **output + effectiveness** — files touched, lines ±, new tests, new-feature
  acceptance tests pass, pre-existing suite still green, code-/security-review
  verdicts, PR link;
- **identity** — `model`, `provider`, `backend`, `pipeline_version`, `date`.

> **Until #136's extractor exists,** record these fields by hand from the session
> into the JSON shape below. Token / usage figures are in the transcript — prefer
> them over estimates.

### 5 — Verify effectiveness (in the Linkboard PR branch)

- New-feature acceptance tests **pass**.
- Pre-existing suite **still green** — 0 regressions vs. the step-1 baseline.
- Record the code-review and security-review verdicts and the hard-gate retry count.

### 6 — Record + compare (in the Team repo)

- Save the vector + a one-line human summary to
  `golden-master/results/<date>-<model>.json`. **Observation data only** — it
  never runs in the build and never touches Linkboard.
- Run the compare (#135, when it lands): grade against the baseline with
  **effectiveness floors** (tests ≥ floor, 0 regressions, judge/reviewer ≥ floor)
  and **efficiency bands** (tokens / cost / time / slices / retries within ±band);
  report drift **temporally** and **head-to-head** across models (#139).
- Commit the results via the normal Team PR flow.

### 7 — Tear down

- Discard or archive the Linkboard run branch / PR — **do not merge it.** The
  baseline tag stays frozen for the next run.

## Choosing the model / provider (#139)

- **Anthropic-internal (now):** swap Opus / Sonnet / Haiku / future in Claude
  Code; record which ran.
- **Cross-provider (gated):** GPT / Gemini / etc. via the model-backend adapters
  (#55 / #56 / #57; strategy #50) — document and wire as they land.
- **Pricing is per-model.** Cross-*provider* caveat: raw token counts are **not**
  comparable across tokenizers — score cross-provider runs on **outcome quality +
  wall-clock + dollar cost**, keeping token counts as a within-provider detail.

## Result shape (working placeholder until #136 fixes the schema)

```json
{
  "date": "YYYY-MM-DD",
  "model": "claude-opus-4-8",
  "provider": "anthropic",
  "backend": "claude-code",
  "pipeline_version": "team vX.Y.Z (commit …)",
  "time_s": { "total": 0, "question": 0, "research": 0, "design": 0, "structure": 0, "plan": 0, "implement": 0, "pr": 0 },
  "tokens": { "input": 0, "output": 0, "cache_read": 0, "cache_creation": 0, "per_phase": {} },
  "cost_usd": 0,
  "shape": { "slices": 0, "review_retry_loops": 0, "human_gate_round_trips": 0, "agent_dispatches": 0 },
  "effectiveness": {
    "feature_tests_pass": true,
    "preexisting_suite_green": true,
    "files_touched": 0, "lines_added": 0, "lines_removed": 0, "new_tests": 0,
    "code_review_verdict": "", "security_review_verdict": "", "pr_url": ""
  }
}
```

## Status of this runbook

- The **procedure + isolation rules** above are complete and usable now for the
  manual parts of a run.
- The **metrics extractor** (#136) and the **compare / report** (#135) referenced
  in steps 4 and 6 are **not yet built**; until they land, capture and compare by
  hand using the shapes above.
- The **first end-to-end dry run** — recorded as the first stored baseline (the
  remaining item on #137) — depends on that tooling (or a deliberate
  hand-recorded first pass).

## See also

- [`README.md`](./README.md) — what the GM is, and the freeze contract.
- [`prompt.md`](./prompt.md) — the frozen feature prompt.
- [`../docs/testing.md`](../docs/testing.md) — the per-agent harness this sits *outside* of.
- Epic #132 · metrics #136 · compare #135 · cross-model #139.
