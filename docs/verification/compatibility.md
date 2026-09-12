# M13: migration compatibility report

Milestone #381 closes the playbook migration. It recounts the catalog and
instruction content, audits the 91 original dispositions for leftovers, runs the
free and installed-host checks, and records the paid and Golden Master gaps. The
result is a complete migration: 91 registrations reduced to 25, every public
command preserved, no dangling retired reference, and a green free suite.

The [final inventory](baselines/m13.json) is committed beside the
[initial inventory](baselines/m01.json) for direct comparison. Its `revision`
field records the measured checkout HEAD — the M12 predecessor `fc472bed`, whose
runtime tree is byte-identical to this milestone because M13 changes only
documentation. The [migration contract](../migration-contract.md) records the
per-milestone destinations and retained contracts.

## Catalog recount

| Metric | M01 baseline | M13 final | Change |
| --- | ---: | ---: | ---: |
| Registered skills | 91 | 25 | −66 (−72.5%) |
| Entry / methodology / principle | 25 / 41 / 25 | 25 / 0 / 0 | −41 methodology, −25 principle |
| Agent definitions | 13 | 13 | 0 |
| Codex manifests (`openai.yaml`) | 91 | 25 | −66 |
| OpenCode commands / discovery paths | 91 / 87 | 25 / 21 | −66 / −66 |
| Measured input paths | 377 | 266 | −111 |

The 25 retained skills are exactly the public commands the parent brief named:
`team`, `team-fix`, the eight standalone phase commands, `how`, `why`,
`code-review`, `eng-design-doc-review`, `pr-verify`, `shipit`,
`pr-open-comments`, `pr-watch-as-author`, `pr-watch-as-reviewer`, `pr-rebase`,
`pr-cleanup`, `pr-screenshots`, `groom-backlog`, `reflect`, and `no-comments`.
[`docs/skills.md`](../skills.md) lists them with their load edges.

**Zero exceptions.** The milestone's scope allowed no predetermined removals and
no forced count. No capability was demoted past its entry-point contract, and no
extra skill was invented, so there is no retained-skill exception to record. The
25 count is the natural result of the parent's destination map, not a floor
achieved by deleting useful capabilities.

## Instruction content

| Metric | M01 baseline | M13 final | Change |
| --- | ---: | ---: | ---: |
| Root `SKILL.md` words / bytes | 30,722 / 224,489 | 11,604 / 88,562 | −19,118 (−62%) |
| Skill Markdown files / words / bytes | 249 / 120,620 / 804,426 | 204 / 112,497 / 753,600 | −45 / −8,123 (−6.7%) |
| Agent Markdown files / words / bytes | 13 / 6,813 / 47,216 | 13 / 7,545 / 54,877 | 0 / +732 (+10.7%) |
| All instruction files / words / bytes | 262 / 127,433 / 851,642 | 217 / 120,042 / 808,477 | −45 / −7,391 (−5.8%) / −43,165 (−5.1%) |
| Non-Markdown resources | 108 | 42 | −66 (66 openai.yaml; scripts preserved) |
| Declared preload / direct loads | 68 / 137 | 0 / 13 | −68 / −124 |
| Distinct citations | 142 | 28 | −114 |
| Skills without a declared caller | 46 | 20 | −26 |

Three measurements describe the actual delivery change, and they move in
opposite directions on purpose:

- **Always-loaded surface fell.** Root `SKILL.md` words dropped 62% and declared
  skill preloads dropped from 68 to 0. What an agent now sees without asking is
  its own role body plus the short shared contracts, not 66 preloaded bodies.
- **Total instruction words fell 5.8%.** Most of the migration moved text, it
  did not delete it: 66 `SKILL.md` bodies became ordinary playbooks, principles,
  and references that consumers read by path at the consuming step. The word
  total therefore barely moves while the load surface collapses.
- **Agent bodies grew 10.7%.** Consolidation put the one-consumer instructions
  (progress tracking, inline procedure pointers, resource-read directives) in
  the agent body instead of a shared preload, so the agent definition carries
  more of its own contract.

All 17 non-manifest resources were preserved. The three scripts that moved —
`external-review.mjs`, `supports-nesting.mjs` (+ `.d.mts`), and `ste-lint.mjs` —
now live under `skills/team/references/` and run byte-identical. The 66-resource
drop is the 66 `openai.yaml` manifests of the retired registrations.

