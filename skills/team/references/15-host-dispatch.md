## Host-neutral agent dispatch

The pipeline is host-neutral. Team ships every specialist as a portable
definition at `agents/<name>.md`. The YAML frontmatter carries host metadata
(including Claude Code's optional fields); the body is a complete role prompt.
To run a phase, dispatch that definition through whatever subagent facility the
host provides. Read this reference before the first dispatch of a run.

A host runs the full pipeline when it can (a) read a file, (b) spawn a
subagent, and (c) run a shell command. Every supported host — Claude Code,
Codex CLI, Antigravity CLI, and OpenCode — qualifies. Resolve every dispatch in
this order:

1. **Named agent.** If the host resolves Team agents by name (Claude Code
   registers `team:<name>`), dispatch the named agent. This is preferred: the
   host applies the definition's tool and permission restrictions directly.
2. **Body-load subagent.** Otherwise, read `agents/<name>.md`, strip the YAML
   frontmatter, and spawn a fresh subagent of the host's general-purpose type
   with the body as its role instructions, plus the same artifact-path payload
   the named path receives. Preserve the body byte-for-byte; frontmatter is the
   only part removed. Fresh-context isolation is identical to the named path.
3. **Inline fallback.** If the host cannot spawn a subagent, run a **producer**
   agent's body in the orchestrator's own context. Never run a **reviewer**
   inline: a reviewer sharing the author's context cannot judge it, so the
   generator/evaluator invariant is unsatisfiable. Stop and report instead
   (`principle-generator-evaluator`).

Capability mapping for the body-load path:

- **Model tier.** `model:` is a tier key (`opus`, `sonnet`, `haiku`), not a
  literal model name. Resolve it through the host's tier map when one exists
  (`.team/config.json` carries the host-neutral map); otherwise use the host's
  default model and record the substitution in the run report.
- **Tools.** Grant the subagent only the tools named in the definition's
  `tools:`. Reviewers receive no `Write` or `Edit` tool and no shell mutation
  (`principle-least-privilege`, `principle-generator-evaluator`).
- **Preloaded skills.** Hosts that honor the `skills:` YAML block inject those
  skill names automatically. On hosts that do not, name the definition's
  preloaded skill paths in the dispatch payload so the subagent reads them
  before it acts.
- **Permission mode.** Map a reviewer's `permissionMode: plan` to the host's
  read-only mode where one exists; where none exists, the tool grant above is
  the enforcement, and the orchestrator verifies the subagent holds no mutating
  tool before dispatch.

Dispatch independent agents concurrently — RESEARCH's pair, IMPLEMENT's five
reviewers — up to the host's concurrent-subagent cap. Batch the fan-out when it
exceeds the cap; never serialize reviewers for convenience. Every dispatch must
return to the orchestrator in full. A host mode that returns only a truncated
notice and holds the body elsewhere loses a return-only agent's entire output
(see "Where a phase agent's output lives").

The body-load payload is the same for every phase: the agent body, the
canonical artifact directory, and the predecessor artifact paths the phase
table names. The orchestrator never adds the user's original description
downstream of QUESTION, and never adds the implementer's account of its own
work to a reviewer's payload.
