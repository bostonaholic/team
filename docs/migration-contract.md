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
| `principle-pre-image-first` | `skills/team/principles/durable-state.md` | Baseline and recovery anchor before destructive writes; cached bodies; UNKNOWN for unavailable baselines. | `skills/groom-backlog/SKILL.md`, `skills/groom-backlog/references/12-step-9-execute-in-dependency-order.md`, `skills/pr-rebase/SKILL.md`, `skills/pr-rebase/references/03-hard-rules.md`, `skills/reflect/SKILL.md`, `skills/reflect/references/06-apply-the-approved-skill-edits.md`, `skills/team/playbooks/verify.md`, `skills/team-implement/references/03-execution.md`, `skills/team/references/11-mechanical-gate-test-confirmation.md` |
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

## M04: intent, research, and design procedures

The catalog retains 25 commands and 30 methodologies, totaling 55 registrations, with 13 unchanged agent roles.
Ten registrations move into three playbooks, five reference resources, and one shared dependency checklist. No compatibility stubs remain.
Standalone phase commands, neutral research inputs, researcher/file-finder return contracts, topic invariants, conditional PRD/repo artifacts, and the design-review gate retain their existing behavior.

| Retired registration | Destination | Retained contract |
| --- | --- | --- |
| `decomposing-intent` | `skills/team/playbooks/question.md` | Task/question decomposition, topic invariants, research isolation, multi-repo detection. |
| `product-requirements-doc` | `skills/team/playbooks/question.md`; `skills/team/references/prd-template.md` | Conditional `3-prd.md` criteria and section contract. |
| `researching-codebases` | `skills/team/playbooks/research.md` | Evidence-only findings, 60/100-line researcher return contract. |
| `finding-files` | `skills/team/playbooks/research.md` | Search strategies and 40/60-line file-finder return contract. |
| `authoring-designs` | `skills/team/playbooks/design.md`; `skills/team/references/design-template.md` | Repo-scope resolution, autonomous assumptions, design section contract. |
| `technical-design-doc` | `skills/team/references/design-template.md` | Edge-case categories, trade-offs, and rollout folded into one design template. |
| `decision-making` | `skills/team/references/decisions.md` | Reversibility/risk classification and the one-way-door scorecard. |
| `documenting-decisions` | `skills/team/references/decisions.md` | ADR format, file convention, and status lifecycle. |
| `product-thinking` | `question.md`, `design.md`, and the structure-planner body | Demand evidence, smallest-version, and slice-1-value lenses. |
| `systems-thinking` | `skills/team/references/dependencies.md` | Co-changing caller checks across Research, Design, Structure, Plan, Implement, and Review. |

`skills/team/references/multi-repo.md` and `question-templates.md` carry the multi-repo safety rules and the task/questions body templates.
The shared dependency checklist at `skills/team/references/dependencies.md` replaces the `systems-thinking` lens and its six role sections.
Structure, Plan, Implement, and Review surfaces read that checklist directly instead of preloading a skill; later milestones move their sections into the corresponding playbooks and review briefs.

### Named runtime consumers

| Consumer | Operation | Replacement |
| --- | --- | --- |
| `agents/questioner.md` | Decompose task and questions | Read `skills/team/playbooks/question.md` from the installed definition |
| `agents/researcher.md` | Answer neutral questions | Read `skills/team/playbooks/research.md` from the installed definition |
| `agents/file-finder.md` | Locate files | Read `skills/team/playbooks/research.md` from the installed definition |
| `agents/design-author.md` | Draft the design | Read `skills/team/playbooks/design.md` from the installed definition |
| `agents/structure-planner.md` | Slice the design | Inline product-need lens; read `skills/team/references/dependencies.md` |
| `agents/planner.md` | Write the tactical plan | Read `skills/team/references/dependencies.md` |
| `agents/implementer.md` | Execute slices | Read `skills/team/references/dependencies.md` |
| `agents/ux-reviewer.md` | Verify adjacent flows | Read `skills/team/references/dependencies.md` |
| `agents/code-reviewer.md` | Review System fit | Read `skills/team/references/dependencies.md` |
| `skills/team-question/SKILL.md` | Dispatch the questioner | Reference `question.md` and `prd-template.md` |
| `skills/reviewing-designs/SKILL.md` and `review-brief.md` | Review a design | Read `design-template.md` and `decisions.md` |
| `skills/nested-agents/SKILL.md` and `per-agent-dispatch.md` | Weigh a stated rule above precedent | Read `dependencies.md` |
| `skills/slicing-work/SKILL.md`, `skills/pr-open-comments/SKILL.md`, `skills/groom-backlog/references/11-*` | Resolve consequential choices | Read `decisions.md` |

