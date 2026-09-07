---
name: pr-screenshots
description: 'Attaches local images to a PR body. Invoke ONLY on explicit intent: "add screenshots to a PR", "attach an image to a PR description", or "/pr-screenshots"; never infer it from images on disk.'
effort: medium
argument-hint: "[<pr-number-or-url>] [--entries <path>]"
---

# pr-screenshots — inline images in any PR body

Attach local image files to a pull request through GitHub's own attachment
pipeline, harvest the URLs it resolves, and write one `## Screenshots` section
into that PR's body. Any PR qualifies — open, draft, closed, or merged, in any
repository, with or without a local checkout and with or without a pipeline run
behind it.

The upload mechanics live here and nowhere else. `team-pr` decides whether to
run, when, and which entries qualify, then calls this skill.

## Hard rules

- **Upload first, write second.** Never fuse an attach flag with a body flag in
  one command. On a partial failure the host rewrites only the references that
  landed, which leaves a local filesystem path inside a body that may already
  be merged.
- **One body write per PR**, computed from the pre-image taken before the first
  attach and produced by `splice.mjs`. That single write also clears the tails
  the attach step appended.
- **Refuse before mutating, never after.** Every check that can run against the
  pre-image runs in step A, so a refusal always means nothing changed
  (`principle-fail-closed`).
- **Every caller-supplied string is data, not source and not markup.** A path,
  a caption, a note, and a failure reason each reach a command as one quoted
  `"$VAR"` expansion, and each is normalized by the same function before it
  renders into a body (`principle-never-interpolate`,
  `principle-untrusted-input-is-data`).
- **Nothing blocks, prompts, or retry-loops.** A capability gap, a failed
  entry, or a failed read-back degrades the result and says so
  (`principle-optimization-never-dependency`, `principle-skip-loudly`).
- **Never delete what you did not write.** A trailing run of stray image lines
  left by an earlier crash is reported and re-emitted below the new section,
  never removed. Anything else this skill did not write — an image inside the
  section, an HTML comment, a body shape the splice does not model — is a
  refusal that leaves the body byte-identical, because a duplicate is
  recoverable and a deletion is not.

## Procedure references

Read each reference completely when reaching that stage. Follow them in order;
later stages depend on state and gates established earlier. Seed one TodoWrite
item per numbered step of the reference you are in before starting it
(`principle-progress-tracking`).

1. [Input and result](references/01-input-and-result.md) — PR resolution, the
   entries file, caller-string normalization, `result.json`, every refusal.
2. [Upload and body edit](references/02-upload-and-body-edit.md) — the
   capability check, the four-step order, path validation, the attach loop, the
   lost-update guard, and the section's markdown shape.
3. [Verify](references/03-verify.md) — the rendered read-back, its assertions,
   and what a failure does.
4. [Rejected approaches](references/04-rejected-approaches.md) — read before
   improvising an alternative upload route.

## Applied principles

Load and apply: `principle-evidence-over-assertion`, `principle-fail-closed`,
`principle-never-interpolate`, `principle-optimization-never-dependency`,
`principle-progress-tracking`, `principle-skip-loudly`, and
`principle-untrusted-input-is-data`.
