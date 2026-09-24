## Agent dispatch

Team ships every specialist as a portable definition at `agents/<name>.md`.
The YAML frontmatter carries host metadata (including Claude Code's optional
fields); the body is a complete role prompt. To run a phase, dispatch that
definition through the host's subagent facility.

Before every named or body-loaded dispatch, resolve the installed plugin root
and `agents/<name>.md`. Claude uses `${CLAUDE_PLUGIN_ROOT}`. Codex and
Antigravity derive the root from the loaded skill's absolute path. OpenCode
uses its canonical realpath base. Never resolve from the consumer checkout.

Read the definition and resolve its applicable resource links before work.
Pass the absolute root, definition path, resource paths, and predecessor paths
in both dispatch forms. The receiver reads those resources before acting.
Resolve skill links from the loaded `SKILL.md` directory and agent links from
the installed definition's directory. A resource's explicitly local template
link resolves beside that resource. Read conditional templates only when needed.
Include [execution rules](references/execution.md) for every multi-step Team agent, including retries and review-fix dispatch. File-finder remains single-step.
Keep remaining skill preloads. Do not crawl links or preload the resource tree.
If any required read fails, stop its consuming step and report the resolved path.
Never substitute a source-checkout file for a missing installed resource.

Standalone agents use their own installed definition path and the same reads.
If the host does not expose that path, its dispatcher must supply it before work.

Resolve every dispatch in this order:

1. **Named agent.** If the host resolves Team agents by name (Claude Code
   registers `team:<name>`), dispatch the named agent. This is preferred: the
   host applies the definition's tool and permission restrictions directly.
   Codex and Antigravity use the body-load path so their explicit model
   selections are applied at spawn instead of reading Claude frontmatter.
2. **Body-load subagent.** Otherwise, read `agents/<name>.md`, strip the YAML
   frontmatter, and spawn a fresh subagent of the host's general-purpose type
   with the body as its role instructions, plus the same artifact-path payload
   the named path receives. Preserve the body byte-for-byte; frontmatter is the
   only part removed.
3. **Inline fallback.** If the host cannot spawn a subagent, run a **producer**
   agent's body in the orchestrator's own context. Never run a **reviewer**
   inline. Stop and report instead
   ([independent review rules](principles/independent-review.md)).

Capability mapping for the body-load path:

- **Model selection.** Before stripping frontmatter or spawning on Codex or
  Antigravity, follow [model selection](model-selection.md): run the installed
  resolver, apply its host arguments, and report runtime resolution separately
  from the requested tier. Claude named agents retain their native frontmatter.
  Other hosts use their default model and record the substitution.
- **Tools.** Grant the subagent only the tools named in the definition's
  `tools:`. Reviewers receive no `Write` or `Edit` tool and no shell mutation
  ([independent review rules](principles/independent-review.md)).
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
notice loses a return-only agent's entire output (see "Where a phase agent's
output lives").

The body-load payload is the same for every phase: the agent body, the
canonical artifact directory, and the predecessor artifact paths the phase
table names. The orchestrator never adds the user's original description
downstream of QUESTION, and never adds the implementer's account of its own
work to a reviewer's payload.