The Question-to-Design eval fixtures (`team-question`, `team-research`, `team-design`, `eng-design-doc-review`) inject the playbook and reference bytes alongside the retained principles and review briefs.
Installer fixtures sample `skills/team/playbooks/design.md` and `skills/team/references/design-template.md` for nested-resource delivery.
Catalog description and catalog-line budgets ratchet from 8,200/11,800 to 7,000/10,000 characters after the ten registrations move.

## M05: planning, implementation, and bug-fix procedures

The catalog retains 25 commands and 22 methodologies, totaling 47 registrations, with 13 unchanged agent roles.
Eight registrations move into four playbooks, two bug-fix resources, and one test-quality reference. No compatibility stubs remain.
`7-structure.md` and `8-plan.md` ownership, acceptance-test immutability, assertion-only Red gates, the behavior-preserving refactor exception, bug classification, minimal-fix scope, mutation checks, and the two-commit rule retain their existing behavior. Both planning agents remain separate.

| Retired registration | Destination | Retained contract |
| --- | --- | --- |
| `qrspi-workflow` | `skills/team/playbooks/feature.md` | Phase sequence, gates, state transitions, multi-repo and PRD pointers, and scope/sequencing rules. |
| `slicing-work` | `skills/team/playbooks/structure.md`; `skills/team/references/structure-template.md` | Vertical-slice contract, verification checkpoints, and the exact `7-structure.md` template. |
| `planning-implementation` | `skills/team/playbooks/plan.md` | `8-plan.md` template and tactical rules. |
| `implementing-slices` | `skills/team/playbooks/implement.md` | Test-author and implementer contracts, dispatch modes, slice execution, and blockers. |
| `test-first-development` | `skills/team/playbooks/implement.md` | Immutable acceptance tests, assertion-only Red gate, static checks, and the two test levels. |
| `systematic-debugging` | `skills/team-fix/references/diagnosis.md`; `skills/team-fix/playbooks/bug-fix.md` | OBSERVE→HYPOTHESIZE→TEST→CONCLUDE, 5 Whys, and escalation rules. |
| `test-driven-bug-fix` | `skills/team-fix/playbooks/bug-fix.md` | Triage buckets, reproduce-red-green-verify, mutation check, and the two atomic commits. |
| `test-style` | `skills/team/references/testing.md` | Deterministic-input rules, audit checklist, flaky-test red flags, and the time-bomb example pair. |

### Named runtime consumers

| Consumer | Operation | Replacement |
| --- | --- | --- |
| `agents/implementer.md` | Execute slices | Read `skills/team/playbooks/implement.md` |
| `agents/test-architect.md` | Author the acceptance suite | Read `skills/team/playbooks/implement.md` and `skills/team/references/testing.md` |
| `agents/structure-planner.md` | Slice the design | Read `skills/team/playbooks/structure.md` |
| `agents/planner.md` | Write the tactical plan | Read `skills/team/playbooks/plan.md` |
| `agents/code-reviewer.md` | Review test files | Read `skills/team/references/testing.md` |
| `skills/reviewing-code/SKILL.md` and `review-manual.md` | Apply test-quality and flaky-red-flag regimes | Read `skills/team/references/testing.md` |
| `skills/team-fix/references/06-execution.md` | Drive reproduce-red-green-verify | Read `skills/team-fix/playbooks/bug-fix.md` and `skills/team-fix/references/diagnosis.md` |
| `skills/why/references/05-rules.md` | Hand off a failure investigation | Read `skills/team-fix/references/diagnosis.md` |
| `skills/team/references/artifacts.md`, `08-design-review-gate-design.md`, `execution.md` | Resolve phase behavior and verdict convention | Read `skills/team/playbooks/feature.md` |
| `skills/team-question/SKILL.md`, `skills/team-worktree/references/02-detect-mode.md` | Resolve the multi-repo schema | Read `skills/team/playbooks/feature.md` |

