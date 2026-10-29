## Agent dispatch

Every specialist ships as a portable definition at `agents/<name>.md`: YAML
frontmatter carries host metadata; the body is a complete role prompt. A skill
step with no named agent runs in a fresh general subagent per
[step delegation](step-delegation.md).

Before every named or body-loaded dispatch, resolve the installed plugin root
and `agents/<name>.md`. Claude uses `${CLAUDE_PLUGIN_ROOT}`. Codex and
Antigravity derive the root from the loaded skill's absolute path. OpenCode
uses its canonical realpath base. Never resolve from the consumer checkout.

Read the definition and resolve its applicable resource links before work.
Pass the absolute root, definition path, resource paths, canonical artifact
directory, and predecessor paths (the phase table's, or for CODE REVIEW and
SECURITY REVIEW the intent paths `team-code-review` or `team-security-review`
names) in both dispatch forms; the receiver
reads those resources before acting. Never add the user's original description
downstream of QUESTION, or the implementer's account of its own work to a
reviewer's payload.
Resolve skill links from the loaded `SKILL.md` directory and agent links from
the installed definition's directory. A resource's explicitly local template
link resolves beside that resource. Read conditional templates only when needed.
Include [execution rules](references/execution.md) for every multi-step Team agent, including retries and review-fix dispatch. File-finder remains single-step.
Keep remaining skill preloads. Do not crawl links or preload the resource tree.
If any required read fails, stop its consuming step and report the resolved path.
Never substitute a source-checkout file for a missing installed resource.
Standalone agents use their own installed definition path and the same reads;
a host that does not expose that path must have its dispatcher supply it.

Each spawned child, named or body-loaded, starts with a
[fresh context window](step-delegation.md#fresh-context) that holds only its
payload, never a fork of the dispatcher's conversation. A host that can start
only a forked child cannot spawn, so step 3 applies.

Resolve every dispatch in this order:

1. **Named agent.** If the host resolves Team agents by name (Claude Code
   registers `team:<name>`), dispatch the named agent; the host then applies
   the definition's tool and permission restrictions. Codex and Antigravity
   use the body-load path so their explicit model selections apply at spawn.
2. **Body-load subagent.** Otherwise, read `agents/<name>.md`, strip the YAML
   frontmatter, and spawn a fresh subagent of the host's general-purpose type
   with the body, byte-for-byte, as its role instructions, plus the same
   payload the named path receives.
3. **Inline fallback.** If the host cannot spawn a subagent, run a **producer**
   agent's body in the orchestrator's own context. Never run a **reviewer**
   inline; stop and report instead ([independent review rules](principles/independent-review.md)).
   The RESEARCH phase dispatch of `file-finder` and `researcher`, from the
   `/team` orchestrator or from `/team-research`, never runs inline either.
   Stop and report the host limitation and the artifact directory, because
   the dispatcher's context holds the task framing. A nested
   `team:file-finder` scout is a different dispatch, so its parent keeps the
   inline fallback in [agent dispatch](agent-dispatch.md).

Capability mapping for the body-load path:

- **Model selection.** On Codex or Antigravity, follow
  [model selection](model-selection.md) before stripping frontmatter. Other
  hosts use their default model and record the substitution.
- **Tools.** Grant only the tools named in the definition's `tools:`.
  Reviewers receive no `Write` or `Edit` tool and no shell mutation
  ([independent review rules](principles/independent-review.md)).
- **Preloaded skills.** Where the host ignores the `skills:` YAML block, name
  the definition's preloaded skill paths in the payload for the subagent to
  read before it acts.
- **Permission mode.** Map a reviewer's `permissionMode: plan` to the host's
  read-only mode where one exists. Otherwise, and on Claude Code (which
  ignores `permissionMode` for plugin agents and under an auto, `acceptEdits`,
  or `bypassPermissions` main session), the tool grant is the only
  enforcement, and the orchestrator verifies the subagent holds no mutating
  tool before dispatch. The CODE REVIEW and SECURITY REVIEW tree checks detect
  a reviewer's shell mutation.

Dispatch independent agents concurrently (RESEARCH's pair, CODE REVIEW's four
reviewers) up to the host's concurrent-subagent cap; batch beyond the cap, and
never serialize reviewers for convenience. Every dispatch must return to the
orchestrator in full (see "Where a phase agent's output lives").
