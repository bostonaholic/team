---
title: Testing
description: "Team's test suite: free deterministic contract checks for a prose-heavy plugin, with model behavior checks run by hand and never on the merge gate."
# no audience key: deliberately absent from the site nav
---

# Testing

Team's suite was deleted in [#430](https://github.com/bostonaholic/team/pull/430)
so a new methodology could be designed from scratch. This document is that
design. It borrows from what comparable skill collections actually run, and it
keeps the one idea from the old six-layer harness that survived contact with
reality: **push every check toward the cheap, deterministic end, and assert
contracts, never wording.**

Today four test files survive under `tests/`, all green, none wired into CI:

| File | Pins |
| --- | --- |
| [`tests/skill-path-references.test.mjs`](../tests/skill-path-references.test.mjs) | every path a skill or agent cites exists |
| [`tests/skill-description-metadata.test.mjs`](../tests/skill-description-metadata.test.mjs) | description shape and per-skill `agents/openai.yaml` |
| [`tests/version-bump-packaging.test.mjs`](../tests/version-bump-packaging.test.mjs) | `version-bump` ships on every host |
| [`tests/script-entry-guard.test.mjs`](../tests/script-entry-guard.test.mjs) | a skill script's CLI entry guard survives a symlinked directory and does not run on import |

[`package.json`](../package.json) has no `test` script and no workflow runs
them.

## How skill collections test

The same shape recurs across agent-skill collections and skill-plugin
marketplaces:

- **Most ship nothing.** A collection of prose skills is treated as content;
  CI, when it exists, validates release metadata only.
- **The ones that test start static.** Frontmatter, description shape, path
  references, and the host manifests that advertise the skills. These are cheap,
  deterministic, and catch the failure mode that matters most for prose: a
  reference or a manifest that no longer matches the tree.
- **A few add a thin behavior layer.** Spawn the host CLI with the plugin
  loaded, then assert which skill fired by reading tool-call events from a
  streamed transcript. These check routing and triggering, not prose quality.
- **Model-judged evals stay off the merge gate.** They are rare, expensive, and
  stochastic; where they exist they run on a schedule or in a separate harness.
- **Nobody gates on wording.** Collections that pin their prose pin the
  identifiers inside it (commands, paths, keys), never sentences.

## The shape for Team

Team is a prose-and-manifest product. Nearly every regression it can ship is a
broken contract between files: a skill pointing at a deleted reference, an agent
whose `phase` drifts from
[`registry.json`](../skills/team/registry.json), a host manifest that misses a
skill, a landing guard that loses its explicit-intent wording. All of those are
statically checkable, for free, in milliseconds. So:

1. The bulk of the suite is **L2 static contracts**.
2. The free/paid line is absolute: `npm test` calls no model and touches no
   network.
3. Model behavior is a **hand-run smoke script**, not a CI gate. The eval
   laboratory is not restored.

### Layers

| Layer | What it checks | Cost | On the merge gate? |
| --- | --- | --- | --- |
| L1 pure unit | a function's input to output | ms | yes, when functions exist |
| L2 static contract | source and manifests against themselves | ms | yes |
| L3 integration | real scripts and git fixtures via subprocess | seconds | yes |
| L4 behavior smoke | the live model, host CLI, streamed tool calls | minutes, paid | no, hand-run |
| [Golden Master](../golden-master/RUNBOOK.md) | the whole pipeline against a frozen app | hours, paid | no, manual runbook |

