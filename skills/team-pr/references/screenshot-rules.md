Before this operation, read [external-data rules](../../team/references/external-data.md).
Before each consuming step, read its linked shared rules. Links resolve from this file's directory. `<team-pr-skill-dir>` is the absolute directory that holds the installed `skills/team-pr/SKILL.md`.
If a required read fails, stop that step and report its resolved path. Never use checkout fallback or recursive loading.

# Screenshot upload rules

Attach local images to a PR through GitHub's attachment pipeline, harvest the resolved URLs, and write one `## Screenshots` section into its body. [Screenshot Upload](04-screenshot-upload.md) decides whether and when to run.

Every loop, branch, or value a later step needs is a committed script under `<team-pr-skill-dir>/scripts/`, run with its arguments and read by its exit code; only single commands stay inline. Bare script names (`splice.mjs`, `upload.sh`, …) mean that directory.

## Hard rules

- **Upload first, write second.** Never fuse an attach flag with a body flag in one command: on a partial failure the host rewrites only the references that landed, leaving a local path in the body.
- **One body write per PR**, computed by `splice.mjs` from the pre-image taken before the first attach. That write also clears the tails the attach step appended.
- **Refuse before mutating, never after.** Every check that can run against the pre-image runs in step A, so a refusal there means nothing changed ([verified results rules](../../team/principles/verified-results.md)). What only the post-upload state can compute lands on `uploaded-not-written`, not `refused`.
- **Every caller-supplied string is data, not source and not markup.** A path, caption, note, or failure reason reaches a command as one quoted `"$VAR"` expansion and is normalized before it renders ([normalizing](screenshot-input-and-result.md#normalizing-caller-strings)).
- **Nothing blocks, prompts, or retry-loops.** A capability gap, a failed entry, or a failed read-back degrades the result and says so ([focused work rules](../../team/principles/focused-work.md)).
- **Never delete what you did not write.** Stray trailing image lines from an earlier crash are reported and re-emitted below the new section. A replace may delete only this skill's renderer output: a `**caption**` line in the renderer's position, an `![screenshot-NN]` image, a `> _note:_` note with its bare `>` separator, and a `Not uploaded:` line. `splice.mjs` refuses anything else, body byte-identical.
- **Shell variables do not persist between calls.** A fence whose directory or path a later fence needs prints it as `NAME=value`; each later fence re-binds what it expands (`NAME='<printed NAME>'`), re-derives paths inside it, and re-reads script outputs with their `cat` line. Paste values only inside single quotes; refuse a value containing a single quote, a newline, `$`, or a backtick. A line pasted into a quoted here-doc must not equal its end line.
- **Upload only through `upload.sh`.** It confines entries to the entries file's absolute `root` and accepts images by content type, never extension.

## Procedure references

Read each reference completely, in order. Seed one TodoWrite item per numbered step of the current reference before starting it ([execution rules](../../team/references/execution.md)).

1. [Input and result](screenshot-input-and-result.md) — PR resolution, the entries file, caller-string normalization, refusals, `result.json`.
2. [Upload and body edit](screenshot-upload-and-body-edit.md) — steps A to D and the section's markdown shape.
3. [Verify](screenshot-verify.md) — the rendered read-back and what a failure does.
4. [Rejected approaches](screenshot-rejected-approaches.md) — read before improvising an alternative upload route.

## Applied principles

Read and apply the [verified results](../../team/principles/verified-results.md), [focused work](../../team/principles/focused-work.md), [execution](../../team/references/execution.md), and [external data](../../team/references/external-data.md) rules.