The Structure, Plan, Implement, and bug-fix eval fixtures inject the playbook and reference bytes alongside retained principles and dependencies.
Catalog description and catalog-line budgets ratchet again after the eight registrations move.

## M06: reviewer briefs and finding contracts

The catalog retains 25 commands and 15 methodologies, totaling 40 registrations, with 13 unchanged agent roles.
Seven registrations move into six per-entry-point reference files. No compatibility stubs remain.
Security, code, documentation, design, and comment review stay distinct; verdict formats, the report shape, gate types, severity tiers, and aggregation semantics are preserved.
`conventional-comments` and `review-severity-tiers` consolidate into one shared finding-format reference read by both producers and reviewers.

| Retired registration | Destination | Retained contract |
| --- | --- | --- |
| `reviewing-code` | `skills/code-review/references/code-reviewer.md` | Generator-evaluator separation, veto-without-authorship, the `## Report Format` shape, verdict criteria, the inspection contract, and the test/comment red-flag regimes. |
| `reviewing-security` | `skills/code-review/references/security-reviewer.md` | Attack-surface identification, OWASP Top 10, extra vulnerability checks, and the CRITICAL/HIGH/MEDIUM/LOW ladder. |
| `reviewing-documentation` | `skills/code-review/references/documentation-reviewer.md` | Documentation-gap review process and REQUIRED/RECOMMENDED classification. |
| `conventional-comments` | `skills/code-review/references/findings.md` | Finding labels and decorations (issue/suggestion/nitpick). |
| `review-severity-tiers` | `skills/code-review/references/findings.md` | Gate types by reviewer, the Blocking/Major/Minor tiers, the auto-fix boundary, and aggregation rules. |
| `reviewing-designs` | `skills/eng-design-doc-review/references/design-reviewer.md` | The design-review brief, review process, calibration, verdict set, and brief rules. |
| `reviewing-comments` | `skills/no-comments/references/reviewer.md` | Fresh-context comment classification and the REMOVE/KEEP/ENCODE vocabulary. |

### Named runtime consumers

| Consumer | Operation | Replacement |
| --- | --- | --- |
| `agents/code-reviewer.md` | Review a diff | Read `skills/code-review/references/code-reviewer.md` and `findings.md` |
| `agents/security-reviewer.md` | Review for vulnerabilities | Read `skills/code-review/references/security-reviewer.md`, `code-reviewer.md`, and `findings.md` |
| `agents/technical-writer.md` | Review documentation gaps | Read `skills/code-review/references/documentation-reviewer.md`, `code-reviewer.md`, and `findings.md` |
| `agents/ux-reviewer.md` | Verify the experience | Read `skills/code-review/references/code-reviewer.md` and `findings.md` |
| `skills/code-review/SKILL.md` | Dispatch a code reviewer | Read `references/code-reviewer.md` |
| `skills/eng-design-doc-review/SKILL.md` | Dispatch the design reviewer | Read `references/design-reviewer.md` |
| `skills/no-comments/SKILL.md` | Dispatch the comment reviewer | Read `references/reviewer.md` |
| `skills/team/SKILL.md`, `team-design/SKILL.md`, `team/references/08-design-review-gate-design.md` | Run the design-review gate | Read `skills/eng-design-doc-review/references/design-reviewer.md` |
| `skills/team/SKILL.md`, `team-implement/SKILL.md`, `team-implement/references/03-execution.md`, `team/references/12-aggregate-gate-review-collection.md`, `team/playbooks/feature.md` | Aggregate review verdicts | Read `skills/code-review/references/findings.md` |
| `skills/cross-model-review/SKILL.md` and `references/procedure.md` | Position the disposition block and the auto-fix boundary | Read `skills/code-review/references/code-reviewer.md` and `findings.md` |
| `skills/engineering-standards/SKILL.md`, `writing-prose/SKILL.md`, `writing-prose/references/style-guide.md`, `pr-watch-as-reviewer/references/07-4-poll.md` | Format findings | Read `skills/code-review/references/findings.md` and `documentation-reviewer.md` |

