# Migration verification

Use these commands from the Team checkout that contains the reporter and installed dependencies.
Read the [migration contract](../migration-contract.md), [initial inventory](baselines/m01.json), and [recorded observations](migration-baseline.md).

Dependencies are Bun, Git, Node, Bash, and the packages in `bun.lock`.
Install missing packages with `bun install --frozen-lockfile`.
The supplied baseline used Bun 1.4.2. Free checks need no model credentials.

| Command | Expected result | Evidence |
| --- | --- | --- |
| `bun run scripts/migration-inventory.ts <checkout-root>` | JSON on stdout, exit 0 | [Initial inventory](baselines/m01.json) |
| `bun test ./tests/migration-inventory.test.ts` | Three passing acceptance cases | [Replay records](migration-baseline.md) |
| `bun test` | No failures, with conditional skips named | [Free-suite observations](migration-baseline.md) |
| `bun run typecheck` | Exit 0 | [Typecheck observations](migration-baseline.md) |
| `bash .claude/scripts/check-discovery-consistency.sh` | `All discovery-consistency assertions passed.` | [Discovery observations](migration-baseline.md) |
| `bun run eval:select` | Exit 0 with the selected evaluation names | [Selection observations](migration-baseline.md) |

`<checkout-root>` identifies the measured checkout. The command uses its Git revision, skills, agents, manifests, and OpenCode sources.
The reporter and imported helpers run from the checkout containing the script.
They define the measurement algorithm and are separate from the measured inputs.

Before initial capture, refresh `origin/main` and supply a matching measured checkout.
Require equality between its HEAD and that resolved revision, plus an empty `dirtyInputs` list.
Record the refresh evidence or its freshness limit. A clean input list alone does not establish remote freshness.
The reporter accepts dirty inputs for comparisons and reports `initialBaselineEligible: false`.
Reject that output for initial capture. Keep later comparisons separate from `baselines/m01.json`.

The output fields have these meanings:

| Field | Meaning |
| --- | --- |
| `revision` | Measured checkout's HEAD |
| `inputs`, `dirtyInputs` | Sorted measured file paths and changed paths within those inputs, including deletions |
| `initialBaselineEligible` | True only when measured inputs are clean |
| `files`, `totals` | Per-file and aggregate Markdown words and bytes beneath `skills/` and `agents/` |
| `resources` | Non-Markdown paths beneath those directories, without instruction-word counts |
| `skills[].root` | Root `SKILL.md` words and bytes |
| `skills[].totals` | Recursive Markdown totals for that skill, including references and frontmatter |
| `skills[].callers` | Declared agent preloads and direct Skill-tool loads, with empty sets retained |
| `citations` | Literal `skills/<name>/SKILL.md` citations, separate from declared loads |
| `categories` | Entry, methodology, and principle counts using existing category rules |
| `registrations` | Immediate skills, agents, Codex manifests, source-derived host counts, and separate OpenCode command/discovery counts |

Words are nonempty whitespace-delimited tokens. Bytes come from original file buffers, including frontmatter and multibyte text.
The reporter reads each input once. Counts impose no new ceiling.
Missing roots, unreadable inputs, and unresolved declared loads fail with named diagnostics.
Citations do not prove a load. Empty caller sets do not prove a skill is unused.
Host counts describe source registrations, without a live-host probe or transitive context estimate.
The reporter assumes the existing valid catalog metadata conventions. It does not replace the OpenCode catalog validator.

Retain stdout and stderr separately under an owned `.context/verification/<run-id>/` directory.
Record command, revision, working-tree state, exit status, duration, counts, skips, and relevant failure output before cleanup.
For example, capture a focused run without a pipeline that hides its exit status:

```bash
mkdir -p .context/verification/my-run
bun test ./tests/migration-inventory.test.ts > .context/verification/my-run/focused.stdout.log 2> .context/verification/my-run/focused.stderr.log
result=$?
printf '%s\n' "$result" > .context/verification/my-run/focused.exit
```

Use distinct filenames for each command and retry. Copy useful results into the baseline document before removing local evidence.
The reporter creates no temporary state. Inventory test teardown removes its fixtures after each case.
The full suite and discovery script own their disposable fixtures. Their output must remain available after fixture cleanup.
The existing discovery cleanup suppresses removal errors, so its success line alone cannot prove cleanup succeeded.
Remove only your own retained logs when they are no longer needed.

The [selector](../../tests/helpers/touchfiles.ts) compares committed changes through `origin/main...HEAD`.
It excludes staged, unstaged, and untracked edits. Run it again after the coordinator commits.
Zero selected evaluations establishes only selection, without any paid evaluation execution.
Local paid checks, native-host probes, and the external Golden Master need their own available credentials and evidence.
Confidence: high for command and output contracts, from the reporter, locked acceptance cases, and existing harness sources.
