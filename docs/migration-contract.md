# Playbook migration contract

M01 records Team's behavior before later milestones move runtime instructions.
Use the [verification commands](verification/README.md) and [revision-bound observations](verification/migration-baseline.md) to compare later changes.

- Keep runtime routing, authorization, permissions, artifact schemas, registrations, and agent preloads unchanged.
- Keep current catalog, context, and evaluation-selection budgets and mappings unchanged.
- Preserve the [frozen Golden Master prompt](https://github.com/bostonaholic/team/blob/main/golden-master/prompt.md), its pinned digest, and Linkboard's `golden-master-baseline` at `2cfee1a`.
- Preserve the [initial inventory](verification/baselines/m01.json). Explain later name or count differences against its revision.
- Treat 91 skills as the measured starting catalog. Document current-main drift without forcing a reduction.
- Reuse existing harness commands. Add no general verification runner or runtime migration.

Source inventory measures declarations and file content. It does not measure model context or native-host loading.
Fake-host installer tests measure copied resource bytes. Live-host instruction use needs separate observations.
Supplied continuous integration (CI) attempts remain historical observations, with each failure and retry separate.
Unavailable local paid evaluations, unavailable live-host checks, and unavailable full Golden Master runs remain explicit gaps.
Prepared application checkouts and application tests establish only benchmark preparation.

M01 records inventory, installed-resource delivery, recovery behavior, and the autonomous Golden Master review protocol.
The published verification pages build with the repository's locked Jekyll dependencies.
[The test strategy](testing.md) defines the applicable evidence layers.
Confidence: high for this scope, from [milestone #369](https://github.com/bostonaholic/team/issues/369).

## M02: artifact and shell resources

The M01 contract above records historical scope. M02 changes only the two registrations below and their consumers.
The predecessor is `bf78df59f7e73f58c3f2ce2719e8a60c3219c35c` on `bostonaholic/implement-issue-368`, draft #386.
The coordinator verified `origin/main` at `0e8198fab51437d35b33965e18025af45b2fa7df`: documentation and two tests changed, with no catalog drift.
The candidate catalog contains 89 registrations. Remaining skill preloads retain their existing names and metadata.

| Retired registration | Ordinary installed resource | Preserved contract |
| --- | --- | --- |
| `artifact-frontmatter` | `skills/team/references/artifacts.md`; adjacent `conditional-artifacts.md` | Fields, filenames, topic copying, revisions, verdicts, conditional ownership, and executable definition ownership. |
| `principle-never-interpolate` | `skills/team/references/external-data.md` | Argument boundaries, substitutions, backticks, allowlists, option terminators, containment, traversal, symlinks, and guarded destructive targets. |

Both retired directories and their `agents/openai.yaml` metadata are removed. No compatibility registration replaces them.
The schema body changes only its conditional-template link. The shell-rule body and conditional templates retain their bytes.
Hooks, discovery routing, schema parsing, script execution, versions, and later milestones remain unchanged.

Read resources from the active installed plugin before their consuming operation.
Skill links resolve from the loaded `SKILL.md` directory; agent links resolve from the installed definition's directory.
The schema's local template link resolves beside the schema. Load that template only for its conditional artifact.
Named and body-loaded dispatches supply the resolved root, definition, and applicable resource paths before work.
Standalone agents resolve their installed definition or receive its path from the dispatcher.
Built-in design reviewers receive the installed review-skill path and its resolved brief.
A missing required resource stops that operation and reports the resolved path. Never use checkout fallback or recursively load links.
OpenCode retains its canonical realpath base and includes that installed root in command prompts.

### Named runtime consumers

Each path below owns the operation that reads or delivers the replacement.
Existing Skill-tool loads and unrelated agent preloads remain in place.

| Consumer | Operation | Replacement or delivery |
| --- | --- | --- |
| `agents/code-reviewer.md` | Prepare cross-model review inputs | Read `skills/team/references/artifacts.md` and `skills/team/references/external-data.md` from the installed definition |
| `agents/design-author.md` | Write the design artifact and resolve repository context | Read `skills/team/references/artifacts.md` and `skills/team/references/external-data.md` from the installed definition |
| `agents/file-finder.md` | Return isolated file findings | Read `skills/team/references/artifacts.md` from the installed definition |
| `agents/planner.md` | Write the tactical plan | Read `skills/team/references/artifacts.md` from the installed definition |
| `agents/questioner.md` | Write task/questions and conditional repository artifacts | Read `skills/team/references/artifacts.md` and `skills/team/references/external-data.md` from the installed definition |
| `agents/researcher.md` | Return isolated research findings | Read `skills/team/references/artifacts.md` from the installed definition |
| `agents/structure-planner.md` | Write the vertical-slice structure | Read `skills/team/references/artifacts.md` from the installed definition |
| `opencode/team.js` | Build command prompts from the canonical plugin base | Supply installed root and skill base without changing tool grants |
| `skills/authoring-designs/SKILL.md` | Draft 6-design.md | Read `skills/team/references/artifacts.md` |
| `skills/code-review/SKILL.md` | Dispatch an independent code reviewer | Installed root, definition, and applicable resource paths through `15-host-dispatch.md` for named/body-loaded calls and Explore fallback |
| `skills/cross-model-review/SKILL.md` | Invoke vendor review adapters | Read `skills/team/references/external-data.md` |
| `skills/cross-model-review/references/procedure.md` | Prepare and assess external review data | Read `skills/team/references/artifacts.md` and `skills/team/references/external-data.md` |
| `skills/decomposing-intent/SKILL.md` | Separate task authority from neutral questions | Read `skills/team/references/artifacts.md` and `skills/team/references/external-data.md` |
| `skills/decomposing-intent/references/multi-repo.md` | Resolve repositories and write conditional 4-repos.md | Read `skills/team/references/artifacts.md` and conditional-artifacts.md when applicable |
| `skills/eng-design-doc-review/SKILL.md` | Dispatch the standalone design-review brief | Installed review-skill path, resolved review brief, and artifact schema |
| `skills/groom-backlog/SKILL.md` | Fetch and groom backlog items | Read `skills/team/references/external-data.md` |
| `skills/groom-backlog/references/17-hard-rules.md` | Validate tracker data before commands | Read `skills/team/references/external-data.md` |
| `skills/nested-agents/SKILL.md` | Dispatch researcher/implementer file-finder scouts | Installed root, definition, and applicable resource paths through `15-host-dispatch.md` for initial calls and follow-ups |
| `skills/nested-agents/references/per-agent-dispatch.md` | Apply shared setup to researcher and implementer scouts | Read shared guardrails before each applicable dispatch |
| `skills/pr-cleanup/SKILL.md` | Start authorized merged/abandoned cleanup | Read `skills/team/references/external-data.md` |
| `skills/pr-cleanup/references/01-input.md` | Resolve the cleanup target | Read `skills/team/references/external-data.md` |
| `skills/pr-cleanup/references/03-untrusted-input-pr-metadata-is-data.md` | Pass PR metadata safely into cleanup commands | Read `skills/team/references/external-data.md` |
| `skills/pr-rebase/SKILL.md` | Start an explicitly requested rebase | Read `skills/team/references/external-data.md` |
| `skills/pr-rebase/references/01-input.md` | Resolve the rebase target | Read `skills/team/references/external-data.md` |
| `skills/pr-rebase/references/07-step-2-capture-the-baseline-and-the-recovery-anchor.md` | Capture rebase baseline and recovery state | Read `skills/team/references/artifacts.md` |
| `skills/pr-screenshots/SKILL.md` | Start an authorized screenshot attachment | Read `skills/team/references/external-data.md` |
| `skills/pr-screenshots/references/01-input-and-result.md` | Resolve screenshot files and target PR | Read `skills/team/references/external-data.md` |
| `skills/pr-screenshots/references/02-upload-and-body-edit.md` | Upload images and edit the PR body | Read `skills/team/references/external-data.md` |
| `skills/pr-screenshots/references/03-verify.md` | Verify the uploaded image and body edit | Read `skills/team/references/external-data.md` |
| `skills/pr-screenshots/scripts/write-companion.sh` | Write the attachment companion record | Preserved shell arguments governed by `skills/team/references/external-data.md` |
| `skills/pr-verify/references/04-execution.md` | Trace PR checklist claims with a read-only file finder | Installed root, definition, and applicable resource paths through `15-host-dispatch.md` for initial calls and follow-ups |
| `skills/qrspi-workflow/SKILL.md` | Advance phases using artifact state | Read `skills/team/references/artifacts.md` |
| `skills/reflect/references/04-the-lenses.md` | Dispatch read-only transcript analysis lenses | Installed root, definition, and applicable resource paths through `15-host-dispatch.md` with existing lens scope overrides |
| `skills/sweeping-local-state/SKILL.md` | Start local-state cleanup | Read `skills/team/references/external-data.md` |
| `skills/sweeping-local-state/references/procedure.md` | Validate and remove owned local state | Read `skills/team/references/external-data.md` |
| `skills/team-design/SKILL.md` | Dispatch design author and independent design review | Installed root, definition, and applicable resource paths through `15-host-dispatch.md` |
| `skills/team-implement/SKILL.md` | Dispatch test author, implementer, and independent reviewers | Installed root, definition, and applicable resource paths through `15-host-dispatch.md` |
| `skills/team-implement/references/03-execution.md` | Dispatch test author, implementer, and five reviewers | Read `skills/team/references/artifacts.md`. Supply installed root, definition, and applicable resource paths through `15-host-dispatch.md` |
| `skills/team-plan/SKILL.md` | Dispatch the tactical planner | Installed root, definition, and applicable resource paths through `15-host-dispatch.md` |
| `skills/team-pr/references/04-screenshot-upload.md` | Delegate authorized PR screenshot attachment | Read `skills/team/references/external-data.md` |
| `skills/team-question/SKILL.md` | Dispatch task/question decomposition | Installed root, definition, and applicable resource paths through `15-host-dispatch.md` |
| `skills/team-research/SKILL.md` | Dispatch isolated file finder and researcher | Installed root, definition, and applicable resource paths through `15-host-dispatch.md` |
| `skills/team-structure/SKILL.md` | Dispatch structure planner | Installed root, definition, and applicable resource paths through `15-host-dispatch.md` |
| `skills/team/references/03-the-phase-loop.md` | Dispatch the phase table and emit artifact frontmatter | Read `skills/team/references/artifacts.md`. Supply installed root, definition, and applicable resource paths through `15-host-dispatch.md` |
| `skills/team/references/08-design-review-gate-design.md` | Dispatch design review and record verdict artifacts | Read `skills/team/references/artifacts.md` and installed review-skill/brief paths |
| `skills/team/references/12-aggregate-gate-review-collection.md` | Collect independent reviews and record retry state | Read `skills/team/references/artifacts.md` |
| `skills/team/references/14-rules.md` | Enforce orchestrator artifact and authority rules | Read `skills/team/references/artifacts.md` |
| `skills/team/references/15-host-dispatch.md` | Resolve named, body-loaded, and standalone agents | Installed root, definition, and applicable resource paths through `15-host-dispatch.md` |
| `skills/team/references/artifacts.md` | Define artifact fields and conditional ownership | Read adjacent conditional-artifacts.md only for a conditional artifact |
| `skills/team/references/conditional-artifacts.md` | Define PRD and multi-repo artifact fields | Conditional template read from the installed schema directory |
| `skills/team/references/external-data.md` | Define shell boundaries for external data | Ordinary installed rules read before shell-consuming operations |

### Evaluation and catalog consumers

`tests/team-question.evals.ts`, `team-research.evals.ts`, `team-design.evals.ts`, `team-structure.evals.ts`, and `team-plan.evals.ts` inject explicit resources and remaining procedures.
`tests/code-reviewer.evals.ts` injects both resources alongside its existing review, finding, and comment procedures.
`tests/eng-design-doc-review.evals.ts` injects the design-review procedure, criteria, and artifact schema.
`tests/unslop.evals.ts` connects Question, both Research producers, standalone/full Research assembly, and parent fallback to the applicable schema.
Its bounded Question status/relay case receives artifact, shell, and prose rules without the full decomposition workflow.
Agent contexts include their installed definition paths.
Structure and Plan receive matching task authority before dispatch. Plan also receives the existing token-bucket research context.
Design review receives the unchanged planted excerpt on disk and its substituted artifact-directory argument.
Question omits inapplicable PRD and multi-repository templates. Research retains its recorded empty-source characterization and isolation.
The prose-only cases keep their existing inputs. Research-isolation assertions, case identities, ground truth, rubrics, and periodic tiers remain unchanged.

`evals/fixtures/{team-question,team-research,team-design,team-structure,team-plan,eng-design-doc-review,code-reviewer,unslop}/*/input.md` and `tests/helpers/touchfiles.ts` track those explicit files together.
`loadInstructionContext` remains the explicit byte loader. `loadAgentInstructionContext` supplies only the agent body and model, without recursive reference expansion.
The free prompt controls change resource bytes, remove resources, and capture the actual consuming callback at the session-runner boundary.
The free selection controls plant each resource path in both fixture and selector dependencies. Global changes and Git failures still select all cases.

Catalog checks reuse `skillNames`, `loadedSkills`, and `loadCatalog`. Active catalog entries omit both retired registrations.
Source line ceilings, description limits, and paid evaluation budgets remain unchanged.
The existing catalog ratchet lowers description/catalog ceilings to 10,800/16,300 characters for measured totals of 10,723/16,293.
Pre-existing protocol, cross-model, methodology, screenshot, and rebase assertions use the moved paths without weakening behavioral checks.

### Evidence boundaries

The coordinator reran the predecessor baseline: 2,625 passes, four skips, and zero failures.
Raw commands and streams remain under `.context/verification/m02-baseline/`.
Candidate command records retain exact arguments, status, duration, stdout, and stderr under `.context/verification/m02-implementation/`.
The [corrective verification report](verification/contract-resources.md) records current checks, input identities, locked blocks, and native limitations.
Correction evidence remains under `.context/verification/m02-review-fix/`. The coordinator owns signing and independent acceptance.
Claude/Codex installer fakes, Antigravity's native-shaped copy, and OpenCode adapter fixtures establish installed filesystem delivery.
Those fixtures do not establish native instruction consumption. Coordinator-owned native traces remain under `.context/verification/m02-native/`.
OpenCode initially guessed two wrong paths and continued. Later explicit-path controls read all resources and stopped on an intentionally missing resource.
Codex read the resources through explicit candidate paths. Claude loaded 13 agents, but inference failed with weekly-quota HTTP 429.
Antigravity lacked isolated authentication and timed out. These observations do not establish a general fail-fast guarantee.
Predecessor native-host availability records are not candidate evidence. Unavailable native and paid observations remain unverified.

## M03: shared principles

The catalog retains 25 commands and 40 methodologies, totaling 65 registrations, with 13 unchanged agent roles.
Twenty-four registrations move here. The shell rule already moved in M02. Versions and public command descriptions remain unchanged.
Five ordinary principle documents and four scoped references replace the original registrations without compatibility stubs.
Human-control rules preserve accepted pipeline intent and operation-specific approval approval conditions. Root-cause corrections remain within approved scope.

| Original registration | Full destination | Retained concrete rule | Named consumers |
| --- | --- | --- | --- |
| `principle-human-owns-the-ends` | `skills/team/principles/human-control.md` | Human build/ship decisions; autonomous Blocking/Major correction; eligible lower-tier PR notes; terminal blockers. | `skills/qrspi-workflow/SKILL.md`, `skills/review-severity-tiers/SKILL.md` |
| `principle-explicit-intent` | `skills/team/principles/human-control.md` | Named operations and targets; no state-inferred authority; retain entry guards and granted permission. | `skills/groom-backlog/SKILL.md`, `skills/groom-backlog/references/11-step-8-present-the-consequential-choices-and-wait.md`, `skills/pr-cleanup/SKILL.md`, `skills/pr-cleanup/references/10-mode-b-closed-abandoned.md`, `skills/pr-rebase/SKILL.md`, `skills/reflect/SKILL.md`, `skills/reflect/references/07-file-the-backlog-items.md`, `skills/shipit/SKILL.md`, `skills/team-fix/SKILL.md` |
| `principle-scope-fence` | `skills/team/principles/human-control.md` | Approved artifact and file-and-line scope; immutable acceptance; re-review material expansions. | `skills/implementing-slices/SKILL.md`, `skills/qrspi-workflow/SKILL.md`, `skills/test-first-development/SKILL.md`, `skills/test-first-development/references/procedure.md` |
| `principle-plan-present-wait` | `skills/team/principles/human-control.md` | Concrete output and undo before unanswered consequential choices; partial answers and operation-specific approval conditions. | `skills/groom-backlog/SKILL.md`, `skills/pr-open-comments/SKILL.md`, `skills/pr-open-comments/references/02-hard-rules.md`, `skills/reflect/SKILL.md`, `skills/reflect/references/06-apply-the-approved-skill-edits.md` |
| `principle-files-are-the-contract` | `skills/team/principles/durable-state.md` | Required artifacts before completion; path handoffs; durable recovery; append-only verdicts and logs. | `skills/qrspi-workflow/SKILL.md`, `skills/team/SKILL.md`, `skills/team/references/14-rules.md`, `skills/team/references/artifacts.md` |
| `principle-idempotent-reruns` | `skills/team/principles/durable-state.md` | Match before create; already-done convergence; re-read and report drift; serial mutations and backoff. | `skills/groom-backlog/SKILL.md`, `skills/groom-backlog/references/12-step-9-execute-in-dependency-order.md`, `skills/pr-cleanup/SKILL.md`, `skills/pr-cleanup/references/10-mode-b-closed-abandoned.md`, `skills/pr-watch-as-author/SKILL.md`, `skills/pr-watch-as-author/references/03-1-arm.md`, `skills/team-design/SKILL.md`, `skills/team/SKILL.md`, `skills/team/references/02-setup.md` |
| `principle-pre-image-first` | `skills/team/principles/durable-state.md` | Baseline and recovery anchor before destructive writes; cached bodies; UNKNOWN for unavailable baselines. | `skills/groom-backlog/SKILL.md`, `skills/groom-backlog/references/12-step-9-execute-in-dependency-order.md`, `skills/pr-rebase/SKILL.md`, `skills/pr-rebase/references/03-hard-rules.md`, `skills/reflect/SKILL.md`, `skills/reflect/references/06-apply-the-approved-skill-edits.md`, `skills/running-quality-checks/SKILL.md`, `skills/team-implement/references/03-execution.md`, `skills/team/references/11-mechanical-gate-test-confirmation.md` |
| `principle-single-source-of-truth` | `skills/team/principles/durable-state.md` | Named canonical schema/rule/constant; deterministic copy checks; authority beats summaries. | `skills/cross-model-review/SKILL.md`, `skills/cross-model-review/references/procedure.md`, `skills/qrspi-workflow/SKILL.md`, `skills/team/references/artifacts.md` |
| `principle-evidence-over-assertion` | `skills/team/principles/verified-results.md` | Observed command/file evidence; re-query resulting state; verify claims and lowest admitted dependency API. | `skills/groom-backlog/SKILL.md`, `skills/groom-backlog/references/13-step-10-verify-by-re-querying-never-by-memory.md`, `skills/pr-open-comments/SKILL.md`, `skills/pr-open-comments/references/02-hard-rules.md`, `skills/pr-screenshots/SKILL.md`, `skills/pr-verify/SKILL.md`, `skills/pr-verify/references/02-hard-rules.md`, `skills/researching-codebases/SKILL.md`, `skills/why/SKILL.md`, `skills/why/references/02-confidence-tiers.md` |
| `principle-mechanical-gates` | `skills/team/principles/verified-results.md` | Cheapest deterministic enforcement; early actionable failures; no model-dependent guarantee. | `skills/qrspi-workflow/SKILL.md`, `skills/test-first-development/SKILL.md`, `skills/test-first-development/references/procedure.md` |
| `principle-fail-closed` | `skills/team/principles/verified-results.md` | Unknown is unsupported; malformed/missing verdict retries once then halts; inconclusive refutations retain findings. | `skills/nested-agents/SKILL.md`, `skills/pr-screenshots/SKILL.md`, `skills/pr-screenshots/scripts/splice.mjs`, `skills/team-design/SKILL.md`, `skills/team-structure/SKILL.md`, `skills/team/SKILL.md`, `skills/team/references/08-design-review-gate-design.md` |
| `principle-skip-loudly` | `skills/team/principles/verified-results.md` | Named skipped/unavailable/degraded outcomes; nonempty report sections; omissions and leftover state. | `agents/code-reviewer.md`, `skills/cross-model-review/SKILL.md`, `skills/cross-model-review/references/procedure.md`, `skills/groom-backlog/SKILL.md`, `skills/groom-backlog/references/14-step-11-report-including-what-you-did-not-change.md`, `skills/pr-screenshots/SKILL.md`, `skills/reviewing-code/SKILL.md`, `skills/reviewing-code/references/review-manual.md`, `skills/sweeping-local-state/SKILL.md`, `skills/sweeping-local-state/references/procedure.md`, `skills/team/references/11-mechanical-gate-test-confirmation.md`, `skills/team/references/14-rules.md`, `skills/why/SKILL.md`, `skills/why/references/02-confidence-tiers.md` |
| `principle-generator-evaluator` | `skills/team/principles/independent-review.md` | Fresh independent evaluator; no producer narration; evaluators never edit; one fresh judge per claim. | `skills/eng-design-doc-review/SKILL.md`, `skills/how/SKILL.md`, `skills/how/references/04-critique-mode.md`, `skills/nested-agents/SKILL.md`, `skills/pr-watch-as-reviewer/SKILL.md`, `skills/pr-watch-as-reviewer/references/01-hard-rules.md`, `skills/reviewing-code/SKILL.md`, `skills/reviewing-code/references/review-manual.md`, `skills/team/references/15-host-dispatch.md` |
| `principle-blind-the-investigator` | `skills/team/principles/independent-review.md` | Neutral questions and repository context; rule-carrying neutral claims; intent leakage stops work. | `skills/decomposing-intent/SKILL.md`, `skills/nested-agents/SKILL.md`, `skills/qrspi-workflow/SKILL.md`, `skills/researching-codebases/SKILL.md`, `skills/why/SKILL.md`, `skills/why/references/03-execution.md` |
| `principle-least-privilege` | `skills/team/principles/independent-review.md` | Restricted reviewer tools and plan mode; vendor environment allowlists; disclose prompt-only fallback. | `skills/cross-model-review/SKILL.md`, `skills/cross-model-review/references/procedure.md`, `skills/eng-design-doc-review/SKILL.md`, `skills/pr-verify/SKILL.md`, `skills/pr-verify/references/04-execution.md`, `skills/reflect/SKILL.md`, `skills/reflect/references/04-the-lenses.md`, `skills/reviewing-code/SKILL.md`, `skills/reviewing-code/references/review-manual.md`, `skills/team/references/15-host-dispatch.md` |
| `principle-deep-agents-narrow-seams` | `skills/team/principles/focused-work.md` | Declared inputs and bounded outputs; dispatcher-owned persistence and routing; no further helper nesting. | `skills/nested-agents/SKILL.md`, `skills/team/SKILL.md`, `skills/team/references/05-where-a-phase-agent-s-output-lives.md` |
| `principle-subtract-before-you-add` | `skills/team/principles/focused-work.md` | Remove replaced content; no speculative guards/options; record out-of-scope removals. | `skills/authoring-designs/SKILL.md`, `skills/engineering-standards/SKILL.md`, `skills/implementing-slices/SKILL.md`, `skills/refactoring-to-patterns/SKILL.md` |
| `principle-optimization-never-dependency` | `skills/team/principles/focused-work.md` | Optional producer inline fallback; report unavailable uploads/vendor passes; never weaken required review. | `skills/cross-model-review/SKILL.md`, `skills/cross-model-review/references/procedure.md`, `skills/how/SKILL.md`, `skills/how/references/02-explain-mode.md`, `skills/nested-agents/SKILL.md`, `skills/pr-screenshots/SKILL.md`, `skills/pr-verify/SKILL.md`, `skills/pr-verify/references/04-execution.md`, `skills/reflect/SKILL.md`, `skills/reflect/references/04-the-lenses.md`, `skills/team-pr/SKILL.md`, `skills/team-pr/references/04-screenshot-upload.md`, `skills/why/SKILL.md`, `skills/why/references/03-execution.md` |
| `principle-bounded-loops` | `skills/team/references/execution.md` | Operation-owned caps; uncapped valid DESIGN/IMPLEMENT correction; existing output budgets; no silent truncation. | `skills/pr-watch-as-author/SKILL.md`, `skills/pr-watch-as-reviewer/SKILL.md`, `skills/pr-watch-as-reviewer/references/09-6-approve.md`, `skills/pr-watch-mechanics/SKILL.md` |
| `principle-non-blocking-waits` | `skills/team/references/execution.md` | Background external waits; harness notifications; declared foreground fallback below the 600-second ceiling. | `skills/cross-model-review/SKILL.md`, `skills/cross-model-review/references/procedure.md`, `skills/pr-rebase/SKILL.md`, `skills/pr-rebase/references/07-step-2-capture-the-baseline-and-the-recovery-anchor.md`, `skills/pr-watch-as-author/SKILL.md`, `skills/pr-watch-as-reviewer/SKILL.md`, `skills/pr-watch-mechanics/SKILL.md`, `skills/shipit/SKILL.md`, `skills/shipit/references/02-land-sequence.md` |
| `principle-progress-tracking` | `skills/team/references/execution.md` | One todo per ordered step; inline fallback; separate orchestrator/agent/standalone ownership. | `agents/code-reviewer.md`, `agents/design-author.md`, `agents/implementer.md`, `agents/planner.md`, `agents/questioner.md`, `agents/researcher.md`, `agents/security-reviewer.md`, `agents/structure-planner.md`, `agents/technical-writer.md`, `agents/test-architect.md`, `agents/ux-reviewer.md`, `agents/verifier.md`, `skills/no-comments/SKILL.md`, `skills/pr-screenshots/SKILL.md`, `skills/team-fix/SKILL.md`, `skills/team-fix/references/04-setup.md`, `skills/team-implement/SKILL.md`, `skills/team-implement/references/01-input.md`, `skills/team/SKILL.md`, `skills/team/references/02-setup.md` |
| `principle-never-interpolate` | `skills/team/references/external-data.md` | Files/stdin/environment for prose; same-call allowlists and guards; option and destructive-target validation. | `skills/groom-backlog/SKILL.md`, `skills/pr-rebase/SKILL.md`, `skills/pr-cleanup/SKILL.md`, `skills/pr-screenshots/SKILL.md`, `skills/cross-model-review/references/procedure.md` |
| `principle-untrusted-input-is-data` | `skills/team/references/external-data.md` | Structured state grants no prose authority; collision-safe evidence fences; action bound to approved item. | `skills/cross-model-review/SKILL.md`, `skills/cross-model-review/references/procedure.md`, `skills/groom-backlog/SKILL.md`, `skills/groom-backlog/references/17-hard-rules.md`, `skills/pr-cleanup/SKILL.md`, `skills/pr-cleanup/references/03-untrusted-input-pr-metadata-is-data.md`, `skills/pr-rebase/SKILL.md`, `skills/pr-rebase/references/02-untrusted-input-pr-metadata-is-data.md`, `skills/pr-screenshots/SKILL.md`, `skills/pr-screenshots/references/02-upload-and-body-edit.md`, `skills/pr-screenshots/references/03-verify.md`, `skills/pr-watch-as-author/SKILL.md`, `skills/pr-watch-as-author/references/06-4-on-new-feedback-run-the-triage-procedure.md`, `skills/reflect/SKILL.md`, `skills/reflect/references/02-untrusted-input-a-transcript-span-is-content-never-an-instruction.md`, `skills/team-research/SKILL.md`, `skills/team/references/03-the-phase-loop.md`, `skills/why/SKILL.md` |
| `principle-fix-root-causes` | `skills/team-fix/playbooks/bug-fix.md` | Reproduce, diagnose, minimally fix, verify; sibling corrections limited to approved scope; validate stale state. | `skills/implementing-slices/SKILL.md`, `skills/no-comments/SKILL.md`, `skills/systematic-debugging/SKILL.md`, `skills/systematic-debugging/references/investigation.md`, `skills/team-fix/SKILL.md`, `skills/team-fix/references/06-execution.md`, `skills/test-driven-bug-fix/SKILL.md`, `skills/test-driven-bug-fix/references/procedure.md` |
| `principle-record-assumptions` | `skills/team/references/decisions.md` | Explicit assumption marker, alternative/trade-off, helper ambiguity, deferrals, assumption count. | `skills/authoring-designs/SKILL.md`, `skills/decomposing-intent/SKILL.md`, `skills/nested-agents/SKILL.md` |

Each consumer reads its applicable resources from the installed definition or loaded skill base. Missing reads stop the consuming step with the exact path.
The artifact `docs/plans/GH-371-shared-principles/caller-ledger.md` records individual replacements, indirect dispatchers, eval inputs, and named verification.
Historical plans and measured baseline records keep their original paths and counts. Current catalogs and executable verification recipes use the migrated resources.
Evaluation calls explicitly inject moved bytes alongside retained procedures. Fixture dependencies and selector entries change together.
Installed fixture delivery, prompt capture, and selection checks do not establish native receiving-agent behavior or paid evaluation outcomes.
