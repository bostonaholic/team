# Contract resources: M02 corrective verification

M02 moves artifact and shell contracts into installed resources and updates their dispatch and evaluation consumers.
The corrective checks preserve all 49 milestone acceptance cases and six controls across 13 locked blocks.
Independent review and committed-revision checks are recorded in the pull request.

## Identity and evidence

The predecessor is `bf78df59f7e73f58c3f2ce2719e8a60c3219c35c`.
The correction was tested after `136c3ee37ce7f9294154aa90c9504fff4959d752` on `GH-370-contract-resources`.
The containing commit and pull request identify the signed revision; the raw input hashes bind the checks to its files.
The [M01 report](migration-baseline.md) and [initial inventory](baselines/m01.json) retain their historical bytes.

Raw corrective evidence resides in `.context/verification/m02-review-fix/`:

| Manifest | Contents |
| --- | --- |
| `source-identity.json`, `files.txt`, `final-inputs.json` | HEAD, branch, exact changed paths, patch digest, and final input hashes |
| `commands.json` and each command's `.json`, `.stdout`, `.stderr` | Arguments, working directory, start time, duration, status, and separate raw streams |
| `immutable-block-checks.json` | Expected and actual hashes for all 13 locked blocks |
| `fixture-contracts.json` | Preserved fixture bodies, ground truth, rubrics, historical evidence, and copied seed hashes |
| `contract-preservation.json` | Predecessor/resource digests and exact permitted transformation |
| `consumer-map.json`, `dispatch-audit.md`, `input-audit.md` | Owning operations, delivery paths, verification cases, and prerequisite classifications |

These local records accompany the coordinator handoff. They are ignored files, not published site assets.
The full-suite snapshot and final manifest distinguish executable inputs from the report's later result update.

## Corrections and deterministic checks

The original milestone contributed 41 acceptance cases and one harness control.
The accepted supplements add eight acceptance cases and five controls: 49 acceptance cases and six controls total.
The eight corrective cases first failed through assertions. Their raw Red output remains in `corrective-red.stderr`.

Dispatch corrections cover code-review, pr-verify, applicable nested file-finders, and reflect's existing file-finder lenses.
Each uses the existing installed-root/definition/resource procedure. Named, body-loaded, read-only fallback, and Research isolation contracts remain.
Structure and Plan receive task authority copied from the existing token-bucket Design fixture before runner invocation.
Plan also receives that fixture's research. Design review receives its unchanged excerpt on disk and the substituted artifact-directory argument.
Question omits inapplicable conditional templates. Unslop status/relay omits the full decomposition workflow while retaining applicable resource contracts.

| Command | Result | Raw record |
| --- | --- | --- |
| Targeted caller, callback, selector, catalog, and source-budget tests | PASS: 365 tests, zero failures | `targeted-final.*` |
| `bun run typecheck` | PASS | `typecheck-final.*` |
| `bash .claude/scripts/check-discovery-consistency.sh` | PASS | `discovery-final.*` |
| `bun run scripts/migration-inventory.ts <checkout-root>` | PASS: 89 registrations, 25 entry points, 40 methodologies, 24 principles | `inventory-final.*` |
| `bun test` | PASS: 2,678 pass, four unchanged hook-schema skips, zero fail | `full-final.*` |
| Existing selector with explicit changed-input override | PASS: all 14 cases selected through the global dependency; no paid execution | `selection-worktree.*` |
| Locked Ruby/Jekyll build from `docs/` | PASS with Ruby 3.3.6 and frozen existing gems | `docs-build-final.*`, `docs-pages.json` |

The coordinator reran the predecessor suite: 2,625 pass, four skip, zero fail, under `.context/verification/m02-baseline/`.
Earlier candidate results and failures remain under `.context/verification/m02-implementation/`.
The first corrective preservation check omitted the artifact link's label transformation. Its failure remains in `contract-checks.*`.
The corrected comparison passes and changes no product resource bytes.

The external-data body and conditional template match predecessor bytes exactly after registration metadata removal where applicable.
The artifact schema has only registration metadata removal and the conditional link's label/target relocation.
All three installed resources remain byte-identical to the coordinator's native candidate.
Confidence: high for these deterministic claims, from retained output and byte comparisons.

## Native observations and unavailable results

Native evidence is separate under `.context/verification/m02-native/`: original `summary.json`, `opencode-path-controls-observed.json`, and both `antigravity-*-receiving.observed.json` records.
The copied native candidate started at `136c3ee3`. Hash comparisons confirm the observed questioner, decomposition procedure, and three resource files match the corrected source.
The later dispatch changes were verified by deterministic caller tests; the native probes did not execute those changed callers.

| Host | Observed result and limit |
| --- | --- |
| Codex | Completed explicit candidate-path reads of both contracts and the conditional template. No native catalog installation was tested. |
| OpenCode | Initial inference guessed two wrong paths and continued before eventual consumption. This failed the stop-on-read-error instruction. |
| OpenCode explicit-path controls | Positive control read the skill, definition, and all resources. Negative control stopped at the intentionally missing resource and named its exact path. |
| Claude | Native plugin loaded 13 agents and exposed 25 Team entry commands. Inference failed with HTTP 429 from weekly quota exhaustion. |
| Antigravity isolated | Authentication was absent in isolated HOME. Startup attempted OAuth and timed out after 60 seconds; no model delivery. |
| Antigravity normal authentication | Gemini 3.8 Flash/medium completed five native file reads, including all resources. The initial probe warned that disabling slash commands made plan mode ineffective. A corrected probe omitted that flag, completed the same reads, and had empty stderr. Global host configuration remained active; no native catalog discovery or write-denial control was tested. |

Installer fixtures establish copied bytes, outside-checkout resolution, missing-resource diagnostics, and fixture cleanup.
Configuration inspection and eventual resource consumption do not establish a general fail-fast guarantee.
Antigravity native logs retain transient startup authentication errors before successful silent authentication, a browser dependency download failure, and enabled terminal sandboxing. No browser, shell, or write tool was invoked.
Confidence: high for recorded reads and errors. These bounded observations do not measure general adherence across all callers.

No paid evaluation or Golden Master pipeline ran for this correction. Those results remain unavailable.
The historical Research run in CI `34619223350` reports absent source, reuses the topic, and passes.
Its raw record is `.context/issue-368/ci-baseline-artifacts/periodic-evals-team-research-34619223350/0.104.0-main-e2e-2026-09-11T15-58-16.156Z.json`.
This recorded absence remains unchanged. Research receives no invented application source or task authority.
Other pre-existing evaluation conditions and bounded procedure applicability are classified in `input-audit.md`.