The reviewer agents drop their review preloads and read the briefs from the installed plugin. The code-reviewer, eng-design-doc-review, and unslop eval fixtures inject the new reference bytes instead of the retired skill bodies.
Catalog description and catalog-line budgets ratchet again after the seven registrations move.

## M07: delivery, worktree, and agent execution contracts

The catalog retains 25 commands and 7 methodologies, totaling 32 registrations, with 13 unchanged agent roles.
Eight registrations move into six per-entry-point references, two playbooks, and two team references. No compatibility stubs remain.
Worktree creation/validation/recovery/teardown, machine-local teardown, commit signing and Conventional Commit rules, changelog filtering, tracker pickup/link/in-review/merge semantics, watch-loop bounds, cross-model review, and nested-agent dispatch retain their existing behavior.

| Retired registration | Destination | Retained contract |
| --- | --- | --- |
| `worktree-isolation` | `skills/team-worktree/playbooks/worktree.md` | Creation, validation, recovery, worktree reuse, the residue sweep, and explicit cleanup ownership. |
| `sweeping-local-state` | `skills/pr-cleanup/playbooks/cleanup.md` | `.teamteardown` default-branch read, verbatim line execution, temp-path guards, and shared-resource/deletion safeguards. |
| `git-commit` | `skills/team-pr/references/commit.md` | Conventional Commit subjects, 50/72, atomic commits, and signing rules. |
| `changelog` | `skills/team-pr/references/changelog.md` | Keep a Changelog structure, baseline/filter, absolute URLs, and draft-status rules. |
| `tracking-tickets` | `skills/team-pr/references/tracking.md` | Pickup/in-progress, PR linking, in-review-only-when-ready, and home-only closing semantics. |
| `pr-watch-mechanics` | `skills/pr-watch-as-author/references/watch-loop.md` | Cycle timing, the 3-cycle soft cap, handoff, and the three loop stop conditions. |
| `cross-model-review` | `skills/team/references/cross-model-review.md`; `external-review.mjs`; `prompt-template-code-review.md`; `prompt-template-design-review.md` | Vendor adapters, credential isolation, caps, courier dispatch, and inline producer fallback. |
| `nested-agents` | `skills/team/references/agent-dispatch.md`; `supports-nesting.mjs`; `supports-nesting.d.mts` | Version gate, read-only helpers, caps, neutral claims, and supported nesting behavior. |

The bundled scripts and vendor adapters (`external-review.mjs`, `supports-nesting.mjs`, and the role-named prompt templates) are preserved at their new locations; no verified replacement made them redundant.

### Named runtime consumers

| Consumer | Operation | Replacement |
| --- | --- | --- |
| `agents/code-reviewer.md` | Run cross-model and skeptic passes | Read `skills/team/references/cross-model-review.md` and `agent-dispatch.md`; drop `cross-model-review` and `nested-agents` preloads |
| `agents/implementer.md` | Dispatch read-only scouts | Read `skills/team/references/agent-dispatch.md`; drop `nested-agents` preload |
| `agents/researcher.md` | Fan out exploration scouts | Read `skills/team/references/agent-dispatch.md`; drop `nested-agents` preload |
| `agents/security-reviewer.md` | Run skeptic passes | Read `skills/team/references/agent-dispatch.md`; drop `nested-agents` preload |
| `skills/team/SKILL.md` | Setup, design review, PR gate | Read `tracking.md`, `changelog.md`, `cross-model-review.md`, and `worktree.md` |
| `skills/team-fix/*` | Setup, worktree, ship | Read `tracking.md` and `worktree.md` |
| `skills/team-pr/*` | Commit, changelog, tracking, teardown | Read `commit.md`, `changelog.md`, `tracking.md`, and `worktree.md` |
| `skills/pr-watch-as-author/*` and `pr-watch-as-reviewer/*` | Bound the watch loop | Read `watch-loop.md` |
| `skills/eng-design-doc-review/*`, `team-design/*`, `team/references/08-*` | Run the design cross-model pass | Read `cross-model-review.md` |
| `skills/code-review/references/code-reviewer.md` | Place the disposition block | Read `cross-model-review.md` |
| `skills/pr-verify/*`, `reflect/*` | Inline nested fallback | Read `agent-dispatch.md` |

