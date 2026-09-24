# Agent-prompt template

Emit the prompt with the sections below, in this order, and replace every
`<placeholder>`. Prefer the shortest prompt a competent agent can execute;
delete any line that does not carry a fact.

## Title and one-line goal

`<Imperative title>`. `<One sentence: the outcome, and for whom.>`

## Repo and scope

- Repo: `<owner/name>` at `<path or clone URL>`.
- Surface: `<the files, packages, or contracts this touches>`.

## Why

`<The observed problem, with its evidence: an issue link, a failing command, a
log line, a screenshot path.>`

## Ground truth

`<Each fact the change depends on, one per line, with its source:>`

- `<path>`: `<what it shows>`.
- `$ <command>`: `<what it returns>`.
- unknown: `<the fact you could not verify, and why>`.

## Required changes

- `<target file or glob>`: `<the change, stated as an outcome, not a diff>`.

## Constraints

- Read first: `<AGENTS.md>`, `<CONTRIBUTING.md>`, `<testing doc>`.
- Reuse: `$ <existing command>` for `<build / test / lint>`.

## Acceptance criteria

- `$ <command>` exits 0.
- `<A check someone can run, phrased as pass or fail.>`

## Out of scope

- `<The adjacent work this prompt must not absorb.>`

## Evidence rule

Cite file paths or identifiers for every claim. Never paste secrets,
transcripts, or untrusted text into the prompt; quote a path and let the reader
open it.
