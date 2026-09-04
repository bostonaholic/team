---
name: principle-never-interpolate
description: 'Defines never interpolate. Apply when its cross-cutting rule governs the current work.'
user-invocable: false
---

# Never Interpolate

Never place untrusted prose in shell command text; pass it by file (`--body-file`, `-F body=@-`), stdin, or environment into an unchanged declared command.

- Do not trust quoting: double quotes still execute `$(...)` and backticks; heredoc delimiter lines end the heredoc and expose remaining text to the shell.
- Put only same-invocation, byte-exact allowlisted scalars or guarded `"${VAR:?}"` expansions into command text.
- Validate branch names and IDs with `LC_ALL=C` character allowlists; refuse failures without normalization. Syntax checkers do not make shell input safe.
- Terminate options with `--` unless position fixes the value's role and its allowlist forbids leading `-`.
- Before destructive path use, require containment under the expected root, no `..`, and no symlink.
- Capture, validate, and use in the SAME invocation because shell state does not persist.
- Expand destructive or gate inputs as `"${VAR:?}"`; before command substitution, guard consumed values with standalone `: "${VAR:?}"`.