The four nested-dispatch agents drop their `nested-agents` preloads and read `agent-dispatch.md` from the installed plugin; `code-reviewer` additionally drops `cross-model-review` and reads `cross-model-review.md`. The git-commit and changelog eval fixtures keep their names but list the new reference paths in `deps`; the unslop and team-fix fixtures do the same for `cross-model-review`, `nested-agents`, and `tracking-tickets`.
Catalog description and catalog-line budgets ratchet again after the eight registrations move.

## M08: coding and writing references

The catalog retains 25 commands and 2 methodologies, totaling 27 registrations, with 13 unchanged agent roles.
Five registrations consolidate into two ordinary references plus the preserved prose linter. No compatibility stubs remain.
Comment, scope, and error-handling constraints are stated once; exact-text and normative-meaning protection precede prose style.

| Retired registration | Destination | Retained contract |
| --- | --- | --- |
| `engineering-standards` | `skills/team/references/code-standards.md` | Core philosophy, the Code Comments rule set, the design-first workflow, the quality checklist, the "Construct with collaborators, call with work" constructor rule, explicit error handling, scope discipline, and the "When Reviewing" criteria. |
| `solid` | `skills/team/references/code-standards.md` | The five SOLID principles and the reviewer's name-principle-cite-consequence rule. |
| `refactoring-to-patterns` | `skills/team/references/code-standards.md` | Rule of Three timing, the safe refactoring procedure, and the refactor-first-own-commit rule. The smell catalog was deleted. |
| `unslop` | `skills/team/references/writing.md` | Exact-text protection, normative-meaning preservation, the compose-order procedure, and the six rule groups (claims, directness, concrete subject, format, mannerisms, rewrite pass). |
| `writing-prose` | `skills/team/references/writing.md`; `skills/team/references/ste-lint.mjs` | Plain language, the two modes (strict / STE-flavored), the STE mechanical rules and word substitutions, the delete list, the self-lint checklist, one busy reader, documentation-quality assessment, and the prose linter. |

The `ste-lint.mjs` script moves to `skills/team/references/ste-lint.mjs` and keeps running unchanged: no relative import, no environment read for its own location, and a `<skill-dir>` placeholder in the documented command.
Every agent and entry point reads `writing.md` before finalizing prose; the planner, implementer, and code-reviewer read `code-standards.md`. The prose preloads are removed.

### Measurement

The five moved registrations held 4,908 whitespace-delimited words across seven Markdown files.
The two replacements hold 3,301 words, a 1,607-word (33%) reduction across all moved resources, not only the `SKILL.md` bodies.
`ste-lint.mjs` moves byte-for-byte with only its internal self-references updated, so it is excluded from the prose count.

### Named runtime consumers

| Consumer | Operation | Replacement |
| --- | --- | --- |
| `agents/planner.md` | Plan against the quality checklist | Read `skills/team/references/code-standards.md` |
| `agents/implementer.md` | Apply comment discipline, SOLID, and refactoring rules | Read `skills/team/references/code-standards.md` |
| `agents/code-reviewer.md` | Review comments, SOLID, and the When Reviewing criteria | Read `skills/team/references/code-standards.md` |
| `skills/code-review/references/code-reviewer.md` | Comment red flags and SOLID findings | Read `code-standards.md` and `writing.md` |
| `skills/eng-design-doc-review/references/design-reviewer.md` | Design lens and finding prose | Read `code-standards.md` and `writing.md` |
| `skills/no-comments/references/reviewer.md` | Comment classification | Read `code-standards.md` |
| Every agent and entry point | Author prose | Read `skills/team/references/writing.md` |
| `skills/team/references/agent-dispatch.md` | Helper prose audit | Read `writing.md` |

Catalog description and catalog-line budgets ratchet again after the five registrations move.

## M09: reusable verification

The catalog retains 25 commands and 0 methodologies, totaling 25 registrations, with 13 unchanged agent roles.
Two registrations move into the shared verify playbook and the ux reviewer brief. No compatibility stubs remain.
Verification is now claim-specific: a library runs a real consumer, a CLI checks invocation and filesystem effects, a service checks requests and state, and UI interaction drives the app as a user. Evidence records name revision, environment, action, expected and observed outcome, and output location; unavailable tools are reported UNKNOWN, never passed.

