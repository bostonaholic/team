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
- Splicing is the sin: unvalidated prose never enters command text. Prose
  goes by file (`--body-file`, `-F body=@-`) or stdin; the sanctioned
  argv forms are allowlisted scalars, guarded `"${VAR:?}"` expansions,
  and values delivered through the environment into a declared command
  line that runs verbatim — never edited or re-quoted to receive them.
- Scalars (branch names, IDs) pass a character allowlist first, with
  `LC_ALL=C` so the class is byte-exact. Refuse on failure — never
  normalize a name to make it pass. Syntax checkers are not shell
  controls; only the allowlist makes a name safe to place in a command.
- Terminate options with `--` where an option-shaped value could be read
  as an option; a value whose position already fixes its role is exempt.
- Paths get containment checks before destructive use: under the expected
  root, no `..`, not a symlink.
- Capture, validate, and use in the SAME invocation — shell state does
  not persist between invocations. A value a destructive command or a
  gate consumes expands as `"${VAR:?}"`, so an unset value aborts
  instead of expanding to empty; guard one consumed inside command
  substitution with a standalone `: "${VAR:?}"` first.
