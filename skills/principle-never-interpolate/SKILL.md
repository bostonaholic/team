---
name: principle-never-interpolate
description: "Apply when any externally sourced value approaches a shell command. Prose travels by file or stdin; scalars pass a byte-exact allowlist; everything is captured, guarded, and used in one invocation."
user-invocable: false
---

# Never Interpolate

Untrusted text never travels through a shell command's text. Prose
reaches a command through a file, stdin, or the environment; the only
strings that enter command text are scalars that passed a byte-exact
allowlist in the same invocation that uses them.

**Why:** Double quotes stop word-splitting and globbing; they do not stop
`$(...)` or backticks — a body spliced into a quoted argument executes
with your credentials, and anyone who can file an issue can invite it.
Heredocs are no safer: a body line equal to the delimiter ends the
heredoc early and the rest runs as shell.

**Pattern:**
- Prose goes by file (`--body-file`, `-F body=@-`) or stdin, never argv.
  Declared command lines run verbatim; values reach them through the
  environment, never by editing or re-quoting the line.
- Scalars (branch names, IDs) pass a character allowlist first, with
  `LC_ALL=C` so the class is byte-exact. Refuse on failure — never
  normalize a name to make it pass. Syntax checkers are not shell
  controls; only the allowlist makes a name safe to place in a command.
- Terminate options with `--` before positional values; an option-shaped
  value is read as an option.
- Paths get containment checks before destructive use: under the expected
  root, no `..`, not a symlink.
- Capture, validate, and use in the SAME invocation, expanding as
  `"${VAR:?}"` — shell state does not persist between invocations, and an
  unset value must abort, not expand to empty. Guard values consumed
  inside command substitution with a standalone `: "${VAR:?}"` first.