## Leftover audit

The 66 retired names were swept against the runtime tree (`skills/`, `agents/`,
`hooks/`, `opencode/`, and the three host manifests):

- **No retired skill directory remains.** None of the 66 names has a `skills/`
  directory.
- **No dangling load.** Zero occurrences of ``Call the Skill tool with
  `<retired>` `` and zero `skills:` preloads referencing a retired name. The
  inventory reporter raises on any unresolved declared load, and it completed
  with 25 resolved skills.
- **No accidental manifest registration.** Exactly 25 `agents/openai.yaml`
  files and 25 OpenCode commands remain; the OpenCode native discovery paths
  (21) exclude only the four `disable-model-invocation: true` entry skills.
- **Negative tripwires confirm absence.** `tests/opencode-plugin.test.ts`
  asserts `artifact-frontmatter` and `principle-never-interpolate` are absent
  from native discovery and commands; the catalog, budget, thin-agent, and
  protocol suites pin the 25/13 split.

Four substring matches needed triage and all four are non-references: the word
"solid" in prose, the pstack `unslop` citation in `writing.md`, the
`cross-model-review.md` reference path, and the ordinary word "changelog".
Retired names in `tests/`, `evals/`, and the two baseline documents are
intentional: negative tripwires, the name-to-path mapping fixtures, and the
historical migration record.

## Verification results

All commands run from the Team checkout at the migration HEAD. Exact outcomes:

| Command | Result |
| --- | --- |
| `bun install --frozen-lockfile` | exit 0 |
| `bun test` | 2876 pass / 4 skip / 0 fail; 2880 tests across 83 files |
| `bun run typecheck` | exit 0 |
| `bash .claude/scripts/check-discovery-consistency.sh` | `All discovery-consistency assertions passed.` |
| Focused route/recovery/gate suites (11 files) | 430 pass / 0 fail |
| `bun run eval:select` | exit 0; 15 tests selected (global touchfile) |
| `shasum -a 256 -c` on `golden-master/prompt.md` | `OK` |
| `git diff --exit-code e5f8538c… -- golden-master/prompt.md golden-master/README.md` | exit 0 (no drift) |

The 4 skips are the same pre-existing hook-schema skips recorded at M01: the
four hook sources do not write payloads to stdout, so the conditional
stdout-schema assertions do not apply. The free suite covers the required route
(`route-routing`, `route-recovery`), recovery (`pipeline-recovery`), permission
and gate (`protocol`, `thin-agents`, `architecture`), verification lifecycle
(`pr-verify`, `verify` playbook), and installed-host delivery
(`dev-install-claude`, `dev-install-codex`, `dev-install-antigravity`,
`dev-install-opencode`) cases.

The installed-host cases are the deterministic fake-host installer suites: a
consumer outside the checkout reads its playbook, principle, and cross-skill
reference from the installed plugin root, retired names are absent, and
deleting an installed resource fails the consuming read with the resolved path.
Those pass inside `bun test`.

## Remaining limitations

These are not passed checks. They are the evidence the migration still owes at
the parent's final acceptance.

- **Paid evaluations.** `EVALS_ANTHROPIC_API_KEY` is unset in this environment,
  so `bun run test:evals` did not run. The selector lists 15 selected tests
  (changelog, git-commit, team-question/research/design/structure/plan/fix,
  code-reviewer, eng-design-doc-review, unslop). Selection alone proves no
  behavior.
- **Native live-host instruction use.** Claude Code reports `loggedIn=true`
  (claude.ai), but no metered instruction-use trace was captured. The
  deterministic installer suites establish copied filesystem bytes, not how a
  live host assembles the receiving agent's context.
- **Golden Master external run.** The frozen prompt digest and frozen files are
  unchanged, and the runbook's human-approval instructions were reconciled with
  the autonomous gate at M01. The actual external `/team` run against the
  Linkboard baseline at `2cfee1a` did not run. It is a deliberate manual run
  that clones Linkboard, drives a full paid pipeline from a Claude Code session
  installed as the plugin, and hand-records metrics; it remains the parent's
  final manual acceptance step.

Confidence: high for the recount, audit, and free-suite results, from the
committed inventory JSON and the green suite. The limitations above are
unavailable, not failed, and are reported as such.
