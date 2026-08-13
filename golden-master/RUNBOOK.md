# Golden Master: Operator Runbook

The Golden Master is a **manual, out-of-band** characterization run. Feed the one
frozen feature prompt to the **whole** `/team` pipeline against a **frozen**
external app. Then record the metrics and compare them against history. The run
makes two things visible that the per-agent harness in
[`../docs/testing.md`](../docs/testing.md) cannot see: **pipeline drift** over
time as our skills and agents change, and **model quality** on the same task
across models and providers. The run is **not** part of `bun test` or CI. The
isolation rules below explain why.

> **Two frozen halves. A run is `prompt × baseline`:**
>
> - **Prompt:** [`prompt.md`](./prompt.md), replayed verbatim. Its SHA-256 is
>   pinned in [`README.md`](./README.md).
> - **App baseline:** the **Linkboard** repo at tag **`golden-master-baseline`**
>   (commit `2cfee1a`). Every run branches from that exact tag.
>
> Change **one** thing per run. For drift over time, hold the model fixed and
> change the Team version. For model comparison (#139), hold the Team version
> fixed and change the model. Record both values either way.

## Isolation rules: read first

If you break any one of these rules, the run and every comparison become invalid
without warning:

1. **Never run `/team` from inside the Team repo.** Run it only in the Linkboard
   repo. Team's own `CLAUDE.md`, in-flight skills, and plugin artifacts would
   contaminate the result. The whole point is to reproduce what an *outside* user
   experiences after installing the plugin.
2. **The seed repo carries no Team context.** Linkboard is a separate repo with
   no Team `CLAUDE.md`, skills, or plugin source. Do not add any.
3. **Never edit the frozen prompt.** Copy it verbatim. First make sure that its
   SHA-256 is correct (step 0). A one-character change forks the benchmark into a
   different benchmark.
4. **Always start from the baseline tag**, on a fresh branch, never from a moved
   `main`. The baseline tag never moves.
5. **Do not coach the pipeline.** Submit the prompt verbatim and approve only the
   single design gate. Any steering defeats the measurement.
6. **Never merge a run's output into Linkboard `main`.** Each run is a throwaway
   branch off the tag, and a merge would drift the baseline. Close or archive the
   run PR for inspection, so the baseline stays frozen.

## When to run (cadence)

The run is expensive and manual. Run it deliberately, and never in CI:

- **Before and after a notable skill or agent change**, to attribute the drift to
  that change.
- **When a new model ships**, to benchmark the model itself (#139). Today this
  means a new Claude. It means a new provider after the backend adapters land.
- **On a periodic cadence**, such as monthly, for a slow-drift baseline.

## Procedure

### 0. Pre-flight (in the Team repo)

- **Make sure that the prompt is unchanged.** Run the command in
  [`README.md`](./README.md) § *Freeze contract*. It must print
  `golden-master/prompt.md: OK`. If it fails, **stop**. Someone edited the
  prompt.
- **Decide the run parameters and write them down:** `model`, `provider`,
  `backend`, the **Team pipeline version** under test (plugin version or commit),
  and the date. These parameters key the stored result (see #136 / #139).

### 1. Prepare Linkboard at the frozen baseline

```sh
git clone git@github.com:bostonaholic/linkboard.git   # or cd into an existing clone
cd linkboard && git fetch --tags origin
git switch -c gm/<date>-<model> golden-master-baseline # fresh branch off the exact tag
git rev-parse --short HEAD                             # must be 2cfee1a (the baseline)
bin/setup                                             # gems, JS deps, and prepare the DB
bin/rails test                                        # pre-existing suite must be GREEN before the run. Record it.
```

### 2. Open Claude Code **in the Linkboard repo**

- Open a Claude Code session with its working directory set to the **Linkboard**
  repo (never the Team repo).
- Make sure that the **Team plugin at the version under test** is the active
  installed plugin. This is the real end-user path. Claude Code loads the plugin
  *as a plugin*, not from a Team source checkout in the working directory.
- Select the **model / backend** for this run and make sure that it is correct.
  Anthropic-internal model swaps work today. Cross-provider swaps depend on
  #55 / #56 / #57.

### 3. Run the pipeline

- Note the wall-clock **start**.
- Run `/team` with the **verbatim** text from [`prompt.md`](./prompt.md) as its
  argument.
- Let it run autonomously. At the **one design gate**, review the design doc and
  approve it if it aligns. Record any round-trips. Do not steer it in any other
  way.
- At completion the pipeline opens a **PR in the Linkboard repo**. Record the PR
  link. Note the wall-clock **end**.

### 4. Capture metrics (#136)

Point the metrics extractor (#136, when it lands) at the session transcript JSONL
that Claude Code wrote locally. It emits the machine-readable vector and a human
summary. The vector records these fields as a minimum:

- **time**: total and per-phase (Q→R→D→S→P→I→PR).
- **tokens**: input and output **separately**, plus cache-read and
  cache-creation. Roll them up, and also break them down per phase and per agent.
- **cost**: from the run model's pricing.
- **shape**: vertical slices, hard-gate review-retry loops, human-gate
  round-trips, and agent or subagent dispatches.
- **output and effectiveness**: files touched, lines added and removed, new
  tests, new-feature acceptance tests pass, pre-existing suite still green,
  code-review and security-review verdicts, and the PR link.
- **identity**: `model`, `provider`, `backend`, `pipeline_version`, `date`.

> **Until #136's extractor exists,** record these fields by hand from the session
> into the JSON shape below. The transcript holds the token and usage figures.
> Use those figures rather than estimates.

### 5. Verify effectiveness (in the Linkboard PR branch)

- New-feature acceptance tests **pass**.
- Pre-existing suite **still green**: 0 regressions vs. the step-1 baseline.
- Record the code-review and security-review verdicts and the hard-gate retry count.

### 6. Record + compare (in the Team repo)

- Save the vector + a one-line human summary to
  `golden-master/results/<date>-<model>.json`. **Observation data only**: it
  never runs in the build and never touches Linkboard.
- Run the compare (#135, when it lands). It grades against the baseline with
  **effectiveness floors**: tests ≥ floor, 0 regressions, and judge or reviewer ≥
  floor. It also grades with **efficiency bands**: tokens, cost, time, slices,
  and retries within ±band. It reports drift **temporally** and **head-to-head**
  across models (#139).
- Commit the results through the normal Team PR flow.

### 7. Tear down

- Discard or archive the Linkboard run branch / PR. **Do not merge it.** The
  baseline tag stays frozen for the next run.

## Choosing the model / provider (#139)

- **Anthropic-internal (now):** swap Opus, Sonnet, Haiku, or a future model in
  Claude Code. Record which model ran.
- **Cross-provider (gated):** GPT, Gemini, and others, through the model-backend
  adapters (#55 / #56 / #57, strategy #50). Document and wire them as they land.
- **Pricing is per-model.** One caveat applies across *providers*. Raw token
  counts are **not** comparable across tokenizers. Score cross-provider runs on
  **outcome quality, wall-clock, and dollar cost**. Keep token counts as a
  within-provider detail.

## Result shape (working placeholder until #136 fixes the schema)

```json
{
  "date": "YYYY-MM-DD",
  "model": "claude-opus-5",
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
- The **metrics extractor** (#136) and the **compare / report** (#135) that steps
  4 and 6 name are **not yet built**. Until they land, capture and compare by
  hand with the shapes above.
- The **first end-to-end dry run** is the remaining item on #137. It is recorded
  as the first stored baseline. It depends on that tooling, or on a deliberate
  hand-recorded first pass.

## See also

- [`README.md`](./README.md): what the GM is, and the freeze contract.
- [`prompt.md`](./prompt.md): the frozen feature prompt.
- [`../docs/testing.md`](../docs/testing.md): the per-agent harness this sits *outside* of.
- Epic #132 · metrics #136 · compare #135 · cross-model #139.