| Retired registration | Destination | Retained contract |
| --- | --- | --- |
| `running-quality-checks` | `skills/team/playbooks/verify.md` | Check detection, speed-order execution, PASS/FAIL/UNKNOWN verdicts, no-fix and no-retry-mask rules, baseline-under-same-isolation, coverage reported not gated. Extended with surface selection (library, CLI, service, UI), the capability index, evidence recording, and the three-failure separation (documentation drift, harness defect, product regression). |
| `verifying-ux` | `skills/code-review/references/ux-reviewer.md` | Project-type detection (UI, API, CLI, library), boot-and-verify steps, screenshot capture and manifest, cleanup and caps. Library and CLI cases now receive consumer/invocation verification rather than a "not applicable" skip, with no screenshot requirement. |

The capability index lives in `docs/verification/`: invocation, prerequisites, expected behavior, evidence, and cleanup per capability, starting with the affected capabilities rather than a full catalog.

### Named runtime consumers

| Consumer | Operation | Replacement |
| --- | --- | --- |
| `agents/verifier.md` | Detect and run configured checks | Read `skills/team/playbooks/verify.md`; drop `running-quality-checks` preload |
| `agents/ux-reviewer.md` | Boot and verify the app live | Read `skills/code-review/references/ux-reviewer.md`; drop `verifying-ux` preload |
| `skills/team-implement/references/03-execution.md` | Mechanical gate static checks | Read `team/playbooks/verify.md` |
| `skills/team/references/11-mechanical-gate-test-confirmation.md` | Static-check gate | Read `playbooks/verify.md` |
| `skills/pr-verify/references/04-execution.md` | Build/test strategy | Read `team/playbooks/verify.md` |
| `skills/no-comments/SKILL.md` | Post-edit check run | Read `team/playbooks/verify.md` |
| `skills/reflect/references/06-apply-the-approved-skill-edits.md` | Post-write check run | Read `team/playbooks/verify.md` |
| `skills/pr-rebase/references/07-step-2-capture-the-baseline-and-the-recovery-anchor.md` | Baseline checks | Read `team/playbooks/verify.md` |
| `skills/team-pr/references/02-execution.md` | Re-capture on UI-changing push | Read `code-review/references/ux-reviewer.md` |

The verifier and ux-reviewer agents drop their `skills:` preloads and read the playbook and brief by installed path.
Catalog description and catalog-line budgets ratchet again after the two registrations move.

## M10: task routes with durable scope and recovery

The catalog retains 25 commands and 0 methodologies, totaling 25 registrations, with 13 unchanged agent roles. No registration is added or removed.
`/team` gains six leading-argument routes selected only from the first whitespace-separated token of the invocation: `investigate`, `plan`, and `prototype` stop at their deliverable with no commit, push, or PR; `feature`, `fix`, and `refactor` run their full pipeline to a draft PR. An unprefixed `/team <description>` keeps the existing full feature behavior, and the standalone `/team-*` phase commands keep their existing meaning.

| Change | Contract |
| --- | --- |
| `skills/team/references/routing.md` (new) | Route recognition from the leading argument only; the route table mapping each route to an existing playbook and stopping point; missing-task and incidental-word rules; limited-scope forbidden effects; continuation rules. |
| `skills/team/references/artifacts.md` | `1-task.md` gains `route` and `routeStatus` (additive). `route` records the selected route before dispatch; `routeStatus: complete` marks a finished limited-scope route. Neither appears on `2-questions.md`. |
| `hooks/session-start-recover.mjs`, `hooks/pre-compact-anchor.mjs` | Read `route` from `1-task.md`. For a limited-scope route, report completion or in-progress and never enter the feature phase table, so a finished plan is not read as permission to implement. Missing `route` metadata grants no new effect: it falls through to the existing phase inference. |
| `skills/team/SKILL.md`, `references/01-input.md`, `references/02-setup.md` | Route selection precedes worktree setup. Limited-scope routes write artifacts in place and create no production worktree. |

### Named consumers

