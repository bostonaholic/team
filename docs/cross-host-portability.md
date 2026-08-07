---
title: Cross-host portability
description: "A capability matrix mapping Team's Claude Code plugin primitives onto Gemini CLI and Codex CLI, and the chosen hybrid portability strategy."
audience: [developer]
nav_order: 9
nav_label: portability
---

# Cross-host portability

> **What this is.** A portability study. It shows how Team's Claude Code plugin
> primitives map onto Gemini CLI and Codex CLI. It also gives the strategy we
> chose to support all three hosts. It is a decision document, not a code change.
> The source issue is [#50](https://github.com/bostonaholic/team/issues/50). Two
> epics consume it: the [#56](https://github.com/bostonaholic/team/issues/56)
> Gemini port and the [#57](https://github.com/bostonaholic/team/issues/57) Codex
> port. They build against the matrix, the gap analysis, and the "what #56/#57
> build against" section below.

## Contents

- [Current state](#current-state)
- [Desired end state](#desired-end-state)
- [Patterns to follow](#patterns-to-follow)
- [The capability matrix](#the-capability-matrix)
- [Gap analysis](#gap-analysis)
- [Decisions made](#decisions-made)
- [What #56 and #57 build against](#what-56-and-57-build-against)
- [Out of scope](#out-of-scope)
- [Edge cases](#edge-cases)
- [Open questions (deferred to the port epics)](#open-questions-deferred-to-the-port-epics)
- [Risks](#risks)

## Current state

Team is a Claude Code-native plugin. It ships 13 agents (`agents/*.md`), 54 skills
(`skills/*/SKILL.md` + `registry.json`), and 3 hooks (`hooks/*.mjs`). They
register through `.claude-plugin/plugin.json`. The orchestrator walks the QRSPI
phase table (`skills/team/SKILL.md`). It persists state as artifact files under
`docs/plans/<id>/`. It coordinates agents through the Task tool and `SendMessage`
resume.

The portability surface splits cleanly. Four layers are already host-neutral:

- The Markdown bodies of every agent and skill. They are plain prose and use no
  Claude Code APIs.
- The `.mjs` hook *logic*. It uses the Node stdlib only, so `node:fs/promises`,
  `node:child_process`, `node:path`, and `node:url`, with zero npm deps.
- The artifact file I/O under `docs/plans/<id>/`.
- The agent→orchestrator JSON-envelope convention.

These layers move to any host unchanged.

The portability-blocking surface is the set of Claude Code-specific contracts.
There are four non-portable bindings:

1. **Hook event names and the stdin/stdout JSON contract.** The stdin schema
   (`tool_name`, `tool_input`, `cwd`), the stdout/stderr envelope
   (`hookSpecificOutput.{permissionDecision, additionalContext}`, `systemMessage`),
   and exit-code semantics.
2. **Host path env vars.** `${CLAUDE_PLUGIN_ROOT}`, interpolated into every hook
   command (`plugin.json:18,30,41,52`), and `CLAUDE_PROJECT_DIR`, read from the
   environment inside the hook bodies (`pre-compact-anchor.mjs:27`,
   `session-start-recover.mjs:31`, `post-write-validate.mjs:103`). The two use
   different mechanisms: manifest interpolation and runtime env lookup.
3. **Agent/Task tool dispatch**, plus `SendMessage` resume and depth/parallel
   nesting semantics.
4. **SKILL.md slash-command auto-registration**, plus `user-invocable`.

The host also interprets the agent frontmatter field semantics: `name`, `model`,
`tools`, `skills`, and `permissionMode`. Everything portable rides *on top of*
these four non-portable bindings. The `model:` field is a *Claude-specific model
name*. To make it portable, resolve it through host-neutral config. Do not bake a
literal into each definition. See `.team/config.json` under Desired end state.

## Desired end state

The end state is a single canonical "core" of host-neutral definitions, which
means the Markdown bodies and the Node hook logic, maintained once. Thin per-host
binding shims sit on top. Each shim translates the four blocking contracts into
its host's idiom. Claude Code keeps its current `.claude-plugin/plugin.json` and
`skills:` injection. A Gemini build emits `.gemini/` with settings.json hooks,
`agents/*.md`, `skills/*/SKILL.md`, and TOML commands. A Codex build emits
`.codex/` with config.toml or hooks.json and `agents/*.md`. Skills need no build
step on Codex, which discovers `.claude-plugin/plugin.json` and loads `skills/`
directly.
The high-churn binding layer stays isolated from the stable cores. A host API
change thus touches one shim, not 68 definition files.

Per-project configuration is host-neutral. Each project that uses Team carries one
`.team/config.json` at its root. It is plain JSON, part of the portable core, and
identical on every host. It declares the settings that would otherwise leak host
specifics into the definitions:

- The map from Team's abstract model tiers to the active host's concrete model
  IDs. The agent `model:` frontmatter becomes a *tier key*, not a literal Claude
  model name.
- Host selection.
- Per-host parallelism caps.
- The multi-repo list.

The per-host shims **read** this file. They never redefine it. It is the
host-neutral counterpart to the per-host manifests. Those manifests carry only
bindings. `.team/config.json` carries the host-agnostic project config.

This document does not build that end state. It is the strategy and capability
matrix that lets epics #56 and #57 build it. Each epic targets **full parity**
against named, tracked host risks. Full parity means all four hook events,
parallel and nested subagents, and structured returns.

## Patterns to follow

- **Runtime vs. development split** (`CLAUDE.md`, `docs/architecture.md`). Only
  the distributed set ports: `agents/`, `skills/*/SKILL.md` + `registry.json` +
  the bundled skill scripts (`supports-nesting.mjs`, `ste-lint.mjs`),
  `hooks/*.mjs`, `.claude-plugin/`. The entire `.claude/`
  tree, `tests/`, `evals/`, `docs/`, `.github/` never ship and are out of every
  port's scope.
- **A bundled skill script names its own directory, never a host variable.**
  `${CLAUDE_PLUGIN_ROOT}` exists on Claude Code alone, so a SKILL.md that
  interpolates it into a runnable command breaks on Codex, where the value is
  empty and the path resolves to `/skills/...`. Document the command with a
  `<skill-dir>` placeholder the caller substitutes, the pattern Codex's own
  bundled skills use, and keep the script free of relative imports and
  environment reads so it runs from any install path (`ste-lint.mjs` does both).
  `skills/nested-agents/SKILL.md:35` still interpolates the variable directly.
  That command is Claude-Code-only today, because the pipeline agents it serves
  cannot dispatch on Codex.
- **Hooks already isolate portable logic from host contract.** Each `.mjs` reads
  stdin, does Node-only work, then writes a host-shaped JSON result
  (`session-start-recover.mjs:236-244`, `post-write-validate.mjs:29-37`). The scan
  and git logic is the reusable core. Only the stdin field names and the result
  envelope are the binding. The shim layer mirrors this seam.
- **Agent definition format is already near-universal.** Claude `agents/*.md`,
  which is Markdown with YAML frontmatter, is structurally identical to Gemini
  `.gemini/agents/*.md`. Codex uses TOML agent roles, but the *system-prompt body*
  is the same prose. The body ports. The frontmatter and TOML binding does not.
- **The JSON-envelope convention is host-agnostic by construction**
  (`skills/agent-open-questions/SKILL.md`). It layers on whatever result channel
  the host gives: final-text on Claude and Gemini, `--output-schema` on Codex.

## The capability matrix

The matrix maps each Team primitive against each host. Each cell holds one of
three values. **native** means a direct host equivalent. **workaround** means a
documented alternate mechanism reaches it. **hard gap** means the host has no
facility, so the design must work around it.

| Team primitive | Claude Code | Gemini CLI | Codex CLI |
|----------------|-------------|------------|-----------|
| Agent/skill Markdown bodies | native (loaded as-is) | native (loaded as-is) | native (system-prompt body) |
| Custom slash entry points | native (SKILL.md auto-register) | native (TOML in `.gemini/commands/`) | native (built-ins and Skills. Prompts are deprecated in favor of Skills.) |
| On-demand SKILL.md injection | native (`skills:` + auto-load) | native (`.gemini/skills/SKILL.md`, progressive disclosure through `activate_skill`) | native (`.agents/skills/SKILL.md`, description-matched implicit invocation) |
| Subagent dispatch (parallel) | native (Agent/Task tool) | native (`.gemini/agents/*.md`, parallel) | native (`spawn_agent`/`wait_agent`…, `features.multi_agent`) |
| Nested subagents | native (depth 2, ≤4, read-only) | workaround: parallel yes, but subagents cannot spawn subagents | workaround: `max_depth=1`, nesting capped one level |
| Structured agent→caller output | native (final-text JSON envelope) | native at CLI (`--output-format json`/JSONL, shipped through [gemini-cli#8022](https://github.com/google-gemini/gemini-cli/issues/8022)). The subagent-return boundary is under-specified and unverified. | native and strongest (`--output-schema` JSON Schema). A silent-drop bug under tools ([codex#15451](https://github.com/openai/codex/issues/15451)) was fixed April 2026 |
| `PreToolUse` hook | native | native (`BeforeTool`) | native (`PreToolUse`) |
| `PostToolUse` hook | native | native (`AfterTool`) | native (`PostToolUse`) |
| `SessionStart` hook | native | native (`SessionStart`) | native (`SessionStart`) |
| `PreCompact` hook | native | native (`PreCompress`) | native (`PreCompact`, + `PostCompact`) |
| Hook stdin/stdout JSON contract | native (Claude schema) | workaround: own schema (`hook_event_name`, `decision`, exit 2), fields remap | workaround: own schema, mirrors Claude closely (`permissionDecision:"deny"`/exit 2) |
| Plugin-root / project-dir env vars | native (`${CLAUDE_PLUGIN_ROOT}`, `CLAUDE_PROJECT_DIR`) | workaround: no equivalent, so pass paths through hook config, argv, or stdin | workaround: no equivalent, so resolve through `.codex/` trust + config |
| Always-on project context | native (CLAUDE.md) | native (GEMINI.md) | native (AGENTS.md) |
| MCP tools | native | native (stdio/SSE/HTTP, OAuth) | native (stdio/HTTP, OAuth, per-tool approval) |
| MCP prompts-as-slash-commands | native | native (`/prompt-name --arg`) | **hard gap**: MCP prompts unsupported client-side, so route through Skills |
| MCP resources | native | native (`@server://path`) | native (`read_mcp_resource`/`list_mcp_resources`) |
| Manifest / binding format | `.claude-plugin/plugin.json` | `.gemini/settings.json` + commands TOML | `config.toml`/`hooks.json` + `.codex/` |
| Per-project config (host-neutral) | `.team/config.json` (plain JSON, read by portable core) | `.team/config.json` (same file, unchanged) | `.team/config.json` (same file, unchanged) |
| Abstract model tier → host model | native (`model:` is a literal Claude model) | workaround: resolve tier through `.team/config.json` map | workaround: resolve tier through `.team/config.json` map |

Reading the matrix: every row that Team's *behavior* depends on is native or
workaround on both hosts. There is no hook-event gap. All four events map
natively, and on-demand skills, subagents, MCP tools, and MCP resources are native
on all three hosts. The one remaining hard gap is narrow. Codex does not surface
MCP **prompts** as slash commands. Its MCP tools and resources are fine. It also
has a clean detour: route slash entry through Codex Skills, below.

> The landscape is recent, though not uniformly so. As of mid-2026 both Gemini
> CLI and Codex CLI ship a full hooks system. Both also ship parallel subagents,
> custom slash commands, on-demand skills, MCP, and structured headless output. Earlier (2025)
> write-ups that treated these as hard gaps are stale. Maturity differs. Gemini's
> extension surface has been stable since late 2025 (hooks around December 2025,
> subagents around August 2025, latest v0.49.0). Meanwhile Codex's hooks and
> multi-agent are younger, rolled out March to May 2026 across v0.114-v0.129
> (latest v0.142.3). See the recency risk in the gap analysis.

## Gap analysis

After verifying every capability against the host repos (2026-06-27), the gap
picture is narrower than the earlier draft assumed. One hard gap remains, plus a
cross-cutting recency caveat:

1. **Codex does not expose MCP *prompts* as slash commands (hard gap).** Codex MCP
   supports tools and resources (`read_mcp_resource` and `list_mcp_resources`). It
   does not support MCP prompts. "MCP-prompts-as-slash-commands" thus works on
   Gemini and not on Codex. The workaround for #57 is to route every slash-style
   entry point through Codex Skills, the documented successor to deprecated custom
   prompts, and not through MCP. This is why the chosen strategy does not depend
   on MCP (decision 4).

2. **Recency risk, Codex-weighted.** This is cross-cutting rather than a primitive
   gap. Gemini's extension surface is mature (hooks around December 2025 in
   v0.20-0.21, subagents around August 2025, latest v0.49.0) and is a low
   contract-churn risk. Codex's hooks and multi-agent are younger. They rolled out
   from March to May 2026 across v0.114-v0.129 (latest v0.142.3). Treat its
   contracts as moving targets. The shim layer (decision 1) absorbs breaking
   changes in one place. The mitigation and version-pinning policy are tracked in
   the [risk register](#risks).

> **Correction (2026-06-27).** An earlier draft listed a second hard gap: *"Gemini
> has no on-demand skill-injection analog."* Verification against the repo refuted
> it. Gemini CLI ships a full Agent Skills system (`.gemini/skills/SKILL.md`,
> progressive disclosure through the `activate_skill` tool), so Gemini ports skills
> natively, exactly like Codex. The fold-into-system-prompt workaround that draft
> proposed is no longer needed.

## Decisions made

1. **Chosen strategy: a hybrid.** It pairs a shared host-neutral core with thin
   per-host binding shims. The canonical core is the portable layer, maintained
   once. That layer holds the Markdown bodies, the Node hook logic, the artifact
   I/O, and the envelope convention. Per host, a thin shim gives only the four
   blocking bindings: (a) the manifest and config format. (b) the hook stdin and
   stdout schema adapter. (c) the plugin-root and project-dir env resolution. (d)
   the slash-entry registration. Each host can generate its shims or hand-write
   them. Either way they are small and isolated.
   - *Why:* the expensive, divergent, high-churn surface is exactly the bindings
     (three different manifest formats, three hook schemas, still-moving host
     APIs), while the stable, valuable surface, the 64 agent/skill bodies and 4
     hook logic files, is *already portable*. The hybrid boundary lines up with the
     natural portable/non-portable seam, so it minimizes both duplication and the
     blast radius of churn.
   - *Serves whom:* Team's maintainer and the #56/#57 port-epic implementers. They
     edit behavior once and re-bind per host, instead of maintaining three drifting
     copies.

2. **Rejected: single source of truth plus a full transpile/build.** One canonical
   set. A build step emits a complete Claude plugin, Gemini extension, and Codex
   package. *Why rejected:* it forces the build to fully model three divergent
   manifest/agent/command formats, the youngest of which (Codex's) are still
   moving. The upfront modeling cost is high and the build itself becomes the
   highest-churn artifact, since every host API change breaks the transpiler. The
   hybrid keeps the same DRY core *without* committing to a total-coverage
   transpiler. Shims can stay hand-written where generation does not pay. The
   hybrid can generate shims later where it pays, making it a strict superset of
   this option's value with less risk.

3. **Rejected: per-host maintained adapters (parallel hand-maintained trees).**
   *Why rejected:* it costs 3× the maintenance across 13 agents, 54 skills, and 4
   hooks. It also guarantees drift, because someone must apply a fix to an agent
   body three times by hand. It throws away the fact that the bodies are *already
   portable*. The hybrid keeps most of its only advantage, a fully idiomatic host,
   because host idiom lives in the shim layer anyway.

4. **MCP is documented as a bridge, not adopted as the strategy's mechanism.**
   The matrix records MCP's reach: tools and resources on both hosts,
   prompts-as-slash on Gemini only and not Codex. But the chosen path is native
   per-host bindings, and MCP is a documented fallback to revisit only if a native
   binding proves insufficient. *Why:* Codex MCP carries tools and resources but
   not prompts, so MCP can never be the *uniform* slash-command layer. Leaning on
   it would force a split path anyway while adding a server dependency. Keeping it
   as fallback preserves the option without coupling the strategy to it.

5. **Parity target for #56/#57: full hook and subagent parity**, not MVP-first.
   Each epic targets all four hook events, parallel **and** nested subagents, and
   structured returns before it declares the work done. This raises the bar
   against the young-API and open-bug risk. The design thus confronts those risks
   directly rather than defer them by a cut in scope. See the risks and "what
   #56/#57 build against" below.

6. **Per-project configuration lives in a host-neutral `.team/config.json`.** The
   [Desired end state](#desired-end-state) specifies the artifact and its
   relationship to the per-host manifests. It also specifies the host-agnostic
   settings the artifact holds: the model-tier to host-model map, host selection,
   per-host parallelism caps, and the multi-repo list.
   - *Why:* it pulls the one irreducibly host-varying value out of the portable
     definitions, since the agent `model:` frontmatter is a Claude-specific model
     name and meaningless on Gemini or Codex, and puts it behind a single
     host-agnostic indirection, so the 64 agent/skill bodies never carry a
     host-specific model literal. The per-host shims *read* `.team/config.json`;
     they never restate it.

## What #56 and #57 build against

Both epics build the hybrid core plus a per-host shim for their host, targeting
full parity. Each starts from the matrix and works around the named gaps.

### #56. Gemini port

- Bodies port as-is. Agent frontmatter → `.gemini/agents/*.md` (structurally
  identical format).
- Skills port natively to `.gemini/skills/SKILL.md` (progressive disclosure
  through the `activate_skill` tool). As with Codex, no folding into system
  prompts is needed.
- Hooks: reuse the 4 `.mjs` logic files. The shim adapts stdin/stdout to Gemini's
  schema (`hook_event_name`, `decision`, exit 2) and maps events
  `PreToolUse→BeforeTool`, `PostToolUse→AfterTool`, `SessionStart→SessionStart`,
  `PreCompact→PreCompress`. Register in `.gemini/settings.json`.
- Slash entry points → TOML in `.gemini/commands/`.
- Env: replace `${CLAUDE_PLUGIN_ROOT}`/`CLAUDE_PROJECT_DIR` with paths passed
  through hook config/argv.
- Config: model tiers resolve through `.team/config.json`. Map Team's tiers to
  concrete Gemini model IDs. Read the `model:` frontmatter as a tier key, not as a
  literal model name.
- **Known hazards to track:**
  - The structured subagent-return boundary is under-specified in public docs.
    Gemini's CLI-level structured output shipped
    ([gemini-cli#8022](https://github.com/google-gemini/gemini-cli/issues/8022),
    completed September 2025), but whether a *subagent* can return structured JSON
    to its orchestrator is unconfirmed (no tracking issue). The envelope convention
    works regardless (parse fenced JSON from text); full-parity structured returns
    must validate this path on the pinned Gemini version.
  - Nested subagents: Gemini subagents cannot spawn subagents. Full nesting parity
    (Claude's depth-2) requires the orchestrator to flatten or sequence what Team
    currently nests. Track it as a parity item rather than letting it drop
    silently.

### #57. Codex port

- Bodies port as-is. Agent roles → TOML in `.codex/agents/` with the same
  system-prompt body.
- Skills port natively to `.agents/skills/SKILL.md` (description-matched implicit
  invocation). No Gemini-style folding needed.
- Hooks: reuse the 4 `.mjs` files. The shim adapts to Codex
  `hooks.json`/`[hooks]`, whose schema mirrors Claude closely
  (`permissionDecision:"deny"`/exit 2). Events map nearly 1:1
  (`PreToolUse`/`PostToolUse`/`SessionStart`/`PreCompact`).
- Slash entry points → Codex Skills, not MCP (gap 1).
- Env: resolve through `.codex/` trust + config.toml.
- Config: model tiers resolve through `.team/config.json`. Map Team's tiers to
  concrete Codex or GPT model IDs. Read the `model:` frontmatter as a tier key.
  The per-host parallelism cap (`agents.max_threads=6`) also comes from config.
- **Known hazards to track:**
  - **[codex#15250](https://github.com/openai/codex/issues/15250) (open).** Custom
    agents are not always reachable from tool-backed sessions. Full subagent parity
    must verify dispatch works in Team's tool-heavy flows and track the issue.
  - **[codex#15451](https://github.com/openai/codex/issues/15451) (fixed April
    2026).** Silent `--output-schema` drop under active tools, resolved upstream
    (full detail in the [risk register](#risks)). Guard on a pre-fix Codex pin:
    validate output shape, fall back to text-envelope parse.
  - MCP prompts are a hard gap (tools and resources are native), so keep all
    prompt/slash workflows on Skills.

## Out of scope

- **Writing any of the port code.** #56 and #57 own the implementation. This is
  the study they build against.
- **Building the shim generator and build tooling.** Each epic chooses if it
  generates the shims or hand-writes them (decision 1 permits both).
- **Porting the dev-only tree** (`.claude/`, `tests/`, `evals/`, `docs/`,
  `.github/`), which is never distributed and never ported.
- **Adopting MCP as a transport.** Documented as fallback only (decision 4).
- **Reduced-MVP parity.** Explicitly rejected: full parity is the target.
- **A fourth host.** Only Claude Code, Gemini CLI, Codex CLI are in the matrix.
- **Guaranteeing host API stability.** The young-API recency risk is surfaced and
  assigned to the shim layer plus version pinning, not eliminated.

## Edge cases

These are the boundary conditions the *strategy and the downstream epics* must
handle.

- **Boundary: zero portable change in a body.** A host with an identical body
  format, such as Gemini agents, needs no transform. The shim is pure binding. The
  strategy must not force a transpile pass where copy suffices.
- **Boundary: a primitive with no host facility at all.** The one hard gap (Codex
  MCP prompts) has an explicit documented detour. Any *new* primitive Team adds
  must be matrix-checked before assuming it ports.
- **Invalid: host manifest schema drift.** A host changes its hook stdin schema.
  Chosen behavior: the schema adapter lives in the shim only. The `.mjs` core is
  untouched. This is the central reason for the hybrid boundary.
- **Failure: Gemini structured subagent return (unconfirmed).** If a subagent
  cannot return structured JSON, the envelope arrives as text. Behavior: parse
  fenced JSON from text (the convention already does this). This is not a tracked
  bug, since CLI structured output shipped
  ([gemini-cli#8022](https://github.com/google-gemini/gemini-cli/issues/8022)).
  Only the subagent boundary is unverified.
- **Failure: Codex pre-April-2026 silent schema drop.** On a Codex build before
  the [codex#15451](https://github.com/openai/codex/issues/15451) fix,
  `--output-schema` is ignored under active tools. Behavior: validate the returned
  shape and fall back to text-envelope parsing. It is fixed on current Codex, so
  this is a version-pin caveat.
- **Concurrency: nested-subagent depth mismatch.** Gemini (no nesting) and Codex
  (`max_depth=1`) cannot match Claude's depth-2. Behavior: the orchestrator
  flattens or sequences nested work per host. This is a parity item rather than a
  silent capability drop.
- **Authorization: Codex `.codex/` trust gate.** Project-local hooks and agents
  load only when the directory is trusted. Behavior: the port's install docs must
  state the trust requirement. An untrusted directory skips hooks without warning.
  Skills bypass the gate entirely. Codex gates "project-local config, hooks, and
  exec policies" (`config/src/loader/mod.rs:912`) and skills are absent from that
  set, so a user-scope skill install is exposed to every session with no prompt.
- **Resource limit: Codex `agents.max_threads=6`, Gemini parallel cap.** Team's
  5-reviewer parallel dispatch must fit each host's thread ceiling. Behavior: cap
  or batch reviewer dispatch per host.

## Open questions (deferred to the port epics)

- **Shim generation vs. hand-authoring, per host.** Decision 1 permits both. which
  to use is a per-epic structure-phase choice for #56/#57.
- **Host version pinning policy.** Which exact Gemini/Codex versions each port
  certifies against (recency risk) is an implementation detail for the port epics.
- **Posture on the one open host issue ([codex#15250](https://github.com/openai/codex/issues/15250)).**
  The port epics make the maintenance-posture call: upstream a fix, or only design
  around it. The other two cited issues,
  [gemini-cli#8022](https://github.com/google-gemini/gemini-cli/issues/8022) and
  [codex#15451](https://github.com/openai/codex/issues/15451), are already
  resolved upstream.
- **The full `.team/config.json` schema.** Decision 6 fixes its purpose and core
  fields: model-tier map, host, parallelism caps, and repos. The exhaustive
  schema, defaults, and validation are for the port epics to pin.

## Risks

- **Young-host-API risk, Codex-weighted (moderate).** Codex's hooks and
  multi-agent rolled out March to May 2026 (v0.114-v0.129, latest v0.142.3) and
  its contracts may still move. Gemini's surface has been stable since late 2025
  (latest v0.49.0) and is lower risk. Mitigation: bindings isolated in shims, pin
  host versions, re-validate on upgrade. *(Capabilities verified against the host
  repos 2026-06-27. Issue statuses 2026-06-25.)*
- **[codex#15250](https://github.com/openai/codex/issues/15250) (open,
  moderate).** Custom agents are not always reachable from tool sessions, which
  hits Team's tool-heavy dispatch directly. It is the one live host bug, tracked
  for #57.
- **[codex#15451](https://github.com/openai/codex/issues/15451) (fixed April 2026,
  low).** Silent `--output-schema` drop under active tools, resolved upstream. It
  is a risk only on a pre-fix Codex pin, covered by shape validation plus a text
  fallback.
- **Gemini structured subagent return (unverified, low to moderate).** There is no
  backing issue. CLI structured output shipped
  ([gemini-cli#8022](https://github.com/google-gemini/gemini-cli/issues/8022),
  completed September 2025). #56 must make sure that the subagent-return boundary
  works on the pinned version.
- **Hidden Claude Code assumptions (low to moderate).** Some agent prose may
  assume Claude-specific tool names or behaviors that the layer analysis did not
  catch. The port epics should audit bodies for host-specific references during
  structure.

## See also

- **[Architecture](architecture.md)**: the full plugin design these primitives are drawn from.
- **[#50](https://github.com/bostonaholic/team/issues/50)**: the source issue this study delivers.
- **[#56 Gemini port](https://github.com/bostonaholic/team/issues/56)**: the epic that executes this matrix for Gemini CLI.
- **[#57 Codex port](https://github.com/bostonaholic/team/issues/57)**: the epic that executes this matrix for Codex CLI.
