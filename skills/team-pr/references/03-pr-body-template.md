## PR Body Template

```
Closes #<n>

## Summary
[Observable change, effect, and reason in project terms]

## Design Decisions
[Conditional review-relevant tradeoff]

## Changes
[Conditional detail or representation that adds to Summary]

## Screenshots
[Conditional on UI impact; use the existing capture and upload rules]

## How to Verify
- [Command/action: observed result, scope, and limitations]

## Merge risk
[One-way door or two-way door: supporting facts and concrete recovery]

## Pre-merge
[Conditional merge requirements]

## References
- [Available, reviewer-accessible supporting references; omit unavailable artifacts]
```

### Explain the change

`## Summary` opens with the recommendation or the observable outcome — never a sentence describing the PR — then its effect and why it matters, in the project vocabulary gathered through [Input](01-input.md). Include Design Decisions only for a review-relevant tradeoff; omit Changes when it adds nothing beyond Summary.

Place a useful representation (pseudocode, call or component tree, shallow file tree, focused diff, state table, fenced Mermaid) beside its explanation in Changes or Design Decisions; omit one that only repeats the prose. Fence code and component syntax. No raw HTML, diagram uploads, or representations inside the uploader-owned Screenshots section.

### Evidence and recovery

Under How to Verify, one plain bullet per command or manual action: observed result, scope, and limitations. A bullet citing a test names the behavior it protects, never a test count, per the [value bar](../team/references/testing.md#value-bar). Include short decisive output or reliable evidence links when available. Distinguish completed, failed, skipped, timed-out, unavailable, and unrun checks. Never infer success from planned commands; state unrecoverable evidence gaps. Reuse available results rather than rerunning expensive checks. Exclude credentials, sensitive data, and irrelevant logs. Include only existing, reviewer-accessible references; never invent artifact links or reviewer findings.

Merge risk classifies the whole change (data, deployments, dependencies, external effects) by the one-way/two-way door definitions in [Decisions](../team/references/decisions.md#decision-method), with supporting facts and concrete recovery actions. A two-way door names the revert or redeploy action and why consequences stay contained. A one-way door names material consequences and what reversal cannot restore. If reversibility is unknown, use one-way door and name the missing fact. Put actual outstanding controls in Pre-merge once, with the responsible owner when known. This assessment grants no authority to run recovery, change gates, or merge.

**`## Pre-merge` (conditional):** only actions that must complete *before* this PR merges:
(a) a dependency PR that must merge (and sometimes deploy) first, as a checkbox with its full URL and a clause saying *why* the order matters;
(b) ordered operational steps the merge depends on, such as migrations;
(c) artifacts that could not be regenerated in the authoring environment and will fail a CI verify check until someone regenerates them;
(d) verification that genuinely gates the merge, including any a human must re-run (it goes here, not in `## How to Verify`), never verification that merely informs the reviewer.
Post-merge follow-ups do not belong here. **Omit the section entirely when empty — never emit a bare heading.**

**Checkbox discipline.** A `- [ ]` item blocks merge via the `square-task-list-completed` bot until ticked: use it only for pre-merge actions, plain `- ` bullets otherwise. Tick only items this run completed and verified itself, in the same turn; anything left for the user or a later step stays unchecked.

**Dependency direction (multi-repo).** Only the PR that has to wait carries the "merge/deploy X first" checkbox. The PR being waited on gets at most a plain bullet naming the deploy order. The waiting side is the one inert without the other (a UI that no-ops until its backend ships). When neither side is inert, emit no dependency item.

**Timing.** Open the PRs first. Add dependency items and `## Companion PRs` in the post-open edit once all URLs are known, closing line still first. `## Pre-merge` precedes `## Companion PRs`.

The `Closes` line has no heading: the body's first line, then one blank line, then `## Summary`. It stays first on every refresh and post-open edit. [Tracking rules](tracking.md) decide whether it renders, how `ticketId` is interpreted, and the multi-repo home-only closing rule. When it is omitted, drop its blank line too.

In multi-repo mode, each PR ends with `## Companion PRs` listing every other PR for the topic:

```
## Companion PRs
This change spans multiple repos. The companion PRs are:
- [<repo-name>] <pr-url>
- [<repo-name>] <pr-url>
```

### Screenshots section rendering

`## Screenshots` comes from Execution step 4's `manifest-entries.mjs` result:

- **A capture gap that recapture did not close, or a fault** → a one-line capture-failure note naming the `reason` (or the stderr line), nothing more. Never block or delay the PR over screenshots.
- **`render`** → one entry per entry in the entries file, plus each `notes` line.
- At open, render the pre-upload degraded form, whose wording lives only in [screenshot upload and body edit](screenshot-upload-and-body-edit.md#the-sections-markdown-shape). Never edit the section a second time from this skill (on a refresh with the UI unchanged, carry it through verbatim); the upload's single write replaces it ([Screenshot Upload](04-screenshot-upload.md#read-the-result)).