| Consumer | Operation | Change |
| --- | --- | --- |
| `skills/team/SKILL.md` | Select the route and stop condition | Read `references/routing.md` before setup |
| `skills/team/references/01-input.md` | Recognize the leading-argument route | Read `routing.md` before resolving the description |
| `skills/team/references/02-setup.md` | Select the route before worktree setup | Limited-scope routes skip the WORKTREE phase |
| `skills/team/references/artifacts.md` | Define the route schema | `route` and `routeStatus` on `1-task.md` |
| `hooks/session-start-recover.mjs`, `hooks/pre-compact-anchor.mjs` | Report limited-scope completion instead of implementation | Read `route` and `routeStatus` |

Recovery for pre-migration artifacts is unchanged: a topic with no `route` metadata resumes through the existing phase table, and the existing recovery tests (pipeline-recovery) pass without route metadata. The new route recovery cases prove a completed `plan`/`investigate`/`prototype` is reported complete, never as IMPLEMENT.

## M11: design review grounded in caller examples

The design playbook and template add `## Caller examples`, `## Interface`, and
`## Experiments`; the design reviewer brief distinguishes supported defects from
plausible unresolved risks and speculative requirements. The catalog count is
unchanged at 25 registrations with 13 agent roles.

## M12: preparation handoffs measurement

The catalog retains 25 commands and 0 methodologies, totaling 25 registrations,
with 13 unchanged agent roles. No registration is added or removed.

Matched-case measurement compared the current two-producer Structure-to-Plan
flow with one producer writing both artifacts, and the current parallel
file-finder/researcher RESEARCH dispatch with one producer doing both. The
measured decision is a keep-existing result: neither merge demonstrates a
simplification that preserves intent validation, research isolation, and
independent downstream review. The Structure/Plan merge saves ~31% cost through
prompt-cache reuse but collapses the PLAN phase's fresh-context revalidation of
planned actions against `1-task.md` and changes recovery, the phase table, and
the registry. The file-finder merge removes the cheap parallel mechanical search
(haiku, 20 search calls) that the opus researcher does not replicate, and
serializes a dispatch the phase table runs in parallel. The 13 roles, the
STRUCTURE/PLAN split, and the parallel RESEARCH dispatch are retained.

Full matched-case results, methodology, and limits live in
[the handoffs record](verification/handoffs.md). The catalog count and the
13-agent invariant remain enforced by `tests/architecture.test.ts`,
`tests/thin-agents.test.ts`, and the registry-sync hook; no new tripwire was
needed because the keep-existing decision adds no runtime change.

## M13: complete migration validation

The catalog retains 25 commands and 0 methodologies, totaling 25 registrations,
with 13 unchanged agent roles and zero justified exceptions. The final catalog
is the parent brief's 25-entry-point list with no forced count and no capability
demoted past its entry-point contract.

The [compatibility report](verification/compatibility.md) records the closing
recount, the 66-name leftover audit, and the measured outcome against the M01
baseline. The [final inventory](verification/baselines/m13.json) is committed
beside the initial inventory for direct comparison. Key results:

- **Registrations 91 → 25 (−72.5%).** Entry/methodology/principle split moves
  from 25/41/25 to 25/0/0. Codex manifests and OpenCode commands each drop 91 →
  25.
- **Always-loaded surface falls.** Root `SKILL.md` words 30,722 → 11,604
  (−62%); declared preloads 68 → 0.
- **Total instruction words fall 5.8%** (127,433 → 120,042). The migration
  moved text more than it deleted text: the 66 retired `SKILL.md` bodies became
  ordinary resources read by path, so the word total barely moves while the
  load surface collapses. Agent bodies grew 10.7% because one-consumer
  instructions moved inline.
- **No leftovers.** No retired directory, dangling load, preload, or accidental
  manifest registration remains. All 17 non-manifest resources were preserved;
  the three moved scripts run byte-identical from `skills/team/references/`.
- **Free suite green.** `bun test` reports 2876 pass / 4 skip / 0 fail;
  typecheck, discovery consistency, and the focused route/recovery/gate suites
  all pass.

The unresolved evidence is explicit: paid evaluations (no
`EVALS_ANTHROPIC_API_KEY`), native live-host instruction use, and the external
Golden Master run remain unavailable rather than passed. The Golden Master
frozen prompt and files are unchanged; the runbook reconciliation stays at M01.
