---
name: nested-agents
description: Guardrails for spawning nested sub-agents from inside a Team pipeline agent (Claude Code >= 2.1.172) — loaded by researcher, implementer, code-reviewer, and security-reviewer. Nested dispatch is a context-economy optimization, never a dependency.
user-invocable: false
---

# Nested Sub-Agents — Guardrails

You are a Team pipeline agent that has been granted the `Agent` tool. The
orchestrator (the main session) dispatched you. You may dispatch helpers one
level further down. These rules are non-negotiable.

## Optimization, never a dependency

Nested spawning is new (Claude Code >= 2.1.172) and may be absent or capped
differently in the user's version. If the `Agent` tool is missing from your
toolset, a dispatch errors, or results never arrive: **do the work yourself
inline** with your other tools and proceed. Never stall, and never report
failure solely because nesting was unavailable.

## Version gate — confirm before the first nested dispatch

Nested dispatch requires **Claude Code >= 2.1.172**. Below that floor the
platform does not grant a sub-agent the `Agent` tool at all, so your
**universal gate is tool presence**: if `Agent` is not in your toolset,
nesting is unavailable — do the work yourself inline per the rule above. This
gate needs no command and holds for every agent, including read-only ones that
have no `Bash` tool.

When you also hold the `Bash` tool, make sure of the running version with
the bundled deterministic check. It pins the exact floor, rather than trust
tool presence alone:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/nested-agents/supports-nesting.mjs" "$(claude --version)"
```

It prints `supported` and exits `0` at or above the floor, or `unsupported`
and exits non-zero otherwise. The check is **fail-closed**: an older
release, unrecognizable version output, or an environment where you cannot
run the check all count as `unsupported`. On any non-zero result — i.e.
whenever the version is less than 2.1.172 or undeterminable —
**do not spawn helpers. Do the work yourself inline.** Run the gate once. A
`supported` result holds for the rest of your turn.

## When to spawn vs. do it yourself (context economy)

Spawn a helper only when the side-quest would flood your context with
material you will not reference again. Examples are bulk file reading, a
trace through an unfamiliar subsystem, and a claim checked against many call
sites. If a handful of targeted Reads or Greps answers the question, do it
yourself. A sub-agent that saves no context is pure overhead.

## Read-only by default

Dispatch read-only helper types: the built-in `Explore`, the plugin's
`team:file-finder`, or `general-purpose` with an explicitly read-only prompt.
Nested helpers NEVER write files, NEVER commit, and NEVER write anything
under `docs/plans/` — artifacts are written only by you or the orchestrator.

## Depth budget

You are at depth 2 of 5. Spawn at most ONE more level: instruct every helper
to do its work directly and never to spawn further sub-agents.

## Nested helpers are non-interactive

Helpers never pause for user input — nothing a helper emits can reach
the user, and a helper that waits for an answer stalls forever. Never
delegate question-asking downward. If a helper surfaces an ambiguity,
absorb it and record it in YOUR own artifact's open-questions section
(or resolve it yourself and record the assumption).

## Verification helpers get neutral claims

When you use a helper to check your own finding, state the claim as a
neutral, falsifiable sentence with its `file:line`. Never give your verdict,
severity, or reasoning. Ask the helper to refute it with evidence. A helper
that knows your conclusion will anchor to it and verify nothing.

## Caps and ownership

- At most **4 helpers** in flight at once. Prefer parallel dispatch of
  independent helpers in a single message.
- Bound every helper's reply (e.g. "return <= 30 lines of file:line
  findings").
- You own everything you report. Spot-verify helper claims before including
  them. A helper's error in your output is your error.

## Prefer a follow-up over a respawn (scouts only)

A scout that has mapped a subsystem holds that map in its context. When you
hold the `SendMessage` tool and a further question falls inside ground a
live scout has already covered, message that scout by name instead of
spawning a cold one that re-reads everything. A follow-up counts against
the same in-flight caps and carries the same reply bound. Without
`SendMessage`, spawn fresh scouts as before — the follow-up path is an
optimization, never a dependency.

**Skeptics are the exception — one skeptic per claim, always fresh.**
Fresh context is the skeptic's mechanism, not an implementation detail: a
skeptic that has judged your earlier claims accumulates a model of your
review and anchors to it, which is exactly what the neutral-claim rule
exists to prevent. Never send a second claim to a live skeptic, even where
a follow-up would be cheaper.

## Per-agent caps

### `researcher` — exploration scouts

Fan out read-only exploration when the questions cluster into independent
areas, or when `repos.md` lists multiple repos.

- **Scout types:** `team:file-finder` (locate files) or the built-in
  `Explore` agent (read-only tracing). Nothing else.
- **The isolation invariant extends downward.** A scout's prompt may contain
  ONLY: question text copied verbatim from `questions.md`, the "Codebase
  context" section, and repo slugs/paths from `repos.md`. Never add your own
  framing, never mention `task.md`, never speculate about intent inside a
  scout prompt. A scout that learns the goal is the same pipeline defect as
  you learning it.
- **When:** only if a cluster requires reading more material than you will
  quote in your findings. For one or two pointed questions, read the files
  yourself.
- **Caps:** at most 4 scouts, dispatched in parallel where independent. Each
  instructed to return <= 30 lines of file:line findings and to spawn no
  further agents. Your 100-line report budget applies to the combined output.
- **Follow-ups obey the same isolation invariant.** A message to a live
  scout is a scout prompt: verbatim question text, "Codebase context"
  material, and repo slugs/paths — nothing else, same as the first
  dispatch.

### `code-reviewer` and `security-reviewer` — skeptic passes

A false hard-gate finding costs an entire review round: an implementer
re-dispatch plus a fresh run of all 5 reviewers. A hard-gate finding is a
Blocking-tier `issue:` for the code-reviewer, or a CRITICAL or HIGH finding
for the security-reviewer. Before you finish one, hand it to a fresh skeptic
sub-agent through the `Agent` tool and try to get it refuted.

- Dispatch one `general-purpose` sub-agent per hard-gate finding (at most 4
  in flight. Batch any overflow into one dispatch).
- **State the claim neutrally** — file:line plus a falsifiable sentence. for
  the security-reviewer, a falsifiable sentence about exploitability. Never
  include your verdict, severity, or reasoning. Template:

  > Read <file> around line <n>. Claim: "<one-sentence falsifiable
  > statement, e.g. `user` may be null on the early-return path. Or, for
  > a security finding, user input from the `q` parameter reaches this
  > SQL string without parameterization>". Attempt to REFUTE this claim
  > with concrete evidence (guards, callers, sanitization, validation
  > layers, type definitions, tests). Reply REFUTED or CONFIRMED with
  > file:line evidence, <= 10 lines. If your evidence is inconclusive,
  > reply CONFIRMED. Do not write files or spawn agents.

- **A rule-violation claim carries the rule.** Withholding your verdict and
  severity is right — those are conclusions the skeptic must reach on its own.
  The rule you are citing is neither. It is the thing that makes the claim
  falsifiable at all, and a claim stripped of it becomes a different, weaker
  claim that the skeptic will answer correctly and uselessly. "This comment
  carries a plan/slice marker, which `engineering-standards` bans" is
  checkable. "This comment references a plan phase" is just an observation,
  and any skeptic will find that observation true and unremarkable. Name the
  skill and the rule, never your judgment of how bad it is:

  > Read <file> around line <n>. Claim: "<what is there> violates <rule>,
  > stated in `skills/<skill>/SKILL.md`". Read that rule, then attempt to
  > REFUTE the claim: does the rule say what the claim says, and does this
  > code fall outside it — through a stated exemption, or because the rule
  > does not reach this case? Reply REFUTED or CONFIRMED with file:line
  > evidence, <= 10 lines. If your evidence is inconclusive, reply
  > CONFIRMED. Do not write files or spawn agents.

- **A stated rule outranks observed precedent.** The same pattern existing
  elsewhere in the tree does not refute a rule-violation claim. Precedent
  records what someone did; a rule records what is permitted, and the gap
  between them is exactly the debt a rule exists to stop growing. A skeptic
  that answers "this already appears on the default branch" has found more
  instances of the violation, not a defence of it. Only two things refute
  such a claim: the rule does not say what the claim says, or the code falls
  under an exemption the rule itself states. Where a repo convention and a
  written rule genuinely conflict, that is a finding for the report, not a
  refutation to act on alone.

  This cuts against the system-fit lens in `skills/systems-thinking/SKILL.md`,
  which asks whether a change follows the conventions established elsewhere.
  Both hold, in this order: follow convention where no rule speaks, and follow
  the rule where one does.

- **Default-keep.** Drop or downgrade a finding ONLY when the skeptic
  returns REFUTED with evidence you verify yourself. Inconclusive means the
  finding stands — severity is never softened on an uncertain skeptic reply.
  The pass removes false positives. It must never remove a true positive.
  List refuted findings under a `### Refuted by verification` section of
  your report (auditable, not silently dropped).
- Skip the pass when there are no hard-gate findings or the Agent tool is
  unavailable — report findings as-is. The pass is an optimization, never
  a dependency, and never a reason to soften a verdict.

### `implementer` — read-only scouts

Spawn a read-only scout when a slice touches a subsystem the plan does not
explain, and a map of it yourself would mean you read more than ~3 files you
will not edit. The scout absorbs the bulk reading and returns a short map,
keeping your context lean across slices.

- **Scout types:** the built-in `Explore` agent or `team:file-finder`.
- **Caps:** at most 2 scouts in flight. Each instructed to return <= 30
  lines of file:line findings and to spawn no further agents.
- **Overlap scouting with implementation.** Scouts run in the background:
  when the *next* slice touches unfamiliar ground, dispatch its scout
  while you finish the current slice and collect the map when that slice
  starts, rather than blocking on it.
- **Scouts never write, edit, or commit.** All code, tests, and commits
  remain yours. Never dispatch a sub-agent to implement a slice or to run
  the fix loop.
