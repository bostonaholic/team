# Migration verification

Use these commands from the Team checkout that contains the reporter and installed dependencies.
Read the [migration contract](../migration-contract.md), [initial inventory](baselines/m01.json), and [recorded observations](migration-baseline.md).
The [shared-principles report](shared-principles.md) records consolidation checks and bounded native resource reads.

Dependencies are Bun, Git, Node, Bash, and the packages in `bun.lock`.
Install missing packages with `bun install --frozen-lockfile`.
The supplied baseline used Bun 1.4.2. Free checks need no model credentials.

## Capability index

This page is Team's project-local capability index. Each entry records how to
drive a capability and what proves it worked, per the
[verify playbook](../skills/team/playbooks/verify.md). The command table below
maps each capability to its **invocation** (the command), **expected behavior**
(the result column), and **evidence** (where the output lands). Prerequisites
are the dependencies above; cleanup is named per section, and evidence survives
cleanup by being copied out of owned scratch before it is removed. Start with
the affected capabilities; do not catalog the whole application before its
first useful run.

| Command | Expected result | Evidence |
| --- | --- | --- |
| `bun run scripts/migration-inventory.ts <checkout-root>` | JSON on stdout, exit 0 | [Initial inventory](baselines/m01.json) |
| `bun test ./tests/migration-inventory.test.ts` | Three passing acceptance cases | [Replay records](migration-baseline.md) |
| `bun test ./tests/dev-install-claude.test.ts ./tests/dev-install-codex.test.ts` | 34 passing installer cases | [Installed delivery observations](migration-baseline.md#installed-resource-delivery) |
| `bun test ./tests/pipeline-recovery.test.ts` | 50 passing recovery and discovery cases | [Recovery observations](migration-baseline.md#topic-recovery-and-verdict-parsing) |
| `bun test` | No failures, with conditional skips named | [Free-suite observations](migration-baseline.md) |
| `bun run typecheck` | Exit 0 | [Typecheck observations](migration-baseline.md) |
| `bash .claude/scripts/check-discovery-consistency.sh` | `All discovery-consistency assertions passed.` | [Discovery observations](migration-baseline.md#manual-inspection-and-cleanup) |
| `echo "8c5bb38e357103f783d2ad80dcc8fa551891a586356ab49b3dcebf378580fa4f  golden-master/prompt.md" \| shasum -a 256 -c` | `golden-master/prompt.md: OK` | [Golden Master observations](migration-baseline.md#golden-master-autonomous-review-protocol) |
| `RBENV_VERSION=3.3.6 BUNDLE_PATH=<bundle-path> BUNDLE_FROZEN=true JEKYLL_ENV=production rbenv exec bundle exec jekyll build --destination <outside-scratch>/site` from `docs/` | Exit 0 with the migration pages and baseline JSON | [Published-doc build](migration-baseline.md#published-documentation-build) |
| `bun run eval:select` | Exit 0 with the selected evaluation names | [Selection observations](migration-baseline.md) |

The combined focused command runs the same three suites and contains 84 cases:

```bash
bun test ./tests/dev-install-claude.test.ts ./tests/dev-install-codex.test.ts ./tests/pipeline-recovery.test.ts
```

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

## Installed resource delivery

Run both installer suites from the Team checkout:

```bash
mkdir -p .context/verification/installed-resources
bun test ./tests/dev-install-claude.test.ts ./tests/dev-install-codex.test.ts > .context/verification/installed-resources/installers.stdout.log 2> .context/verification/installed-resources/installers.stderr.log
result=$?
printf '%s\n' "$result" > .context/verification/installed-resources/installers.exit
```

Use a fresh evidence directory for each run. The dependency list above applies.
The suites use fake Claude and Codex commands, disposable plugin copies, temporary homes, and outside consumer directories.
They need writable temporary storage and no host login.
Both suites copy `team/` only for these cases.
The Codex fixture unlinks its disposable `skills/` symlink before it copies files.
Shared fixture constructors and ordinary installer cases retain their defaults.

The reader samples these paths beneath each installed root:

- `skills/team/SKILL.md`
- `skills/team/playbooks/design.md`
- `skills/team/principles/verified-results.md`
- `skills/team/references/design-template.md`
- `skills/team/registry.json`
- `skills/team/discover-topic.sh`

Expect equal source and installed bytes and SHA-256 digests before and after source-fixture removal.
Each resolved sample path must remain inside its installed root.
Bare gated discovery must select `docs/plans/GH-369-approved/` and exclude the separate topic whose review lacks a verdict.
Deleting the installed template must return exit 1 and name its missing installed path, even while the source template exists.
The four installed discovery cases prepend a fixture-owned `stat` command.
It reads each fixture file's actual modification time for the BSD and GNU argument forms.
This control isolates verdict parsing from the known GNU `stat` defect in [#387](https://github.com/bostonaholic/team/issues/387).

Standard output retains one JSON record per operation before cleanup.
Only subprocess records consistently include a command, duration, and expected and actual results.
Fixture, read, revision-query, and cleanup records use case-specific fields.
Read records include the installed root, resolved paths, byte counts, and digests.
The initial revision-query record has an empty `revision` field. Its stdout supplies the revision for later records.
Standard error retains Bun's case results, counts, and suite duration.
Keep both streams when a case fails.

Each new subprocess has a 15-second timeout. Errors and signals fail the case after the suite prints diagnostics.
After each case, teardown removes its registered plugin, home, and consumer paths and reports their absence.
Cleanup failures fail the case. Retain the logs after teardown.
The [measured records](migration-baseline.md#installed-resource-delivery) include successful reads, expected missing-resource failures, and cleanup results.
No deliberate installer timeout was injected in this baseline.
These checks establish fake-host installation and filesystem delivery. Live-host instruction use remains unmeasured.
Confidence: high for these contracts, from both installer suites and their retained operation records.

## Topic recovery and verdict parsing

Run the recovery suite and discovery acceptance script from the Team checkout:

```bash
mkdir -p .context/verification/recovery
bun test ./tests/pipeline-recovery.test.ts > .context/verification/recovery/recovery.stdout.log 2> .context/verification/recovery/recovery.stderr.log
result=$?
printf '%s\n' "$result" > .context/verification/recovery/recovery.exit
bash .claude/scripts/check-discovery-consistency.sh > .context/verification/recovery/discovery.stdout.log 2> .context/verification/recovery/discovery.stderr.log
result=$?
printf '%s\n' "$result" > .context/verification/recovery/discovery.exit
```

Use a fresh evidence directory for each run. The dependency list above applies.
The recovery suite needs writable temporary storage and no host credentials.
It uses unique non-Git consumer directories, complete artifacts, supported topic IDs, and distinct controlled artifact modification times.
Both hooks receive the consumer directory through JSON and subprocess cwd.
The malformed-JSON case omits `CLAUDE_PROJECT_DIR` and uses subprocess cwd.

Expect 50 passing cases: 19 per hook, five bare discovery cases, five explicit discovery cases, and two GNU characterization cases.
The [case tables](migration-baseline.md#topic-recovery-and-verdict-parsing) distinguish each hook from both discovery modes.
Research resumes at DESIGN. Structure resumes at PLAN.
Missing reviews, absent verdict fields, unknown tokens, and REQUEST CHANGES retain DESIGN for a design-only topic.
APPROVE and COMMENT advance it to STRUCTURE. Review 10 supersedes review 9.

The five bare discovery controls use the same fixture-owned `stat` command as the installer suites.
Two separate cases assert the GNU defect without fixing it.
One case always uses deterministic GNU stdout and failure behavior.
The other uses a real GNU process when available and labels its deterministic fallback when unavailable.

Both hooks read verdicts through physical line 60 without requiring a closing header delimiter.
Bare gated discovery requires that delimiter within 60 lines.
An existing explicit directory bypasses review filtering, including when `--require-passing-review` is present.
Explicit-path selection supplies no evidence of review enforcement.

Standard output retains JSON records for fixtures, subprocess results, parsed contexts, and cleanup.
Only subprocess records consistently include a command, duration, and expected and actual results.
Fixture, parsed-context, revision-query, and cleanup records use case-specific fields.
Hook subprocess stdout stays empty. Recovery context appears in stderr JSON under `hookSpecificOutput.additionalContext`.
No eligible topic produces empty stderr. Bun writes case results and counts to the suite's stderr log.

Each subprocess has a 15-second timeout. Errors, signals, and unexpected statuses fail the case after diagnostics print.
Teardown removes each registered consumer after its case and reports its absence. Cleanup failures fail the case.
Retain both output streams after cleanup. Inspect recorded paths for leftovers.
The discovery script suppresses cleanup errors. Run it with an owned temporary root and inspect that root separately.
No deliberate timeout was injected in the recorded run.
These checks measure phase inference and shell discovery. Source reads and installed resource reads do not prove live-host behavior.
The focused proof does not establish a corrected Linux CI run or a passing full suite.
Confidence: high, from the locked suite, runtime parsers, and retained case observations.

## Golden Master protocol and published documentation

Review isolation rule 5, pipeline step 3, metrics, and the result example in
[`golden-master/RUNBOOK.md`](https://github.com/bostonaholic/team/blob/main/golden-master/RUNBOOK.md).
Compare them with the [autonomous gate contract](https://github.com/bostonaholic/team/blob/main/skills/team/references/08-design-review-gate-design.md).
Use the `autonomous-design-review-v1` protocol label for new compliant runs.
Record zero `human_gate_round_trips` for those runs. Keep historical values.

Run the prompt digest command from the checkout root. Then compare the frozen
files with the original M01 revision:

```bash
git diff --exit-code e5f8538c2183654fe814010a38e55b2d531623e8 -- golden-master/prompt.md golden-master/README.md
rg -n 'golden-master-baseline|2cfee1a' golden-master/RUNBOOK.md golden-master/README.md
```

These commands inspect local documentation and frozen inputs. They do not run
the external Golden Master pipeline. Linkboard setup and application tests are
preparation evidence only.

The [Pages workflow](https://github.com/bostonaholic/team/blob/main/.github/workflows/pages.yml)
builds `docs/` with Jekyll. Use Ruby 3.3.6 from
[`docs/.ruby-version`](https://github.com/bostonaholic/team/blob/main/docs/.ruby-version)
and the frozen lockfile. Set
`<bundle-path>` to an owned directory with the locked gems. Set
`<outside-scratch>` to an owned temporary directory outside the checkout.
Inspect these generated paths before removing that directory:

- `migration-contract.html`
- `verification/index.html`
- `verification/migration-baseline.html`
- `verification/baselines/m01.json`

Jekyll 3 has no `--disable-disk-cache` option. Do not use an incremental build.
The command writes only beneath `<outside-scratch>/site`.

The initial local install used Ruby 4.0.6 and exited 5 because `commonmarker`
requires Ruby below 4.0. The corrected frozen install command is:

```bash
RBENV_VERSION=3.3.6 BUNDLE_PATH=<bundle-path> BUNDLE_FROZEN=true rbenv exec bundle install
```

Run it from `docs/`. It changes no manifest, lockfile, or Bundler config.
