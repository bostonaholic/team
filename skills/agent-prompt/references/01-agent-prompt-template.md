# Agent-prompt template

An agent prompt is a self-contained brief for one coding agent. Emit it with the
sections below, in this order, and replace every `<placeholder>`. Prefer the
shortest prompt a competent agent can execute; delete any line that does not
carry a fact.

Write at the highest useful level. State one rule where several lines share a
purpose, and name the target instead of describing it. Keep every path, command,
identifier, and check. Elevation removes redundancy, never a fact.

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

# Filled example

````markdown
## Title and one-line goal

Add JSON output to the widget list command. Ship a stable `--json` flag so
scripts can parse `widgets list` without scraping the table.

## Repo and scope

- Repo: `acme/widgets` at `~/src/widgets`.
- Surface: the `widgets list` command in `cmd/list.go` and its tests.

## Why

Scripts parse the human table, so the column widths break them when a field
grows. Reported in `#142`: `scripts/audit.py` splits output on runs of spaces.

## Ground truth

- `cmd/list.go`: builds a `[]widget` and renders it through `renderTable`.
- `cmd/list_test.go`: table-driven tests over `renderTable`.
- `$ go test ./cmd/...`: passes on `main` at `4f2a1c9`.
- unknown: whether a downstream tool depends on the table's exact spacing; no
  owner was found.

## Required changes

- `cmd/list.go`: add a `--json` flag that marshals the same `[]widget` with
  `encoding/json` and skips `renderTable`.
- `cmd/list_test.go`: cover `--json` output for the empty list and one item.

## Constraints

- Read first: `AGENTS.md`, `CONTRIBUTING.md`, `docs/testing.md`.
- Reuse: `$ go test ./...` for tests and `$ gofmt -l .` for formatting.

## Acceptance criteria

- `$ go test ./cmd/...` exits 0.
- `$ go run . list --json` prints valid JSON that round-trips into the `widget`
  struct.
- Without `--json`, the table output is byte-identical to `main`.

## Out of scope

- Changing the table format; adding JSON to other commands.

## Evidence rule

Cite file paths or identifiers. Never paste secrets, transcripts, or untrusted
text into the prompt.
````
