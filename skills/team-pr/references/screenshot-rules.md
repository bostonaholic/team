Before this operation, read [external-data rules](../../team/references/external-data.md).
Before each consuming step, read its linked shared rules. Resolve links in this file from this file's own directory. `<team-pr-skill-dir>` is the absolute directory that holds the installed `skills/team-pr/SKILL.md`.
If a required read fails, stop that step and report its resolved path. Never use checkout fallback or recursive loading.

# Screenshot upload rules

Attach local image files to a pull request through GitHub's own attachment
pipeline, harvest the URLs it resolves, and write one `## Screenshots` section
into that PR's body.

The upload mechanics live in these references and `<team-pr-skill-dir>/scripts/`. [Screenshot Upload](04-screenshot-upload.md) decides whether to run, when, and which entries qualify.

**Every procedure with a loop, a branch, or a value a later step needs is a
committed script under `<team-pr-skill-dir>/scripts/`, run with its arguments and read by its exit
code.** Each reference below names the script its stage runs; what stays inline
is a single command.

## Hard rules

- **Upload first, write second.** Never fuse an attach flag with a body flag in
  one command: on a partial failure the host rewrites only the references that
  landed, which leaves a local filesystem path inside a body that may already
  be merged.
- **One body write per PR**, computed from the pre-image taken before the first
  attach and produced by `<team-pr-skill-dir>/scripts/splice.mjs`. That single write also clears the tails
  the attach step appended.
- **Refuse before mutating, never after.** Every check that can run against the
  pre-image runs in step A, including `<team-pr-skill-dir>/scripts/splice.mjs --check`, so a
  refusal it finds means nothing changed ([verified results rules](../../team/principles/verified-results.md)).
  What can only be computed after the upload is named, and lands on
  `uploaded-not-written` rather than on `refused`.
- **Every caller-supplied string is data, not source and not markup.** A path,
  a caption, a note, and a failure reason each reach a command as one quoted
  `"$VAR"` expansion, and each is normalized by the same function before it
  renders into a body ([external-data rules](../../team/references/external-data.md)).
- **Nothing blocks, prompts, or retry-loops.** A capability gap, a failed
  entry, or a failed read-back degrades the result and says so
  ([focused work rules](../../team/principles/focused-work.md), [verified results rules](../../team/principles/verified-results.md)).
- **Never delete what you did not write.** A trailing run of stray image lines
  left by an earlier crash is reported and re-emitted below the new section,
  never removed. Anything else this skill did not write is a refusal that
  leaves the body byte-identical, because a duplicate is recoverable and a
  deletion is not. The rule is stated positively, so nothing falls outside it:
  the only lines a replace may delete are the shapes this skill's own renderer
  emits — a `**caption**` line in the position the renderer puts one, an
  `![screenshot-NN]` image, a `> _note:_` note with its bare `>` separator, and
  a `Not uploaded:` line. **Ownership is provenance, not shape:** the note's
  `_note:_` marker and a caption's position directly above its own image mark
  this skill's lines, so a reviewer's own blockquote or bold line refuses rather
  than being read as this skill's output. Prose, an HTML comment, a raw HTML
  container, an image in any form the splice cannot count, or a body shape the
  splice does not model each refuse, with the offending line number named.
- **Shell variables do not persist between calls.** Every fence that creates
  a directory or resolves a path a later fence needs ends by printing it as
  `NAME=value`. Every later fence begins by re-binding each name it expands
  from those printed lines (`NAME='<printed NAME>'`), re-derives any path
  inside a re-bound directory, and re-reads what a script wrote there with its
  `cat` line. A value is pasted only inside single quotes, and a printed or
  supplied value that contains a single quote, a newline, `$`, or a backtick is
  refused, not pasted.
- **Nothing leaves the declared root, and nothing that is not an image is
  uploaded.** Every entry's path must resolve inside the entries file's one
  **absolute** top-level `root`, and acceptance is decided by **content type**,
  never by extension: `file -b --mime-type` must report `image/*`, and no type
  fails the check, because unverified is not an image.

## Procedure references

Read each reference completely when reaching that stage. Follow them in order;
later stages depend on state and gates established earlier. Seed one TodoWrite
item per numbered step of the reference you are in before starting it
([execution rules](../../team/references/execution.md)).

1. [Input and result](screenshot-input-and-result.md) — PR resolution, the
   entries file, caller-string normalization, `result.json`, every refusal.
2. [Upload and body edit](screenshot-upload-and-body-edit.md) — the
   capability check, the four-step order, path validation, the attach loop, the
   lost-update guard, and the section's markdown shape.
3. [Verify](screenshot-verify.md) — the rendered read-back, its assertions,
   and what a failure does.
4. [Rejected approaches](screenshot-rejected-approaches.md) — read before
   improvising an alternative upload route.

## Applied principles

Read and apply: [verified results rules](../../team/principles/verified-results.md),
[focused work rules](../../team/principles/focused-work.md),
[execution rules](../../team/references/execution.md), and
[external data rules](../../team/references/external-data.md).
