# Golden Master benchmark

This directory holds the **frozen input** for the Team pipeline Golden Master — an
out-of-band characterization run. We feed the *same* feature prompt to the full
`/team` pipeline against a *frozen* external app and compare each run's output
(effectiveness + efficiency metrics) against history, so we can see how changes to
skills and agents move the result. See the epic: #132.

> **Out of band, by design.** This is **not** part of the build, `bun test`, or
> CI — running `/team` from inside this repo would let Team's own context poison
> what is meant to be a real-world test. The seed app (Linkboard) lives in a
> **separate, isolated repository**; only the prompt, the per-run results, and the
> runbook live here.

## Contents

| File | Purpose |
|------|---------|
| `prompt.md` | The frozen canonical feature prompt (Save/Bookmark). **DO NOT EDIT.** |
| `results/` | Per-run metric vectors — added by #136. |
| `RUNBOOK.md` | Operator procedure for a run — added by #137. |

## Freeze contract

`prompt.md` is immutable: it is replayed verbatim across runs, so editing it
invalidates every historical comparison. Its SHA-256 is pinned here as a
tamper check:

```
f6c46a2388dbfbda56b51c97e7a625e518186b8083ee2bc4afbde41fbbb165fe  golden-master/prompt.md
```

Verify from the repo root before a run:

```sh
echo "f6c46a2388dbfbda56b51c97e7a625e518186b8083ee2bc4afbde41fbbb165fe  golden-master/prompt.md" | shasum -a 256 -c
```

If this fails, the prompt was changed and the benchmark history is no longer
comparable. This check is run **manually as part of the runbook (#137)** — it is
deliberately *not* wired into CI, consistent with the out-of-band design above.
