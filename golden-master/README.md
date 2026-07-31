# Golden Master benchmark

This directory holds the **frozen input** for the Team pipeline Golden Master, an
out-of-band characterization run. We feed the *same* feature prompt to the full
`/team` pipeline against a *frozen* external app. We then compare each run's
output against history, on effectiveness and efficiency metrics. See the epic:
#132.

The same frozen input serves **two** benchmarks:

1. **Pipeline drift over time.** Replay the prompt as our skills and agents
   change. Attribute the differences to *our* changes.
2. **Model / provider comparison.** Replay the prompt on a new underlying model,
   such as a new Claude, GPT, or Gemini. This benchmarks *the model itself*
   through a realistic full-pipeline task (#139).

The prompt is thus deliberately **provider-neutral**, and it names no model and
no vendor. The seed app is vanilla. The exact same input is portable across any
backend.

> **Out of band, by design.** This is **not** part of the build, `bun test`, or
> CI. A `/team` run from inside this repo would let Team's own context poison
> what must be a real-world test. The seed app (Linkboard) lives in a
> **separate, isolated repository**. Only the prompt, the per-run results, and
> the runbook live here.

## Contents

| File | Purpose |
|------|---------|
| `prompt.md` | The frozen canonical feature prompt (Save/Bookmark). **DO NOT EDIT.** |
| `results/` | Per-run metric vectors, added by #136. |
| `RUNBOOK.md` | Operator procedure for a run + isolation rules. |

## Freeze contract

A Golden Master run has **two frozen halves**: this `prompt.md` and the Linkboard
baseline tag **`golden-master-baseline`** (commit `2cfee1a`) that every run branches
from. The input is **the prompt × that baseline**, so keep both pinned.

`prompt.md` is immutable. Each run replays it verbatim. A change to it
invalidates every historical comparison. Its SHA-256 is pinned here as a tamper
check:

```
8c5bb38e357103f783d2ad80dcc8fa551891a586356ab49b3dcebf378580fa4f  golden-master/prompt.md
```

Before a run, make sure that the prompt is unchanged:

```sh
echo "8c5bb38e357103f783d2ad80dcc8fa551891a586356ab49b3dcebf378580fa4f  golden-master/prompt.md" | shasum -a 256 -c
```

If this fails, the prompt was changed. The benchmark history is then no longer
comparable. An operator runs this check
**manually as part of the runbook (#137)**. It is deliberately *not* wired into
CI, which agrees with the out-of-band design above.
