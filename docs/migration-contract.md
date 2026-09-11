# Migration contract: M01

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
| `agents/code-reviewer.md` | code-reviewer.md | skills/team/references/artifacts.md; skills/team/references/external-data.md |
| `agents/design-author.md` | design-author.md | skills/team/references/artifacts.md; skills/team/references/external-data.md |
| `agents/file-finder.md` | file-finder.md | skills/team/references/artifacts.md |
| `agents/planner.md` | planner.md | skills/team/references/artifacts.md |
| `agents/questioner.md` | questioner.md | skills/team/references/artifacts.md; skills/team/references/external-data.md |
| `agents/researcher.md` | researcher.md | skills/team/references/artifacts.md |
| `agents/structure-planner.md` | structure-planner.md | skills/team/references/artifacts.md |
| `opencode/team.js` | catalog/documentation/verification | existing skillNames / loadedSkills / loadCatalog; 89 registrations |
| `skills/authoring-designs/SKILL.md` | authoring-designs | skills/team/references/artifacts.md |
| `skills/cross-model-review/SKILL.md` | cross-model-review | skills/team/references/external-data.md |
| `skills/cross-model-review/references/procedure.md` | cross-model-review | skills/team/references/artifacts.md; skills/team/references/external-data.md |
| `skills/decomposing-intent/SKILL.md` | decomposing-intent | skills/team/references/artifacts.md; skills/team/references/external-data.md |
| `skills/decomposing-intent/references/multi-repo.md` | decomposing-intent | skills/team/references/artifacts.md |
| `skills/eng-design-doc-review/SKILL.md` | eng-design-doc-review | existing skillNames / loadedSkills / loadCatalog; 89 registrations |
| `skills/groom-backlog/SKILL.md` | groom-backlog | skills/team/references/external-data.md |
| `skills/groom-backlog/references/17-hard-rules.md` | groom-backlog | skills/team/references/external-data.md |
| `skills/pr-cleanup/SKILL.md` | pr-cleanup | skills/team/references/external-data.md |
| `skills/pr-cleanup/references/01-input.md` | pr-cleanup | skills/team/references/external-data.md |
| `skills/pr-cleanup/references/03-untrusted-input-pr-metadata-is-data.md` | pr-cleanup | skills/team/references/external-data.md |
| `skills/pr-rebase/SKILL.md` | pr-rebase | skills/team/references/external-data.md |
| `skills/pr-rebase/references/01-input.md` | pr-rebase | skills/team/references/external-data.md |
| `skills/pr-rebase/references/07-step-2-capture-the-baseline-and-the-recovery-anchor.md` | pr-rebase | skills/team/references/artifacts.md |
| `skills/pr-screenshots/SKILL.md` | pr-screenshots | skills/team/references/external-data.md |
| `skills/pr-screenshots/references/01-input-and-result.md` | pr-screenshots | skills/team/references/external-data.md |
| `skills/pr-screenshots/references/02-upload-and-body-edit.md` | pr-screenshots | skills/team/references/external-data.md |
| `skills/pr-screenshots/references/03-verify.md` | pr-screenshots | skills/team/references/external-data.md |
| `skills/pr-screenshots/scripts/write-companion.sh` | pr-screenshots | skills/team/references/external-data.md |
| `skills/qrspi-workflow/SKILL.md` | qrspi-workflow | skills/team/references/artifacts.md |
| `skills/sweeping-local-state/SKILL.md` | sweeping-local-state | skills/team/references/external-data.md |
| `skills/sweeping-local-state/references/procedure.md` | sweeping-local-state | skills/team/references/external-data.md |
| `skills/team-design/SKILL.md` | team-design | skills/team/references/artifacts.md |
| `skills/team-implement/SKILL.md` | team-implement | skills/team/references/artifacts.md |
| `skills/team-implement/references/03-execution.md` | team-implement | skills/team/references/artifacts.md |
| `skills/team-plan/SKILL.md` | team-plan | skills/team/references/artifacts.md |
| `skills/team-pr/references/04-screenshot-upload.md` | team-pr | skills/team/references/external-data.md |
| `skills/team-question/SKILL.md` | team-question | skills/team/references/artifacts.md; skills/team/references/external-data.md |
| `skills/team-research/SKILL.md` | team-research | skills/team/references/artifacts.md |
| `skills/team-structure/SKILL.md` | team-structure | skills/team/references/artifacts.md |
| `skills/team/references/03-the-phase-loop.md` | team | skills/team/references/artifacts.md |
| `skills/team/references/08-design-review-gate-design.md` | team | skills/team/references/artifacts.md |
| `skills/team/references/12-aggregate-gate-review-collection.md` | team | skills/team/references/artifacts.md |
| `skills/team/references/14-rules.md` | team | skills/team/references/artifacts.md |
| `skills/team/references/15-host-dispatch.md` | team | existing skillNames / loadedSkills / loadCatalog; 89 registrations |
| `skills/team/references/artifacts.md` | team | skills/team/references/artifacts.md |
| `skills/team/references/conditional-artifacts.md` | team | existing skillNames / loadedSkills / loadCatalog; 89 registrations |
| `skills/team/references/external-data.md` | team | existing skillNames / loadedSkills / loadCatalog; 89 registrations |

### Evaluation and catalog consumers

`tests/team-question.evals.ts`, `team-research.evals.ts`, `team-design.evals.ts`, `team-structure.evals.ts`, and `team-plan.evals.ts` inject explicit resources and remaining procedures.
`tests/code-reviewer.evals.ts` injects both resources alongside its existing review, finding, and comment procedures.
`tests/eng-design-doc-review.evals.ts` injects the design-review procedure, criteria, and artifact schema.
`tests/unslop.evals.ts` connects Question, both Research producers, standalone/full Research assembly, and parent fallback to the applicable schema.
Its Question case also receives the shell rules and remaining decomposition instructions. Agent contexts include their installed definition paths.
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

The supplied predecessor baseline has 2,625 passes, four skips, and zero failures. It was not repeated before the move.
Candidate command records retain exact arguments, status, duration, stdout, and stderr under `.context/verification/m02-implementation/`.
The producer report records candidate results and immutable acceptance-block digests; the coordinator binds them to a signed revision.
Claude/Codex installer fakes, Antigravity's native-shaped copy, and OpenCode adapter fixtures establish installed filesystem delivery.
Those fixtures do not establish native instruction consumption. The coordinator owns candidate native probes and their receiving-agent read traces.
Predecessor native-host availability records are not candidate evidence. Unavailable native and paid observations remain unverified.
