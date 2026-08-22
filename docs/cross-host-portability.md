---
title: Cross-host portability
description: "A capability matrix mapping Team's Claude Code plugin primitives onto the other hosts it runs on — Codex CLI and Antigravity CLI — and the portability strategy chosen for them."
audience: [developer]
nav_order: 9
nav_label: portability
---

# Cross-host portability

> **What this is.** A portability study. It shows how Team's Claude Code plugin
> primitives map onto Codex CLI, and gives the strategy we chose to support
> that host alongside Claude Code. Team also runs on
> [Antigravity CLI](#antigravity-cli), which needed no porting strategy: it
> installs Team from a local checkout through a manifest of its own, like the
> other hosts. It is a decision document, not a code change. The source issue is
> [#50](https://github.com/bostonaholic/team/issues/50). Two epics consume it:
> the [#57](https://github.com/bostonaholic/team/issues/57) Codex port, which
> builds against the matrix, the gap analysis, and the "what #57 builds
> against" section below, and the
> [#56](https://github.com/bostonaholic/team/issues/56) Antigravity backend,
> which builds against the Antigravity CLI host facts.

> **Deprecated host (2026-08-13).** An earlier revision of this study scored a
> third host and handed it a port epic of its own. That Gemini CLI port was
> scored on 2026-06-27 and then dropped in favor of Antigravity CLI, which
> ships today. The port epic,
> [#56](https://github.com/bostonaholic/team/issues/56), was retargeted at the
> Antigravity CLI as an alternate model backend rather than closed. The matrix
> below scores the surviving hosts only.

## Contents

- [Current state](#current-state)
- [Desired end state](#desired-end-state)
- [Patterns to follow](#patterns-to-follow)
- [The capability matrix](#the-capability-matrix)
- [Gap analysis](#gap-analysis)
- [Decisions made](#decisions-made)
- [What #57 builds against](#what-57-builds-against)
- [Antigravity CLI](#antigravity-cli)
- [Out of scope](#out-of-scope)
- [Edge cases](#edge-cases)
- [Open questions (deferred to the port epic)](#open-questions-deferred-to-the-port-epic)
- [Risks](#risks)

## Current state

Team is a Claude Code-native plugin. It ships 13 agents (`agents/*.md`), 56 skills
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
`skills:` injection. Antigravity CLI's shim already ships: the root
`plugin.json` manifest, which the host resolves with `skills/` and `agents/`
beside it. A Codex build emits `.codex/` with config.toml or hooks.json and
`agents/*.md`. Skills need no build step on Codex, which discovers
`.claude-plugin/plugin.json` and loads `skills/` directly.
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
matrix that lets epic #57 build it. The epic targets **full parity** against
named, tracked host risks. Full parity means all four hook events, parallel and
nested subagents, and structured returns.

## Patterns to follow

- **Runtime vs. development split** (`CLAUDE.md`, `docs/architecture.md`). Only
  the distributed set ports: `agents/`, `skills/*/SKILL.md` + `registry.json` +
  the bundled skill scripts (`supports-nesting.mjs`, `ste-lint.mjs`,
  `external-review.mjs`, `resolve-transcript.mjs`, `write-target.mjs`),
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
  which is Markdown with YAML frontmatter, carries the same *system-prompt body*
  Codex reads through its TOML agent roles. The body ports. The frontmatter and
  TOML binding does not.
- **The JSON-envelope convention is host-agnostic by construction**
  (`skills/agent-open-questions/SKILL.md`). It layers on whatever result channel
  the host gives: final-text on Claude, `--output-schema` on Codex.

## The capability matrix

The matrix maps each Team primitive against each host. Each cell holds one of
three values. **native** means a direct host equivalent. **workaround** means a
documented alternate mechanism reaches it. **hard gap** means the host has no
facility, so the design must work around it.

| Team primitive | Claude Code | Codex CLI |
|----------------|-------------|-----------|
| Agent/skill Markdown bodies | native (loaded as-is) | native (system-prompt body) |
| Custom slash entry points | native (SKILL.md auto-register) | native (built-ins and Skills. Prompts are deprecated in favor of Skills.) |
| On-demand SKILL.md injection | native (`skills:` + auto-load) | native (`.agents/skills/SKILL.md`, description-matched implicit invocation) |
| Subagent dispatch (parallel) | native (Agent/Task tool) | native (`spawn_agent`/`wait_agent`…, `features.multi_agent`) |
| Nested subagents | native (depth 2, ≤4, read-only) | workaround: `max_depth=1`, nesting capped one level |
| Structured agent→caller output | native (final-text JSON envelope) | native and strongest (`--output-schema` JSON Schema). A silent-drop bug under tools ([codex#15451](https://github.com/openai/codex/issues/15451)) was fixed April 2026 |
| `PreToolUse` hook | native | native (`PreToolUse`) |
| `PostToolUse` hook | native | native (`PostToolUse`) |
| `SessionStart` hook | native | native (`SessionStart`) |
| `PreCompact` hook | native | native (`PreCompact`, + `PostCompact`) |
| Hook stdin/stdout JSON contract | native (Claude schema) | workaround: own schema, mirrors Claude closely (`permissionDecision:"deny"`/exit 2) |
| Plugin-root / project-dir env vars | native (`${CLAUDE_PLUGIN_ROOT}`, `CLAUDE_PROJECT_DIR`) | workaround: no equivalent, so resolve through `.codex/` trust + config |
| Always-on project context | native (CLAUDE.md) | native (AGENTS.md) |
| MCP tools | native | native (stdio/HTTP, OAuth, per-tool approval) |
| MCP prompts-as-slash-commands | native | **hard gap**: MCP prompts unsupported client-side, so route through Skills |
| MCP resources | native | native (`read_mcp_resource`/`list_mcp_resources`) |
| Manifest / binding format | `.claude-plugin/plugin.json` | `config.toml`/`hooks.json` + `.codex/` |
| Per-project config (host-neutral) | `.team/config.json` (plain JSON, read by portable core) | `.team/config.json` (same file, unchanged) |
| Abstract model tier → host model | native (`model:` is a literal Claude model) | workaround: resolve tier through `.team/config.json` map |

Antigravity CLI is not a third column. Only some of these rows are settled for
it — manifest layout, skill and agent discovery, naming, hooks — while the MCP
group and the hook JSON contract are not, and a column that said "unknown" two
thirds of the way down would look scored without being scored. What is settled
is in [its own section](#antigravity-cli); the rest sits in
[open questions](#open-questions-deferred-to-the-port-epic).

Reading the matrix: every row that Team's *behavior* depends on is native or
workaround on Codex CLI. There is no hook-event gap. All four events map
natively, and on-demand skills, subagents, MCP tools, and MCP resources are
native. The one remaining hard gap is narrow. Codex does not surface MCP
**prompts** as slash commands. Its MCP tools and resources are fine. It also has
a clean detour: route slash entry through Codex Skills, below.

> The landscape is recent. As of mid-2026 Codex CLI ships a full hooks system,
> parallel subagents, custom slash commands, on-demand skills, MCP, and
> structured headless output. Earlier (2025) write-ups that treated these as
> hard gaps are stale. Codex's hooks and multi-agent are young, rolled out March
> to May 2026 across v0.114-v0.129 (latest v0.142.3). See the recency risk in
> the gap analysis.

## Gap analysis

After verifying every capability against the host repos (2026-06-27), the gap
picture is narrower than the earlier draft assumed. One hard gap remains, plus a
cross-cutting recency caveat:

1. **Codex does not expose MCP *prompts* as slash commands (hard gap).** Codex MCP
   supports tools and resources (`read_mcp_resource` and `list_mcp_resources`). It
   does not support MCP prompts. "MCP-prompts-as-slash-commands" thus does not
   work on Codex. The workaround for #57 is to route every slash-style entry
   point through Codex Skills, the documented successor to deprecated custom
   prompts, and not through MCP. This is why the chosen strategy does not depend
   on MCP (decision 4).

2. **Recency risk.** This is cross-cutting rather than a primitive gap. Codex's
   hooks and multi-agent are young. They rolled out from March to May 2026
   across v0.114-v0.129 (latest v0.142.3). Treat its contracts as moving
   targets. The shim layer (decision 1) absorbs breaking changes in one place.
   The mitigation and version-pinning policy are tracked in the
   [risk register](#risks).

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
     (three manifest formats ship today — Claude Code's, Codex's, and
     Antigravity's — atop per-host hook schemas and still-moving host APIs),
     while the stable, valuable surface, the 64 agent/skill bodies and 4 hook
     logic files, is *already portable*. The hybrid boundary lines up with the
     natural portable/non-portable seam, so it minimizes both duplication and the
     blast radius of churn.
   - *Serves whom:* Team's maintainer and the #56/#57 epic implementers. They
     edit behavior once and re-bind per host, instead of maintaining a drifting
     copy per host.

2. **Rejected: single source of truth plus a full transpile/build.** One canonical
   set. A build step emits a complete package per host. *Why rejected:* it forces
   the build to fully model three divergent manifest/agent/command formats —
   Claude Code's, Codex's, and Antigravity's — the youngest of which (Codex's)
   are still moving. The upfront modeling cost is high and the build itself
   becomes the highest-churn artifact, since every host API change breaks the
   transpiler. The hybrid keeps the same DRY core *without* committing to a
   total-coverage transpiler. Shims can stay hand-written where generation does
   not pay. The hybrid can generate shims later where it pays, making it a strict
   superset of this option's value with less risk.

3. **Rejected: per-host maintained adapters (parallel hand-maintained trees).**
   *Why rejected:* it costs 3× the maintenance across 13 agents, 56 skills, and 4
   hooks, one tree per shipped host — Claude Code, Codex CLI, and Antigravity
   CLI. It also guarantees drift, because someone must apply a fix to an agent
   body three times by hand. It throws away the fact that the bodies are *already
   portable*. The hybrid keeps most of its only advantage, a fully idiomatic host,
   because host idiom lives in the shim layer anyway.

4. **MCP is documented as a bridge, not adopted as the strategy's mechanism.**
   The matrix records MCP's reach on Codex: tools and resources, but not
   prompts-as-slash. The chosen path is native per-host bindings, and MCP is a
   documented fallback to revisit only if a native binding proves insufficient.
   *Why:* Codex MCP carries tools and resources but not prompts, so MCP can
   never be the *uniform* slash-command layer. Leaning on it would force a split
   path anyway while adding a server dependency. Keeping it as fallback preserves
   the option without coupling the strategy to it.

5. **Parity target for #57: full hook and subagent parity**, not MVP-first.
   The epic targets all four hook events, parallel **and** nested subagents, and
   structured returns before it declares the work done. This raises the bar
   against the young-API and open-bug risk. The design thus confronts those risks
   directly rather than defer them by a cut in scope. See the risks and "what
   #57 builds against" below.

6. **Per-project configuration lives in a host-neutral `.team/config.json`.** The
   [Desired end state](#desired-end-state) specifies the artifact and its
   relationship to the per-host manifests. It also specifies the host-agnostic
   settings the artifact holds: the model-tier to host-model map, host selection,
   per-host parallelism caps, and the multi-repo list.
   - *Why:* it pulls the one irreducibly host-varying value out of the portable
     definitions, since the agent `model:` frontmatter is a Claude-specific model
     name and meaningless on Codex, and puts it behind a single host-agnostic
     indirection, so the 64 agent/skill bodies never carry a host-specific model
     literal. The per-host shims *read* `.team/config.json`; they never restate
     it.

## What #57 builds against

The epic builds the hybrid core plus a per-host shim for its host, targeting
full parity. It starts from the matrix and works around the named gaps.

### #57. Codex port

- Bodies port as-is. Agent roles → TOML in `.codex/agents/` with the same
  system-prompt body.
- Skills port natively to `.agents/skills/SKILL.md` (description-matched implicit
  invocation).
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

## Antigravity CLI

Everything here is from `agy` 1.1.12 on macOS. The Codex CLI section comes from
vendor docs and host repos read on 2026-06-27, since that binary is not
installed here.

**This host installs Team natively, through its own manifest.** Team ships
`plugin.json` at the repo root, which is Antigravity's plugin marker, with
`skills/` and `agents/` beside it where this host resolves components.
`agy plugin install /path/to/team` then copies all 56 skills and all 13 agents
into `~/.gemini/config/plugins/team/`, and `import_manifest.json` records the
source as **`antigravity`** — its native path, the same local-checkout form the
Claude Code and Codex installs use.

The root manifest is what buys that. Without it, this host falls back to
recognizing `.claude-plugin/` and records the source as `claude-code`, importing
Team as a Claude Code plugin. That fallback works, but it makes Team's presence
here contingent on another host's manifest, and it is not the path this project
relies on. The manifest also cannot move into a directory of its own the way
`.claude-plugin/` and `.codex-plugin/` do, because components resolve as siblings
of the manifest — which is why Team carries a sixth version string at the repo
root.

**A local install can fail on a git fsmonitor socket.** The install copies the
whole tree, `.git` included, so a checkout with a running fsmonitor daemon fails
on `.git/fsmonitor--daemon.ipc`. A worktree is unaffected, because its `.git` is
a file, and installing from a URL clones fresh so the socket never exists.

**Discovery.**

- `plugin.json` has to sit at the plugin root, and `skills/`, `agents/`,
  `commands/`, `mcpServers/`, and `hooks/` all resolve beside that manifest. So
  `.claude-plugin/` and `.codex-plugin/` both validate and then discover nothing,
  and a manifest cannot redirect its component paths. That is why Team's
  Antigravity manifest is at the repo root rather than in a directory beside the
  other two.
- Given a root manifest, `agy` processed all 56 skills and all 13 agents.
- Skill discovery descends the tree but stops at any directory that owns a
  `SKILL.md`, so a skill cannot nest another skill.
- A symlinked skill folder is followed at plugin scope **and** at global scope.
- **A symlinked plugin root is discovered with no registration step.** A single
  link at `~/.gemini/config/plugins/team` pointing at a checkout put 52 Team
  skills in the agent's own skill list, with no entry in `import_manifest.json`.
  Team's dev install is that one link. A directory holding a hand-written
  `plugin.json` beside symlinked `skills/` and `agents/` works too; linking the
  root is preferred because the checkout already carries the manifest, so nothing
  has to be generated or kept in sync.
- `hooks/` is not discovered: this host registers hooks through a root
  `hooks.json`. `agents/` is discovered, and discovery is not dispatch — whether
  `agy` can dispatch an agent, and whether a structured return survives, has not
  been tested, which is why Team claims no pipeline support here.

**`disable-model-invocation` is honored.** With the plugin installed, the
probe (taken when the plugin shipped 54 skills, two of which set the key) had
the agent list 52 of them. The two missing ones were exactly `pr-rebase` and
`pr-watch-as-reviewer` — the skills that set the key **as of that probe**. The
guarded set has since grown to three: `reflect` sets it too, so this host
withholds that one as well. This host therefore keeps every guarded skill out
of the model's reach on its own, which is the opposite of Codex, and it is why
Team's install for this host withholds nothing and needs no post-install
removal step.

**Paths and naming.**

- The global plugin root is `~/.gemini/config/plugins/`. The global skill scope
  is `~/.gemini/config/skills/`; Team writes to neither by hand except through
  its dev install, which owns one directory under the former. `~/.gemini/` is
  this host's own config root, so that spelling is the host's fact, not a
  leftover to rename.
- The catalog name comes from a skill's frontmatter `name:`, never from the
  directory or link name. A link named `team-probe-gitcommit` was reported as
  `git-commit`. So this host applies **no `team:` prefix** and gives Team no
  namespace at the skill level, unlike Codex — even though the files themselves
  sit namespaced under a plugin directory.
- The `~/.agents/skills/` directory is invisible to `agy`. About fifty
  unrelated skills sat there on the probe machine and none appeared in the
  agent's list.
- From inside a Team checkout, `agy plugin list` printed "No imported plugins."
  and only the two built-in skills reached the agent's list. Plugin discovery
  keys on a `plugin.json` marker, so Codex's `.agents/plugins/marketplace.json`
  is not read as a workspace plugin and no collision exists between the two.

**Name collisions still resolve by precedence.** Bare names mean a skill of the
user's own can carry a Team name, and the host picks a winner silently. Team no
longer scans for that: it writes into its own plugin directory rather than into
the shared global skill directory, so it has nothing to warn about and no
authority over which copy wins. Built-in skills live inside the `agy` binary, so
no disk scan could enumerate them anyway. Whether a project's `.agents/skills/`
outranks the global scope **has not been confirmed** — the nearest evidence
points the other way, since about fifty skills in `~/.agents/skills/` were
invisible to `agy`.

**Scope.** Antigravity installs every skill and every agent, and the dev install
keeps a checkout's edits live. What is unproven is dispatch: the pipeline
commands install but are not claimed to run, and hooks, commands, and rules
remain unported on this host. That work stays with
[#56](https://github.com/bostonaholic/team/issues/56).

## Out of scope

- **Writing any of the port code.** #56 and #57 own the implementation. This is
  the study they build against.
- **Building the shim generator and build tooling.** The epic chooses if it
  generates the shims or hand-writes them (decision 1 permits both).
- **Porting the dev-only tree** (`.claude/`, `tests/`, `evals/`, `docs/`,
  `.github/`), which is never distributed and never ported.
- **Adopting MCP as a transport.** Documented as fallback only (decision 4).
- **Reduced-MVP parity.** Explicitly rejected: full parity is the target.
- **A fourth host.** Claude Code, Codex CLI, and Antigravity CLI are the three
  this study covers. Only the first two are scored in the matrix; Antigravity
  has its own section instead, because what is known about it covers one version
  rather than every primitive.
- **Guaranteeing host API stability.** The young-API recency risk is surfaced and
  assigned to the shim layer plus version pinning, not eliminated.

## Edge cases

These are the boundary conditions the *strategy and the downstream epic* must
handle.

- **Boundary: zero portable change in a body.** A host with an identical body
  format needs no transform. The shim is pure binding. The strategy must not
  force a transpile pass where copy suffices.
- **Boundary: a primitive with no host facility at all.** The one hard gap (Codex
  MCP prompts) has an explicit documented detour. Any *new* primitive Team adds
  must be matrix-checked before assuming it ports.
- **Invalid: host manifest schema drift.** A host changes its hook stdin schema.
  Chosen behavior: the schema adapter lives in the shim only. The `.mjs` core is
  untouched. This is the central reason for the hybrid boundary.
- **Failure: Codex pre-April-2026 silent schema drop.** On a Codex build before
  the [codex#15451](https://github.com/openai/codex/issues/15451) fix,
  `--output-schema` is ignored under active tools. Behavior: validate the returned
  shape and fall back to text-envelope parsing. It is fixed on current Codex, so
  this is a version-pin caveat.
- **Concurrency: nested-subagent depth mismatch.** Codex (`max_depth=1`) cannot
  match Claude's depth-2. Behavior: the orchestrator flattens or sequences nested
  work per host. This is a parity item rather than a silent capability drop.
- **Authorization: Codex `.codex/` trust gate.** Project-local hooks and agents
  load only when the directory is trusted. Behavior: the port's install docs must
  state the trust requirement. An untrusted directory skips hooks without warning.
  Skills bypass the gate entirely. Codex gates "project-local config, hooks, and
  exec policies" (`config/src/loader/mod.rs:912`) and skills are absent from that
  set, so a user-scope skill install is exposed to every session with no prompt.
- **Resource limit: Codex `agents.max_threads=6`.** Team's 5-reviewer parallel
  dispatch must fit the host's thread ceiling. Behavior: cap or batch reviewer
  dispatch per host.

## Open questions (deferred to the port epic)

- **Shim generation vs. hand-authoring.** Decision 1 permits both. Which to use
  is a structure-phase choice for #57.
- **Host version pinning policy.** Which exact Codex version the port certifies
  against (recency risk) is an implementation detail for the port epic.
- **Posture on the one open host issue ([codex#15250](https://github.com/openai/codex/issues/15250)).**
  The port epic makes the maintenance-posture call: upstream a fix, or only
  design around it. The other cited issue,
  [codex#15451](https://github.com/openai/codex/issues/15451), is already
  resolved upstream.
- **The full `.team/config.json` schema.** Decision 6 fixes its purpose and core
  fields: model-tier map, host, parallelism caps, and repos. The exhaustive
  schema, defaults, and validation are for the port epic to pin.

## Risks

- **Young-host-API risk (moderate).** Codex's hooks and multi-agent rolled out
  March to May 2026 (v0.114-v0.129, latest v0.142.3) and its contracts may still
  move. Mitigation: bindings isolated in shims, pin host versions, re-validate
  on upgrade. *(Capabilities verified against the host repos 2026-06-27. Issue
  statuses 2026-06-25.)*
- **[codex#15250](https://github.com/openai/codex/issues/15250) (open,
  moderate).** Custom agents are not always reachable from tool sessions, which
  hits Team's tool-heavy dispatch directly. It is the one live host bug, tracked
  for #57.
- **[codex#15451](https://github.com/openai/codex/issues/15451) (fixed April 2026,
  low).** Silent `--output-schema` drop under active tools, resolved upstream. It
  is a risk only on a pre-fix Codex pin, covered by shape validation plus a text
  fallback.
- **Hidden Claude Code assumptions (low to moderate).** Some agent prose may
  assume Claude-specific tool names or behaviors that the layer analysis did not
  catch. The port epic should audit bodies for host-specific references during
  structure.

## See also

- **[Architecture](architecture.md)**: the full plugin design these primitives are drawn from.
- **[#50](https://github.com/bostonaholic/team/issues/50)**: the source issue this study delivers.
- **[#57 Codex port](https://github.com/bostonaholic/team/issues/57)**: the epic that executes this matrix for Codex CLI.
- **[#56 Antigravity backend](https://github.com/bostonaholic/team/issues/56)**: the epic that runs the pipeline against the Antigravity CLI as an alternate model backend (formerly the Gemini CLI port).