Mapping to the removed harness: old L1-L3 return in reduced form. Old L4 has no
subject left (no runtime hooks, no server). Old L5-L6 return only as the L4
smoke script; the deleted eval fixtures stay in git history at
[#430](https://github.com/bostonaholic/team/pull/430) and are recovered only if a
behavior proves it cannot be pinned cheaply.

## The suite

### L2: static contracts (the bulk)

| File | Contract |
| --- | --- |
| [`tests/skill-path-references.test.mjs`](../tests/skill-path-references.test.mjs) (exists) | every path reference under `skills/` and `agents/` resolves |
| `tests/skill-contracts.test.mjs` (extends [`skill-description-metadata.test.mjs`](../tests/skill-description-metadata.test.mjs)) | frontmatter parses; `name` matches the directory; only supported keys; every runtime skill ships `agents/openai.yaml`; `argument-hint` present where a command takes arguments |
| `tests/agent-contracts.test.mjs` | `agents/*.md` agrees with [`skills/team/registry.json`](../skills/team/registry.json) on name, phase, and parallel flag; reviewers hold no `Write`/`Edit` and carry `permissionMode: plan`; producers hold `Write`; every agent declares a valid `model` and `effort`; methodology skills declare no `effort` |
| `tests/host-packaging.test.mjs` | every host manifest parses and the version strings agree (extends [`check-version-consistency.sh`](../.claude/scripts/check-version-consistency.sh)); every skill is reachable on every host (Claude, Codex, Antigravity, OpenCode); the OpenCode catalogue loads every skill and drops guarded ones from implicit invocation |
| `tests/landing-guards.test.mjs` | `disable-model-invocation: true` on the skills whose docs say user-invoked-only; no `--yes` on `shipit` or `pr-rebase`; `version-bump` stays packaged for every host |
| `tests/changelog.test.mjs` | `## [Unreleased]` links are absolute URLs; released sections are dated and carry a version |
| `tests/inventory.test.mjs` | the router counts in `AGENTS.md` match the tree (agents, skills, commands); the README command table matches `skills/` |
| `tests/free-suite.test.mjs` | no file outside `tests/behavior/` spawns a model CLI or reads the network (the meta-tripwire that keeps "free" true) |

Every tripwire here asserts something a machine reads: a key, a value, a path, a
tool grant, a command. Section headings and body prose are out of scope. The
decision rule, kept from the old harness:

> If a rewrite that preserves the meaning turns the test red, the test is
> measuring wording. Delete it, or find the identifier underneath it.

Two guardrails apply to every new tripwire:

- **Absence assertions need a positive control.** Point the check at a known
  positive and watch it fire before trusting a clean run. A renamed heading or
  an empty section makes a `doesNotMatch` pass for the wrong reason.
- **Prove it can fail.** When adding a contract, break the source it guards,
  watch the test go red, revert.

### L1: pure unit (small by design)

A prose plugin has little pure logic. The version math and semver checks live in
shell scripts, so they are L3 subprocess tests, and the frontmatter parser in
[`opencode/catalog.mjs`](../opencode/catalog.mjs) is only reachable through its
loader, so it is L3 too. Do not extract functions to fill this layer. Add an L1
test when a genuinely pure function appears.

### L3: integration on real fixtures

| File | Contract |
| --- | --- |
| `tests/version-consistency.test.mjs` | [`check-version-consistency.sh`](../.claude/scripts/check-version-consistency.sh) exits 0 on the real tree and 1 on a copy with one drifted version string |
| `tests/pre-merge-guard.test.mjs` | the hook's stdin contract: a non-merge Bash call passes; a merge without a bump is denied; a stale or wrongful bump is denied; a correct bump passes; the deny text names the cause |
| `tests/worktree-detection.test.mjs` | the documented detection snippet against a real temp repo: a linked worktree is reused, the default branch stops |
| `tests/catalog.test.mjs` | [`opencode/catalog.mjs`](../opencode/catalog.mjs) against fixture trees: guarded skills stay out of implicit invocation, malformed frontmatter fails loudly |

Subprocess tests make their own scratch directories keyed by pid, never share
`.dev/`, and run serially. A past flake
([#303](https://github.com/bostonaholic/team/issues/303)) came from parallel runs
sharing scratch state; that isolation is the fix, not a retry.

### L4: behavior smoke (hand-run)

`tests/behavior/run.sh` follows the streamed-transcript pattern: spawn
`claude -p --plugin-dir . --output-format stream-json --max-turns N` in an
isolated temp project, then assert on tool-call events only.

Start with three prompts:

1. an investigation request routes to `investigate`, not to the full pipeline
2. a plain coding question starts no pipeline
3. a bug report routes to `team-fix`

The script prints which skills fired, the turn count, and the cost. Run it
before and after any change to a skill description or the routing table. It is
never a required check, and a bad run is a finding to investigate, not a red
build.

## What runs when

| Trigger | Command | Scope | Required? |
| --- | --- | --- | --- |
| before commit | `npm test` | L1-L3, under a second | no |
| pull request | `.github/workflows/tests.yml` runs `npm test` | L1-L3 | yes |
| manual | `tests/behavior/run.sh` | L4 | no |
| manual | [`golden-master/RUNBOOK.md`](../golden-master/RUNBOOK.md) | whole pipeline | no |

The workflow is `actions/setup-node` with Node 22 and a single `npm test` step.
There are no dependencies to install. `plugins validate` stays a local dev check
([`dev.yml`](../dev.yml) runs `claude plugin validate .`); no external CLI enters
the PR gate.

## Rules the suite follows

- **Contracts, not wording.** See the rule in L2.
- **Free stays free.** The meta-tripwire fails if a model call leaks into the
  default suite.
- **Hermetic.** Tests resolve the repo root from `import.meta.url`, not the
  working directory; temp state is per-pid and cleaned up; no network.
- **One file per contract**, named for the contract; bug fixes get a regression
  test named for the bug.
- **No coverage or lint targets.** A number is a smell test, not a goal.

## Adoption order

1. **Wire the existing four files.** Add `"test": "node --test"` to
   [`package.json`](../package.json), add `tests.yml`, add the job to branch
   protection, and note `npm test` in [`CONTRIBUTING.md`](../CONTRIBUTING.md).
   Verify: the check runs on a PR, and a deliberately broken path reference
   turns it red.
2. **Add the L2 contracts** (agents, hosts, guards, changelog, inventory).
   Verify: each new tripwire fires when its source is mutated, then passes on
   the reverted tree.
3. **Add the L3 fixtures** (version consistency, pre-merge guard, worktree
   detection, catalogue). Verify: red on the drift fixtures, green on the real
   tree.
4. **Add the L4 smoke script.** Verify: one hand-run records turns and cost.
5. **Stop.** Revisit evals only when a behavior cannot be pinned any cheaper.

Step 2 will surface real drift on its first run. One known example: four
side-effecting skills (`shipit`, `pr-cleanup`, `groom-backlog`,
`pr-open-comments`) rely on description wording alone while five others carry
`disable-model-invocation: true`. The test cannot decide the policy; it makes
the split visible and requires the checked-in list to be deliberate.

## Non-goals

- restoring the 118-file TypeScript/Bun harness
  ([#430](https://github.com/bostonaholic/team/pull/430))
- model calls or secrets in the default suite
- model-as-judge evals on the merge gate
- asserting sentences, section order, or file length
- coverage thresholds
- running the Golden Master in CI
