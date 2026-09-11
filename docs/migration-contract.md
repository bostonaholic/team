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
